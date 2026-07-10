import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getNearbyPois, isUserNearPoi, haversineDistance, DROP_RADIUS_METERS } from '@/lib/poi/proximity'
import { fetchNearbyOsmPois } from '@/lib/poi/overpass'
import type { PoiRow, InventoryItemRow } from '@/types/database'

// GET /api/drops?lat=&lng=  — T1(DB, 50m) + T2(OSM, 500m) 통합
// POST /api/drops            — 드랍 실행

const OSM_RADIUS_M = 500  // T2 OSM POI는 넓게 표시 (지도 탐색용)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lng = parseFloat(searchParams.get('lng') ?? '')

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat, lng 파라미터 필요' }, { status: 400 })
  }

  const isDebug = searchParams.get('debug') === '1'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const dbg: Record<string, unknown> = {}

  // T1: DB POI 전체 로드 → 500m 이내 필터
  const { data: poisRaw, error: dbPoiError } = await service.from('poi').select('*')
  dbg.db_poi_total = poisRaw?.length ?? 0
  dbg.db_poi_error = dbPoiError?.message ?? null
  const allDbPois = (poisRaw ?? []) as PoiRow[]
  const nearbyDbPois = allDbPois.filter(
    (p) => haversineDistance(lat, lng, p.latitude, p.longitude) <= OSM_RADIUS_M
  )
  dbg.db_poi_nearby = nearbyDbPois.length

  // T2: OSM POI 조회 (실패해도 T1은 반환)
  let osmPois: Awaited<ReturnType<typeof fetchNearbyOsmPois>> = []
  let osmError: string | null = null
  try {
    osmPois = await fetchNearbyOsmPois(lat, lng, OSM_RADIUS_M)
  } catch (e: any) {
    osmError = String(e?.message ?? e)
  }
  dbg.osm_fetched = osmPois.length
  dbg.osm_error = osmError
  dbg.osm_sample = osmPois.slice(0, 5).map((p) => p.name)

  // OSM POI 중 이미 DB에 없는 것만 upsert
  const osmIdMap = new Map(allDbPois.filter((p) => p.osm_id).map((p) => [p.osm_id!, p.id]))
  const newOsmPois = osmPois.filter((p) => !osmIdMap.has(p.osmId))
  dbg.osm_new = newOsmPois.length

  // 신규 OSM POI를 DB에 upsert
  if (newOsmPois.length > 0) {
    const inserts = newOsmPois.map((p) => ({
      name: p.name,
      latitude: p.latitude,
      longitude: p.longitude,
      radius_meters: 500,
      category: 'other',
      osm_id: p.osmId,
      poi_tier: 2,
    }))
    const { data: upserted, error: upsertError } = await (service as any)
      .from('poi')
      .upsert(inserts, { onConflict: 'osm_id', ignoreDuplicates: true })
      .select('id, osm_id')
    dbg.upsert_error = upsertError?.message ?? null
    dbg.upserted_count = (upserted ?? []).length
    if (!upsertError) {
      for (const row of upserted ?? []) osmIdMap.set(row.osm_id, row.id)
    }
  }

  // 최신 DB POI 재조회 (upsert 후 500m 이내)
  const { data: poisRaw2 } = await service.from('poi').select('*')
  const allDbPois2 = (poisRaw2 ?? []) as PoiRow[]
  const nearbyDbPois2 = allDbPois2.filter(
    (p) => haversineDistance(lat, lng, p.latitude, p.longitude) <= OSM_RADIUS_M
  )

  // 전체 POI 목록 통합 (DB + upsert된 OSM)
  const allPois = nearbyDbPois2.map((p) => ({
    id: p.id,
    osm_id: p.osm_id,
    name: p.name,
    latitude: p.latitude,
    longitude: p.longitude,
    poi_tier: p.poi_tier ?? 1,
    distance_meters: Math.round(haversineDistance(lat, lng, p.latitude, p.longitude)),
    in_drop_range: haversineDistance(lat, lng, p.latitude, p.longitude) <= DROP_RADIUS_METERS,
    available_drops_count: 0,
  }))

  // 드랍 카운트: DB POI에만 조회
  const dbPoiIds = nearbyDbPois2.map((p) => p.id).filter(Boolean)
  if (dbPoiIds.length > 0) {
    const { data: dropsRaw } = await (service as any)
      .from('poi_drops')
      .select('poi_id')
      .in('poi_id', dbPoiIds)
      .eq('is_available', true)
      .neq('dropper_user_id', user.id)

    const dropCountByPoi: Record<string, number> = {}
    for (const d of dropsRaw ?? []) {
      const pid = (d as any).poi_id
      dropCountByPoi[pid] = (dropCountByPoi[pid] ?? 0) + 1
    }
    for (const poi of allPois) {
      if (poi.id) poi.available_drops_count = dropCountByPoi[poi.id] ?? 0
    }
  }

  dbg.final_poi_count = allPois.length
  return NextResponse.json({ pois: allPois, ...(isDebug ? { debug: dbg } : {}) })
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
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (invError || !invRaw) {
    return NextResponse.json({ error: '인벤토리 없음' }, { status: 404 })
  }

  const inventoryId = (invRaw as { id: string }).id

  const { data: itemRaw, error: itemError } = await service
    .from('inventory_items')
    .select('id, badge_id, dropped_at')
    .eq('id', inventory_item_id)
    .eq('inventory_id', inventoryId)
    .single()

  if (itemError || !itemRaw) {
    return NextResponse.json({ error: '아이템 없음 또는 소유 아님' }, { status: 404 })
  }

  const item = itemRaw as Pick<InventoryItemRow, 'id' | 'badge_id' | 'dropped_at'>

  if (item.dropped_at !== null) {
    return NextResponse.json({ error: '이미 드랍된 아이템' }, { status: 409 })
  }

  // poi_drops INSERT
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dropRaw, error: dropError } = await (service as any)
    .from('poi_drops')
    .insert({
      dropper_user_id: user.id,
      poi_id,
      badge_id: item.badge_id,
    })
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

  return NextResponse.json({ drop_id: dropId })
}
