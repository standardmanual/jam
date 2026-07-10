import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getNearbyPois, isUserNearPoi } from '@/lib/poi/proximity'
import type { PoiRow, InventoryItemRow } from '@/types/database'

// GET /api/drops/nearby?lat=&lng=
// POST /api/drops  (드랍 실행)

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

  // POI 전체 로드 후 50m 필터
  const { data: poisRaw, error: poisError } = await service.from('poi').select('*')
  if (poisError) return NextResponse.json({ error: 'POI 조회 실패' }, { status: 500 })

  const nearbyPois = getNearbyPois(lat, lng, (poisRaw ?? []) as PoiRow[])
  if (nearbyPois.length === 0) {
    return NextResponse.json({ pois: [] })
  }

  const poiIds = nearbyPois.map((p) => p.id)

  // 각 POI의 픽업 가능 드랍 수 조회 (본인 드랍 제외)
  const { data: dropsRaw } = await service
    .from('poi_drops')
    .select('poi_id, id')
    .in('poi_id', poiIds)
    .eq('is_available', true)
    .neq('dropper_user_id', user.id)

  const dropCountByPoi: Record<string, number> = {}
  for (const d of dropsRaw ?? []) {
    const poiId = (d as { poi_id: string }).poi_id
    dropCountByPoi[poiId] = (dropCountByPoi[poiId] ?? 0) + 1
  }

  const pois = nearbyPois.map((poi) => ({
    ...poi,
    available_drops_count: dropCountByPoi[poi.id] ?? 0,
  }))

  return NextResponse.json({ pois })
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
