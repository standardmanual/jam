import { NextRequest, NextResponse, after } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isUserNearPoi, haversineDistance, DROP_RADIUS_METERS } from '@/lib/poi/proximity'
import { fetchNearbyNaverPoisForCategories, type NaverPlace } from '@/lib/poi/naver'
import { reverseGeocodeToRegionName } from '@/lib/poi/reverse-geocode'
import { loadPipelineCategories, LEVEL_2_FALLBACK_THRESHOLD, type PoiCategoryConfig } from '@/lib/poi/categories'
import { computeGridKey, shouldSearch, markSearched } from '@/lib/poi/search-cache'
import { resolvePoiRadiusMeters } from '@/lib/poi/radius-policy'
import type { PoiRow, InventoryItemRow } from '@/types/database'

// GET /api/drops?lat=&lng=  — T1(DB) + T2(네이버 지역검색, 카테고리 레벨 기반) 통합
// POST /api/drops            — 드랍 실행

const NAVER_RADIUS_M = 500  // T2 네이버 POI는 넓게 표시 (지도 탐색용)

// poi 테이블은 2,000행을 넘고 계속 늘어나는데, `.select('*')`로 전체를 가져오면
// Supabase/PostgREST 기본 max-rows(1,000행) 제한에 걸려 뒤쪽에 삽입된 행이
// 응답에서 통째로 잘려나갈 수 있다(matcher.ts에서 같은 원인으로 산 POI 누락 확인됨).
// bbox로 미리 좁혀서 가져오면 결과 행 수가 작아 재발하지 않는다.
const BB_MARGIN_DEG = 0.01 // 위도 기준 약 1.11km — NAVER_RADIUS_M(500m) 커버 + 여유

// 캐시가 만료된 카테고리만 네이버로 검색해 DB에 신규 저장. 반환값은 저장 실패한 fallback POI 목록
// (20260820_022 이후로는 백그라운드에서만 호출되어 이 반환값은 로깅 목적 외로는 쓰이지 않는다).
async function searchAndPersistCategories(
  service: ReturnType<typeof createServiceClient>,
  lat: number,
  lng: number,
  gridKey: string,
  categories: PoiCategoryConfig[],
  existingNaverIds: Map<string, string>,
  regionName: string | null
): Promise<NaverPlace[]> {
  const toSearch: PoiCategoryConfig[] = []
  for (const cfg of categories) {
    if (await shouldSearch(service, gridKey, cfg.category)) toSearch.push(cfg)
  }
  if (toSearch.length === 0) return []

  let naverPois: NaverPlace[] = []
  let fetchFailed = false
  try {
    naverPois = await fetchNearbyNaverPoisForCategories(lat, lng, NAVER_RADIUS_M, toSearch, regionName)
  } catch {
    // 네이버 조회 실패 — 기존 DB 데이터만 사용, 캐시는 짧은 TTL로 남겨 곧 재시도되게 함
    fetchFailed = true
  }

  const resultCountByCategory = new Map<string, number>()
  for (const p of naverPois) {
    resultCountByCategory.set(p.category, (resultCountByCategory.get(p.category) ?? 0) + 1)
  }
  await Promise.all(
    toSearch.map((cfg) =>
      markSearched(service, gridKey, cfg.category, !fetchFailed && (resultCountByCategory.get(cfg.category) ?? 0) > 0)
    )
  )

  const newPois = naverPois.filter((p) => !existingNaverIds.has(p.naverId))
  if (newPois.length === 0) return []

  const inserts = newPois.map((p) => ({
    name: p.name,
    latitude: p.latitude,
    longitude: p.longitude,
    radius_meters: resolvePoiRadiusMeters(p.category, NAVER_RADIUS_M),
    category: p.category,
    naver_id: p.naverId,
    poi_tier: 2,
  }))
  const poiInsertQuery = service.from('poi')
  const { data: inserted, error: insertError } = await poiInsertQuery
    // @ts-expect-error Supabase insert 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 PoiRow와 일치
    .insert(inserts)
    .select('id, naver_id')

  if (insertError) return newPois // 저장 실패 — 전부 fallback으로 취급

  const insertedRows = (inserted ?? []) as Array<{ id: string; naver_id: string }>
  const insertedIds = new Set(insertedRows.map((row) => row.naver_id))
  for (const row of insertedRows) existingNaverIds.set(row.naver_id, row.id)
  return newPois.filter((p) => !insertedIds.has(p.naverId))
}

// 20260820_022: 역지오코딩 + 네이버 지역검색(캐시 미스 시 최대 13초+)은 응답을 블로킹하지
// 않는다 — 요청 시점에 DB에 이미 있는 POI만 즉시 응답하고, 캐시 미스분(신규/만료 카테고리)은
// `after()`로 응답 전송 후 백그라운드에서 검색·저장한다. 새로 채워진 T2 POI는 다음 요청부터
// 반영된다(캐시가 따뜻해진 지역은 이 백그라운드 작업 자체가 스킵되어 사실상 즉시 응답).
// T1/T2 병합 로직·레벨2 폴백 판정 순서는 기존과 동일하게 유지 — 실행 시점만 응답 이후로 옮겼다.
async function refreshPoisInBackground(
  service: ReturnType<typeof createServiceClient>,
  lat: number,
  lng: number,
  gridKey: string,
  naverIdMap: Map<string, string>
): Promise<void> {
  try {
    const regionName = await reverseGeocodeToRegionName(lat, lng)
    const { level1: LEVEL_1_CATEGORIES, level2: LEVEL_2_CATEGORIES } = await loadPipelineCategories(service)

    await searchAndPersistCategories(service, lat, lng, gridKey, LEVEL_1_CATEGORIES, naverIdMap, regionName)

    // 레벨 1 결과가 지역 내 부족하면 레벨 2까지 보조 검색 — 방금 저장된 레벨1 결과를
    // 반영해 판단해야 하므로 최신 DB 상태를 다시 조회한다(백그라운드라 응답 지연과 무관).
    const level1Categories = new Set(LEVEL_1_CATEGORIES.map((c) => c.category))
    const { data: poisAfterLevel1 } = await service
      .from('poi')
      .select('*')
      .gte('latitude', lat - BB_MARGIN_DEG)
      .lte('latitude', lat + BB_MARGIN_DEG)
      .gte('longitude', lng - BB_MARGIN_DEG)
      .lte('longitude', lng + BB_MARGIN_DEG)
    const level1NearbyCount = ((poisAfterLevel1 ?? []) as PoiRow[]).filter(
      (p) => level1Categories.has(p.category) && haversineDistance(lat, lng, p.latitude, p.longitude) <= NAVER_RADIUS_M
    ).length

    if (level1NearbyCount < LEVEL_2_FALLBACK_THRESHOLD) {
      await searchAndPersistCategories(service, lat, lng, gridKey, LEVEL_2_CATEGORIES, naverIdMap, regionName)
    }
  } catch {
    // 백그라운드 갱신 실패는 사용자 응답에 영향 없음 — poi_search_cache TTL에 따라 다음
    // 요청(들) 중 하나에서 자연스럽게 재시도된다.
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lng = parseFloat(searchParams.get('lng') ?? '')

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat, lng 파라미터 필요' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()

  // T1: DB POI 로드 — bbox로 좁혀서 가져옴(전체 select는 max-rows 제한에 걸림, 위 주석 참고).
  // 20260820_022 이전에는 이 쿼리를 동일 bbox로 3번(T1 최초 + 레벨1 이후 + 레벨2 이후)
  // 반복했다 — 네이버 검색을 백그라운드로 옮기면서(아래 참고) 응답 경로에서는 이 1회 조회만
  // 필요해졌다.
  const { data: poisRaw } = await service
    .from('poi')
    .select('*')
    .gte('latitude', lat - BB_MARGIN_DEG)
    .lte('latitude', lat + BB_MARGIN_DEG)
    .gte('longitude', lng - BB_MARGIN_DEG)
    .lte('longitude', lng + BB_MARGIN_DEG)
  const allDbPois = (poisRaw ?? []) as PoiRow[]
  const naverIdMap = new Map(allDbPois.filter((p) => p.naver_id).map((p) => [p.naver_id!, p.id]))
  const gridKey = computeGridKey(lat, lng)

  const nearbyDbPois = allDbPois.filter(
    (p) => haversineDistance(lat, lng, p.latitude, p.longitude) <= NAVER_RADIUS_M
  )

  const allPois = nearbyDbPois.map((p) => ({
    id: p.id,
    naver_id: p.naver_id,
    name: p.name,
    latitude: p.latitude,
    longitude: p.longitude,
    poi_tier: p.poi_tier ?? 1,
    distance_meters: Math.round(haversineDistance(lat, lng, p.latitude, p.longitude)),
    in_drop_range: haversineDistance(lat, lng, p.latitude, p.longitude) <= DROP_RADIUS_METERS,
    available_drops_count: 0,
  }))

  // 역지오코딩 + 네이버 지역검색(카테고리 캐시 미스 시 최대 13초+)은 응답을 블로킹하지 않고
  // 응답 전송 후 백그라운드에서 수행한다(refreshPoisInBackground 주석 참고) — 새로 검색·저장된
  // T2 POI는 이번 응답이 아니라 다음 요청부터 반영된다. 캐시가 따뜻한(이미 검색된) 지역은
  // shouldSearch()가 즉시 false를 반환해 이 작업 자체가 사실상 no-op으로 끝난다.
  after(() => refreshPoisInBackground(service, lat, lng, gridKey, naverIdMap))

  // 드랍 카운트: DB POI에만 조회
  const dbPoiIds = nearbyDbPois.map((p) => p.id).filter(Boolean)
  if (dbPoiIds.length > 0) {
    const { data: dropsRaw } = await service
      .from('poi_drops')
      .select('poi_id')
      .in('poi_id', dbPoiIds)
      .eq('is_available', true)

    const dropCountByPoi: Record<string, number> = {}
    for (const d of (dropsRaw ?? []) as { poi_id: string }[]) {
      const pid = d.poi_id
      dropCountByPoi[pid] = (dropCountByPoi[pid] ?? 0) + 1
    }
    for (const poi of allPois) {
      if (poi.id) poi.available_drops_count = dropCountByPoi[poi.id] ?? 0
    }
  }

  return NextResponse.json({ pois: allPois })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await req.json()
  const { poi_id, inventory_item_id, user_lat, user_lng } = body

  if (!poi_id || !inventory_item_id || isNaN(user_lat) || isNaN(user_lng)) {
    return NextResponse.json({ error: '필수 파라미터 누락' }, { status: 400 })
  }

  const service = createServiceClient()

  // POI 조회 + 50m 검증
  const { data: poiRaw, error: poiError } = await service
    .from('poi')
    .select('*')
    .eq('id', poi_id)
    .single()

  if (poiError || !poiRaw) {
    return NextResponse.json({ error: 'POI 없음' }, { status: 404 })
  }

  const poi = poiRaw as PoiRow
  if (!isUserNearPoi(user_lat, user_lng, poi)) {
    return NextResponse.json({ error: 'POI 반경 50m 밖' }, { status: 403 })
  }

  // 인벤토리 아이템 소유권 + 드랍 가능 상태 확인
  const { data: invRaw, error: invError } = await service
    .from('inventory')
    .select('id, used_slots')
    .eq('user_id', user.id)
    .single()

  if (invError || !invRaw) {
    return NextResponse.json({ error: '인벤토리 없음' }, { status: 404 })
  }

  const inventoryId = (invRaw as { id: string; used_slots: number }).id
  const currentUsedSlots = (invRaw as { id: string; used_slots: number }).used_slots

  const { data: itemRaw, error: itemError } = await service
    .from('inventory_items')
    .select('id, badge_id, dropped_at, slotted_in')
    .eq('id', inventory_item_id)
    .eq('inventory_id', inventoryId)
    .single()

  if (itemError || !itemRaw) {
    return NextResponse.json({ error: '아이템 없음 또는 소유 아님' }, { status: 404 })
  }

  const item = itemRaw as Pick<InventoryItemRow, 'id' | 'badge_id' | 'dropped_at'> & { slotted_in: string | null }

  if (item.dropped_at !== null) {
    return NextResponse.json({ error: '이미 드랍된 아이템' }, { status: 409 })
  }

  // 아이템북에 슬롯된 아이템은 인벤토리에서 이미 빠져나간 상태이므로 드랍 불가
  if (item.slotted_in !== null) {
    return NextResponse.json({ error: '컬렉션에 장착된 아이템은 드랍할 수 없어요.' }, { status: 409 })
  }

  // poi_drops INSERT
  const poiDropsInsertQuery = service.from('poi_drops')
  const poiDropPayload = {
    dropper_user_id: user.id,
    poi_id,
    badge_id: item.badge_id,
  }
  const { data: dropRaw, error: dropError } = await poiDropsInsertQuery
    // @ts-expect-error Supabase insert 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 PoiDropRow와 일치
    .insert(poiDropPayload)
    .select('id')
    .single()

  if (dropError || !dropRaw) {
    return NextResponse.json({ error: '드랍 실패' }, { status: 500 })
  }

  const dropId = (dropRaw as { id: string }).id

  // inventory_items 논리 삭제
  await service
    .from('inventory_items')
    // @ts-expect-error supabase-js update 파라미터 타입 추론 문제
    .update({ dropped_at: new Date().toISOString(), drop_id: dropId })
    .eq('id', inventory_item_id)

  // 드랍한 아이템은 더 이상 내 인벤토리에 없으므로 칸 반환
  await service
    .from('inventory')
    // @ts-expect-error supabase-js update 파라미터 타입 추론 문제
    .update({ used_slots: Math.max(0, currentUsedSlots - 1) })
    .eq('id', inventoryId)

  return NextResponse.json({ drop_id: dropId })
}
