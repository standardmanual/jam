import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isUserNearPoi } from '@/lib/poi/proximity'
import { recordFeedEvent } from '@/lib/activity-feed'
import type { PoiRow, PoiDropRow } from '@/types/database'
import { getAbusingPolicy } from '@/lib/abusing/policy'
import { isPoiBlocked, blockPoiForUser } from '@/lib/abusing/poi-block'
import { checkAndUpdateLocation } from '@/lib/abusing/gps-detector'
import { applyBan, logAbusingEvent } from '@/lib/abusing/shadow-ban'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ dropId: string }> }
) {
  const { dropId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await req.json()
  const { user_lat, user_lng } = body

  if (isNaN(user_lat) || isNaN(user_lng)) {
    return NextResponse.json({ error: 'user_lat, user_lng 필요' }, { status: 400 })
  }

  const service = createServiceClient()

  // 드랍 레코드 조회
  const { data: dropRaw, error: dropError } = await service
    .from('poi_drops')
    .select('*')
    .eq('id', dropId)
    .single()

  if (dropError || !dropRaw) {
    return NextResponse.json({ error: '드랍 없음' }, { status: 404 })
  }

  const drop = dropRaw as PoiDropRow

  if (!drop.is_available) {
    return NextResponse.json({ error: '이미 픽업된 아이템' }, { status: 409 })
  }

  // POI 조회 + 50m 검증
  const { data: poiRaw, error: poiError } = await service
    .from('poi')
    .select('*')
    .eq('id', drop.poi_id)
    .single()

  if (poiError || !poiRaw) {
    return NextResponse.json({ error: 'POI 없음' }, { status: 404 })
  }

  if (!isUserNearPoi(user_lat, user_lng, poiRaw as PoiRow)) {
    return NextResponse.json({ error: 'POI 반경 50m 밖' }, { status: 403 })
  }

  const policy = await getAbusingPolicy()

  // POI 블록 확인 (GPS 조작 감지 후 차단된 경우)
  const blocked = await isPoiBlocked(user.id, drop.poi_id)
  if (blocked) {
    return NextResponse.json({ error: '이 POI에서 일시적으로 이용이 제한됐어요' }, { status: 403 })
  }

  // GPS 조작 감지
  const gpsCheck = await checkAndUpdateLocation(user.id, user_lat, user_lng, policy)
  if (gpsCheck.detected) {
    const detail =
      gpsCheck.reason === 'daily_distance'
        ? `일일 누적 이동거리 초과 (${gpsCheck.dailyDistanceKm}km/일)`
        : `속도 ${gpsCheck.speedKmh}km/h`
    // 소프트밴은 POI 블록과 동일한 기간(poi_block_hours)만 유지한다.
    // 만료시간 없이 적용하면 오탐이어도 관리자가 수동 해제할 때까지 legend/mythic
    // 드랍률이 영구히 0으로 묶이는 문제가 있었다 (20260813_002 티켓).
    const banExpiresAt = new Date(Date.now() + policy.poi_block_hours * 3_600_000)
    await Promise.all([
      applyBan(user.id, 'soft', `GPS 조작 의심 (${detail})`, 'system', banExpiresAt),
      blockPoiForUser(user.id, drop.poi_id, policy, `gps_spoof_detected (${detail})`),
      logAbusingEvent(user.id, 'gps_spoof_detected', {
        poi_id: drop.poi_id,
        reason: gpsCheck.reason,
        speed_kmh: gpsCheck.speedKmh,
        daily_distance_km: gpsCheck.dailyDistanceKm,
        lat: user_lat,
        lng: user_lng,
      }),
    ])
    return NextResponse.json({ error: '위치 정보를 확인할 수 없어요. 잠시 후 다시 시도해 주세요.' }, { status: 403 })
  }

  // 인벤토리 조회
  const { data: invRaw, error: invError } = await service
    .from('inventory')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (invError || !invRaw) {
    return NextResponse.json({ error: '인벤토리 없음' }, { status: 404 })
  }

  const inventoryId = (invRaw as { id: string }).id

  // RPC로 원자 트랜잭션 실행
  const rpcArgs = {
    p_drop_id: dropId,
    p_picker_id: user.id,
    p_inventory_id: inventoryId,
  }
  // @ts-expect-error 'pickup_drop' RPC 함수가 src/types/database.ts의 Functions에 미등록 — 실제 존재하는 DB 함수(별도 티켓으로 타입 등록 필요)
  const { data: rpcResult, error: rpcError } = await service.rpc('pickup_drop', rpcArgs)

  if (rpcError) {
    console.error('[pickup] RPC 오류:', rpcError)
    return NextResponse.json({ error: '픽업 실패' }, { status: 500 })
  }

  const result = rpcResult as { ok: boolean; error?: string; inventory_item_id?: string }

  if (!result.ok) {
    const statusMap: Record<string, number> = {
      already_picked_up: 409,
      cannot_pickup_own_drop: 403,
      inventory_not_found: 404,
      inventory_full: 422,
    }
    return NextResponse.json(
      { error: result.error },
      { status: statusMap[result.error ?? ''] ?? 400 }
    )
  }

  // 피드 기록 (배지 + POI 정보 조회)
  const poi = poiRaw as PoiRow
  const { data: badgeRaw } = await service.from('badges').select('id, name, image_url, rarity').eq('id', drop.badge_id).single()
  if (badgeRaw) {
    const b = badgeRaw as { id: string; name: string; image_url: string; rarity: string }
    await recordFeedEvent(user.id, 'item_picked_up', {
      badge_id: b.id,
      badge_name: b.name,
      badge_image_url: b.image_url,
      rarity: b.rarity,
      poi_name: poi.name,
      dropper_user_id: drop.dropper_user_id,
      poi_drop_id: dropId,
    })
  }

  return NextResponse.json({ inventory_item_id: result.inventory_item_id })
}
