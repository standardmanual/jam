import { NextRequest, NextResponse, after } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isUserNearPoi, haversineDistance, DROP_RADIUS_METERS } from '@/lib/poi/proximity'
import { fetchNearbyNaverPoisForCategories, type NaverPlace } from '@/lib/poi/naver'
import { reverseGeocodeToRegions, type ReverseGeocodeRegions } from '@/lib/poi/reverse-geocode'
import { loadPipelineCategories, LEVEL_2_FALLBACK_THRESHOLD, type PoiCategoryConfig } from '@/lib/poi/categories'
import { computeGridKey, shouldSearch, markSearched } from '@/lib/poi/search-cache'
import { resolvePoiRadiusMeters } from '@/lib/poi/radius-policy'
import { classifyNaverCategory } from '@/lib/poi/category-gate'
import type { PoiRow } from '@/types/database'
import { getOrCreateInventoryId } from '@/lib/inventory/get-or-create'
import { isLockedItemTriggerError, LOCKED_ITEM_NOT_ALLOWED_CODE } from '@/lib/inventory/lockedItem'
import { assertNotSuspended, UserSuspendedError } from '@/lib/suspension/suspension'
import { USER_SUSPENDED_CODE, type UserSuspendedResponse } from '@/lib/suspension/suspension-contract'
import { awardServiceJam } from '@/lib/jam/serviceActivity'
import { runJamActionEvaluation } from '@/lib/badge-engine/jamActionRoute'
import { jamTriggersForDrop } from '@/lib/badge-engine/jamActionDropTriggers'
import { d, t } from '@/lib/i18n'

// GET /api/drops?lat=&lng=  — T1(DB) + T2(네이버 지역검색, 카테고리 레벨 기반) 통합
// POST /api/drops            — 드랍 실행
//
// 20260915_2241 — ADR 0001에 따라 두 핸들러의 `error` 필드는 `src/lib/i18n/ko.ts`의
// drops 네임스페이스로 완성한 사용자 문구를 담아 돌려준다. 클라이언트는 이 문구를
// 그대로 신뢰해 노출한다(코드로 재매핑하지 않는다). (이전에는 snake_case 코드만
// 돌려주고 클라이언트가 코드→문구 매핑을 따로 들고 있었다 — 20260826_002.)

const NAVER_RADIUS_M = 500  // T2 네이버 POI는 넓게 표시 (지도 탐색용)

// poi 테이블은 2,000행을 넘고 계속 늘어나는데, `.select('*')`로 전체를 가져오면
// Supabase/PostgREST 기본 max-rows(1,000행) 제한에 걸려 뒤쪽에 삽입된 행이
// 응답에서 통째로 잘려나갈 수 있다(matcher.ts에서 같은 원인으로 산 POI 누락 확인됨).
// bbox로 미리 좁혀서 가져오면 결과 행 수가 작아 재발하지 않는다.
const BB_MARGIN_DEG = 0.01 // 위도 기준 약 1.11km — NAVER_RADIUS_M(500m) 커버 + 여유

/**
 * 20260907_1242: naver_category/naver_keyword/pending_review는 마이그레이션 143에서 막
 * 추가된 컬럼이라 생성 타입(database.generated.ts)에 아직 없다 — db:types CLI 부재로
 * 재생성 불가(완료 보고 참고). `.insert()`의 초과 속성 검사가 신규 컬럼을 알 수 없는 키로
 * 보고 막으므로, 이 세 컬럼을 포함한 최소 인터페이스로 빌더만 좁게 캐스팅한다
 * (`lib/engine-log/index.ts`와 동일 기법) — 다른 컬럼명 검사는 그대로 유지되고, 전체를
 * `as any`로 덮지 않는다.
 * `is_active`는 기존에도 있던 컬럼(생성 타입에 이미 존재)이라 이 우회가 필요 없지만,
 * 이 인터페이스가 이미 `.insert()` 빌더 전체를 좁게 캐스팅하는 자리라 20260907_1243에서
 * 함께 선언했다 — category.display_on_map을 반영해 지도 비노출 카테고리를 비활성으로
 * 저장한다(아래 inserts 매핑 참고).
 */
interface PoiInsertWithGateColumns {
  insert: (values: {
    name: string
    latitude: number
    longitude: number
    radius_meters: number
    category: string
    naver_id: string
    naver_category: string | null
    naver_keyword: string | null
    poi_tier: number
    pending_review: boolean
    is_active: boolean
  }[]) => {
    select: (columns: string) => PromiseLike<{
      data: { id: string; naver_id: string }[] | null
      error: { message: string } | null
    }>
  }
}

// 20260907_1242: 카테고리별 requires_review가 켜져 있으면 네이버 원본 분류(naverCategory)를
// 기대 카테고리와 대조해 3단계로 나눈다 — 자동거부는 애초에 insert 목록에서 빠지고(저장하지
// 않음), 자동승인/검토대기는 둘 다 저장되되 pending_review 값만 다르다. requires_review가
// 꺼진 카테고리는 기존처럼 게이트 없이 전부 자동승인 취급한다.
// (노출 여부는 게이트와 별개로 is_active가 결정한다 — 20260911_1343: 검토대기면
// display_on_map과 무관하게 is_active=false 강제. 아래 gated.map() 부근 주석 참고.)
function gatePois(
  pois: NaverPlace[],
  requiresReviewByCategory: Map<string, boolean>
): { poi: NaverPlace; pendingReview: boolean }[] {
  return pois
    .map((poi) => {
      const requiresReview = requiresReviewByCategory.get(poi.category) ?? false
      const verdict = requiresReview ? classifyNaverCategory(poi.category, poi.naverCategory) : 'approved'
      return { poi, verdict }
    })
    .filter(({ verdict }) => verdict !== 'rejected')
    .map(({ poi, verdict }) => ({ poi, pendingReview: verdict === 'pending' }))
}

// 캐시가 만료된 카테고리만 네이버로 검색해 DB에 신규 저장. 반환값은 저장 실패한 fallback POI 목록
// (20260820_022 이후로는 백그라운드에서만 호출되어 이 반환값은 로깅 목적 외로는 쓰이지 않는다).
async function searchAndPersistCategories(
  service: ReturnType<typeof createServiceClient>,
  lat: number,
  lng: number,
  gridKey: string,
  categories: PoiCategoryConfig[],
  existingNaverIds: Map<string, string>,
  regions: ReverseGeocodeRegions | null
): Promise<NaverPlace[]> {
  const toSearch: PoiCategoryConfig[] = []
  for (const cfg of categories) {
    if (await shouldSearch(service, gridKey, cfg.category)) toSearch.push(cfg)
  }
  if (toSearch.length === 0) return []

  let naverPois: NaverPlace[] = []
  let fetchFailed = false
  try {
    naverPois = await fetchNearbyNaverPoisForCategories(lat, lng, NAVER_RADIUS_M, toSearch, regions)
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

  const requiresReviewByCategory = new Map(toSearch.map((cfg) => [cfg.category, cfg.requiresReview]))
  const gated = gatePois(newPois, requiresReviewByCategory)
  if (gated.length === 0) return [] // 전부 자동거부 — 저장하지 않음(fallback 재시도 대상도 아님)

  // 20260907_1243: 카테고리별 display_on_map을 그대로 is_active에 반영한다 — false인
  // 카테고리(예: 병원/약국)는 자동수집은 계속하되 지도/목록에는 노출하지 않는다. 이 필드가
  // 없던 이전에는 전부 무조건 활성(true)으로 저장됐다.
  //
  // 20260911_1343: 단, pendingReview=true(검증 게이트 판정 결과 검토대기)이면 display_on_map
  // 값과 무관하게 is_active=false를 강제한다 — 검토 전 POI가 지도에 즉시 노출되던 버그 수정.
  // display_on_map을 따르는 건 게이트를 통과(자동승인)했거나 애초에 게이트가 꺼진
  // (requiresReview=false) 카테고리뿐이다.
  const displayOnMapByCategory = new Map(toSearch.map((cfg) => [cfg.category, cfg.displayOnMap]))

  const inserts = gated.map(({ poi: p, pendingReview }) => ({
    name: p.name,
    latitude: p.latitude,
    longitude: p.longitude,
    radius_meters: resolvePoiRadiusMeters(p.category, NAVER_RADIUS_M),
    category: p.category,
    naver_id: p.naverId,
    naver_category: p.naverCategory || null,
    naver_keyword: p.naverKeyword || null,
    poi_tier: 2,
    pending_review: pendingReview,
    is_active: pendingReview ? false : (displayOnMapByCategory.get(p.category) ?? true),
  }))
  const poiInsertQuery = service.from('poi') as unknown as PoiInsertWithGateColumns
  const { data: inserted, error: insertError } = await poiInsertQuery
    .insert(inserts)
    .select('id, naver_id')

  if (insertError) return gated.map(({ poi }) => poi) // 저장 실패 — 전부 fallback으로 취급

  const insertedRows = (inserted ?? []) as Array<{ id: string; naver_id: string }>
  const insertedIds = new Set(insertedRows.map((row) => row.naver_id))
  for (const row of insertedRows) existingNaverIds.set(row.naver_id, row.id)
  return gated.map(({ poi }) => poi).filter((p) => !insertedIds.has(p.naverId))
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
    const regions = await reverseGeocodeToRegions(lat, lng)
    const { level1: LEVEL_1_CATEGORIES, level2: LEVEL_2_CATEGORIES } = await loadPipelineCategories(service)

    await searchAndPersistCategories(service, lat, lng, gridKey, LEVEL_1_CATEGORIES, naverIdMap, regions)

    // 레벨 1 결과가 지역 내 부족하면 레벨 2까지 보조 검색 — 방금 저장된 레벨1 결과를
    // 반영해 판단해야 하므로 최신 DB 상태를 다시 조회한다(백그라운드라 응답 지연과 무관).
    const level1Categories = new Set(LEVEL_1_CATEGORIES.map((c) => c.category))
    const { data: poisAfterLevel1 } = await service
      .from('poi')
      .select('*')
      .eq('is_active', true)
      .gte('latitude', lat - BB_MARGIN_DEG)
      .lte('latitude', lat + BB_MARGIN_DEG)
      .gte('longitude', lng - BB_MARGIN_DEG)
      .lte('longitude', lng + BB_MARGIN_DEG)
    const level1NearbyCount = ((poisAfterLevel1 ?? []) as PoiRow[]).filter(
      (p) => level1Categories.has(p.category) && haversineDistance(lat, lng, p.latitude, p.longitude) <= NAVER_RADIUS_M
    ).length

    if (level1NearbyCount < LEVEL_2_FALLBACK_THRESHOLD) {
      await searchAndPersistCategories(service, lat, lng, gridKey, LEVEL_2_CATEGORIES, naverIdMap, regions)
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
    return NextResponse.json({ error: d.drops.locationMissing }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: d.drops.sessionExpired }, { status: 401 })

  const service = createServiceClient()

  // T1: DB POI 로드 — bbox로 좁혀서 가져옴(전체 select는 max-rows 제한에 걸림, 위 주석 참고).
  // 20260820_022 이전에는 이 쿼리를 동일 bbox로 3번(T1 최초 + 레벨1 이후 + 레벨2 이후)
  // 반복했다 — 네이버 검색을 백그라운드로 옮기면서(아래 참고) 응답 경로에서는 이 1회 조회만
  // 필요해졌다.
  // 20260830_1620: is_active 필터는 여기서 걸지 않는다 — 이 쿼리 결과(allDbPois)는
  // naverIdMap(existingNaverIds, 아래) 구성에도 재사용되는데, 그 맵은 "DB에 이미 존재하는
  // naver_id" 중복 삽입 방지가 목적이라 is_active와 무관하게 전량 포함해야 한다. 여기서
  // is_active=true로 거르면, 관리자가 naver_id 보유 T2 POI를 비활성화한 뒤 캐시 TTL 만료로
  // 재검색이 돌 때 네이버가 같은 장소를 다시 반환해도 "신규"로 오판 → INSERT 시도 →
  // naver_id UNIQUE 제약 위반으로 같은 배치의 진짜 신규 POI까지 저장 실패하는 회귀가 있었다
  // (게이트 리뷰에서 발견, 20260830_1620 재작업 사유). 유저 노출용 필터링은 아래
  // activeDbPois에서 별도로 적용한다.
  const { data: poisRaw, error: poisError } = await service
    .from('poi')
    .select('*')
    .gte('latitude', lat - BB_MARGIN_DEG)
    .lte('latitude', lat + BB_MARGIN_DEG)
    .gte('longitude', lng - BB_MARGIN_DEG)
    .lte('longitude', lng + BB_MARGIN_DEG)
  // 20260901_1848: 지도 T1 POI 조회 실패가 "이 근처엔 지점 없음"으로 위장되던 지점 —
  // 드랍 기능 전체를 좌우하는 쿼리라 위험도가 가장 높다.
  if (poisError) console.error('[api/drops GET] poi(T1) 조회 실패', poisError)
  const allDbPois = (poisRaw ?? []) as PoiRow[]
  const naverIdMap = new Map(allDbPois.filter((p) => p.naver_id).map((p) => [p.naver_id!, p.id]))
  const gridKey = computeGridKey(lat, lng)

  // 20260830_1620: 유저 노출(T1 목록)·드랍 카운트 집계는 is_active=false(어드민이 운영
  // 종료 처리한 지점)를 완전히 숨긴다 — naverIdMap과 달리 이 목록은 사용자에게 보여주는
  // 용도이므로 활성 POI로 좁힌다.
  const activeDbPois = allDbPois.filter((p) => p.is_active)

  const nearbyDbPois = activeDbPois.filter(
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
    const { data: dropsRaw, error: dropsError } = await service
      .from('poi_drops')
      .select('poi_id')
      .in('poi_id', dbPoiIds)
      .eq('is_available', true)
    if (dropsError) console.error('[api/drops GET] poi_drops(가용 드랍 카운트) 조회 실패', dropsError)

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
  if (!user) return NextResponse.json({ error: d.drops.sessionExpired }, { status: 401 })

  const service = createServiceClient()

  // 이용 정지 중이면 드랍하지 않는다(티켓 20261018_1812, 운영 로직 9.3절). 위치·장소 검증보다 앞서 막는다.
  // 정지 여부를 읽지 못하면 던져 드랍하지 않는다 — 정지 중인 유저가 조회 실패 틈에 드랍하면 안 된다.
  const suspendedResponse = () => {
    const suspended: UserSuspendedResponse = { error: d.suspension.dropBlocked, code: USER_SUSPENDED_CODE }
    return NextResponse.json(suspended, { status: 403 })
  }
  try {
    await assertNotSuspended(service, user.id)
  } catch (err) {
    if (err instanceof UserSuspendedError) return suspendedResponse()
    console.error('[drops] 이용 정지 조회 오류:', err)
    return NextResponse.json({ error: d.drops.dropFailed }, { status: 500 })
  }

  const body = await req.json()
  const { poi_id, inventory_item_id, user_lat, user_lng } = body

  if (!poi_id || !inventory_item_id || isNaN(user_lat) || isNaN(user_lng)) {
    return NextResponse.json({ error: d.drops.locationMissing }, { status: 400 })
  }

  // POI 조회 + 드랍 반경(DROP_RADIUS_METERS = 500m) 검증.
  // 20260826_002 이전에는 주석·에러 문구가 '50m'라고 적혀 있었으나 상수는 처음부터
  // 500이었다 — 사용자 문구에는 숫자를 박지 않고 상수를 t()로 주입한다.
  const { data: poiRaw, error: poiError } = await service
    .from('poi')
    .select('*')
    .eq('id', poi_id)
    .single()

  if (poiError || !poiRaw) {
    return NextResponse.json({ error: d.drops.dropPoiNotFound }, { status: 404 })
  }

  const poi = poiRaw as PoiRow
  // 20260830_1620: is_active=false는 지도/목록에서 이미 숨겨지므로 정상 흐름에서는 도달하지
  // 않지만, 클라이언트가 들고 있던 캐시된 poi_id로 요청할 수 있어 서버에서도 막는다.
  // 신규 드랍 시도만 막는 것이라 dropPoiNotFound와 동일한 문구로 취급한다(사용자에게는
  // '존재하지 않는 지점'과 같은 안내가 이미 자연스럽다).
  if (!poi.is_active) {
    return NextResponse.json({ error: d.drops.dropPoiNotFound }, { status: 404 })
  }
  if (!isUserNearPoi(user_lat, user_lng, poi)) {
    return NextResponse.json({ error: t(d.drops.dropOutOfRange, { m: DROP_RADIUS_METERS }) }, { status: 403 })
  }

  // 인벤토리 존재 확인 — 없으면 즉석 생성한다(get-or-create, 티켓 20260906_2217 회귀 방지).
  // 이 값 자체는 아래 RPC 인자로 쓰이지 않는다 — create_user_drop()이 user_id로 자체 조회하므로
  // 여기서는 "인벤토리가 존재하는가"만 보장하면 된다.
  const inventoryExists = await getOrCreateInventoryId(service, user.id)

  if (!inventoryExists) {
    return NextResponse.json({ error: d.drops.loadInventoryFailed }, { status: 404 })
  }

  // 20260829_2101: 개체 정체성 모델 — 소유권을 바꾸는 액션은 원자적 락(SELECT ... FOR UPDATE)
  // 아래서 실행해야 한다(표준 불변식 1). 소유권·상태 확인 + poi_drops 연결 + 소유자 필드
  // 비우기 + custody_events 기록을 전부 create_user_drop() RPC 하나의 트랜잭션으로 처리한다.
  // 기존처럼 inventory_items를 소프트 삭제(dropped_at/drop_id)하지 않는다 — 개체는 그대로
  // 남고 poi_drops.inventory_item_id로 연결될 뿐이다(일련번호 유지).
  // 잠긴 개체도 잠긴 채 드랍한다(티켓 20261018_1812, 운영 로직 7.2절). 채우다 만 양은 DB 함수가 0으로 되돌리고 돌려주지 않으며,
  // 사라진 양(`lost_fill`)을 응답에 싣는다. 이용 정지는 DB 함수도 한 번 더 막는다(`user_suspended`, 마이그레이션 239).
  const rpcArgs = {
    p_dropper_id: user.id,
    p_poi_id: poi_id,
    p_inventory_item_id: inventory_item_id,
  }
  const { data: rpcResult, error: rpcError } = await service.rpc('create_user_drop', rpcArgs)

  if (rpcError) {
    if (isLockedItemTriggerError(rpcError)) {
      return NextResponse.json({ error: d.lockedItem.drop, code: LOCKED_ITEM_NOT_ALLOWED_CODE }, { status: 409 })
    }
    console.error('[drops] create_user_drop RPC 오류:', rpcError)
    return NextResponse.json({ error: d.drops.dropFailed }, { status: 500 })
  }

  const result = rpcResult as { ok: boolean; error?: string; drop_id?: string; lost_fill?: number }

  if (!result.ok) {
    const code = result.error ?? ''
    // DB 함수도 정지를 검사한다(방어). 위 검사와 이 호출 사이에 정지가 걸린 경우다.
    if (code === 'user_suspended') return suspendedResponse()
    // RPC가 돌려주는 값은 snake_case 코드다 — 여기서 사용자 문구로 완성해 돌려준다
    // (ADR 0001, 클라이언트는 이 문구를 그대로 신뢰해 노출한다).
    const messageMap: Record<string, string> = {
      inventory_not_found: d.drops.loadInventoryFailed,
      item_not_found: d.drops.dropItemNotFound,
      item_slotted: d.drops.dropItemSlotted,
      already_dropped: d.drops.dropAlreadyDropped,
    }
    const statusMap: Record<string, number> = {
      inventory_not_found: 404,
      item_not_found: 404,
      item_slotted: 409,
      already_dropped: 409,
    }
    return NextResponse.json(
      { error: messageMap[code] ?? d.drops.dropFailed },
      { status: statusMap[code] ?? 400 }
    )
  }

  // JAM! 행동 지표(드랍한 아이템 수) — 응답을 보낸 뒤에 놓은 사람의 배지를 판정한다(티켓 20261001_0632).
  // 성공 분기에서만 예약한다. `runJamActionEvaluation`은 예외를 던지지 않아 드랍 응답은 그대로다.
  // 서비스 활동 잼 «드랍» (티켓 20261028_1735 3회, 옛 챕터 점수 자리)도 같은 자리에서 부른다. 이 라우트는 유저 드랍만 만들어서(시스템 드랍은 앰비언트 배치가 따로 놓는다)
  // 드랍 대상이 곧 이 라우트의 성공이다. 원천 id는 드랍 id(`poi_drops.id`)라 같은 드랍을 다시 보내도 한 번만 지급한다.
  // 규칙값 기본이 0이라 지금은 DB 함수가 `rule_zero`로 돌려주고 지급도 캡슐 채움도 없다(밸런스 설정에서 값을 올리면 켜지고 하루·주간 상한이 막는다). 호출은 남긴다.
  // `awardServiceJam`은 던지지 않고, 판정과 서로 영향을 주지 않게 `allSettled`로 함께 돌린다. 잼 실패는 응답을 바꾸지 않는다.
  const dropId = result.drop_id
  if (typeof dropId !== 'string') console.error(`[drops] 드랍 id가 없어 서비스 활동 잼을 건너뜀 (userId: ${user.id})`)
  after(async () => {
    await Promise.allSettled([
      typeof dropId === 'string' ? awardServiceJam(service, { userId: user.id, kind: 'drop', sourceId: dropId }) : Promise.resolve(),
      runJamActionEvaluation(user.id, jamTriggersForDrop()),
    ])
  })

  // `lostFill`: 잠긴 개체를 드랍하며 사라진 채운 양. 열린 개체이거나 채운 양이 없었으면 0이다.
  return NextResponse.json({ drop_id: result.drop_id, lostFill: result.lost_fill ?? 0 })
}
