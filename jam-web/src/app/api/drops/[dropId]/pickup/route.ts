import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isUserNearPoi } from '@/lib/poi/proximity'
import { recordFeedEvent } from '@/lib/activity-feed'
import { createNotification, sixHourGroupKey } from '@/lib/notifications'
import type { PoiRow, PoiDropRow } from '@/types/database'
import { getAbusingPolicy } from '@/lib/abusing/policy'
import { isPoiBlocked, blockPoiForUser } from '@/lib/abusing/poi-block'
import { checkAndUpdateLocation } from '@/lib/abusing/gps-detector'
import { applyBan, logAbusingEvent } from '@/lib/abusing/shadow-ban'

// 20260826_002: 이 라우트의 `error` 필드는 **항상 안정적인 snake_case 코드**만 담는다.
// 한국어 원문을 섞어 돌려주면 클라이언트의 코드 매핑이 빗나가 개발자용 축약 문구
// ('드랍 없음' 등)가 그대로 토스트에 노출된다(20260825_039에서 실제로 드러난 문제).
// 사용자 문구는 전부 src/lib/i18n/ko.ts의 drops 섹션에서 관리한다.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ dropId: string }> }
) {
  const { dropId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const { user_lat, user_lng } = body

  if (isNaN(user_lat) || isNaN(user_lng)) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 })
  }

  const service = createServiceClient()

  // 드랍 레코드 조회
  const { data: dropRaw, error: dropError } = await service
    .from('poi_drops')
    .select('*')
    .eq('id', dropId)
    .single()

  if (dropError || !dropRaw) {
    return NextResponse.json({ error: 'drop_not_found' }, { status: 404 })
  }

  const drop = dropRaw as PoiDropRow

  if (!drop.is_available) {
    // 20260825_039: 클라이언트가 코드로 매핑하는 RPC 경로(already_picked_up)와 값을 맞춘다.
    return NextResponse.json({ error: 'already_picked_up' }, { status: 409 })
  }

  // POI 조회 + 드랍 반경(DROP_RADIUS_METERS) 검증
  const { data: poiRaw, error: poiError } = await service
    .from('poi')
    .select('*')
    .eq('id', drop.poi_id)
    .single()

  if (poiError || !poiRaw) {
    return NextResponse.json({ error: 'poi_not_found' }, { status: 404 })
  }

  if (!isUserNearPoi(user_lat, user_lng, poiRaw as PoiRow)) {
    return NextResponse.json({ error: 'out_of_range' }, { status: 403 })
  }

  const policy = await getAbusingPolicy()

  // POI 블록 확인 (GPS 조작 감지 후 차단된 경우)
  const blocked = await isPoiBlocked(user.id, drop.poi_id)
  if (blocked) {
    return NextResponse.json({ error: 'poi_blocked' }, { status: 403 })
  }

  // GPS 조작 감지
  const gpsCheck = await checkAndUpdateLocation(user.id, user_lat, user_lng, policy)
  if (gpsCheck.detected) {
    const detail =
      gpsCheck.reason === 'daily_distance'
        ? `일일 누적 이동거리 초과 (${gpsCheck.dailyDistanceKm}km/일)`
        : `속도 ${gpsCheck.speedKmh}km/h`
    // 소프트밴은 POI 블록과 동일한 기간(poi_block_hours)만 유지한다.
    // 만료시간 없이 적용하면 오탐이어도 관리자가 수동 해제할 때까지 epic/mystic
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
    return NextResponse.json({ error: 'location_unverified' }, { status: 403 })
  }

  // 인벤토리 조회
  const { data: invRaw, error: invError } = await service
    .from('inventory')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (invError || !invRaw) {
    return NextResponse.json({ error: 'inventory_not_found' }, { status: 404 })
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
    return NextResponse.json({ error: 'pickup_failed' }, { status: 500 })
  }

  const result = rpcResult as { ok: boolean; error?: string; inventory_item_id?: string }

  if (!result.ok) {
    const statusMap: Record<string, number> = {
      already_picked_up: 409,
      cannot_pickup_own_drop: 403,
      inventory_not_found: 404,
      inventory_full: 422,
      // 20260829_2101: pickup_drop() 재작성 — 신규 INSERT를 제거하고 기존 개체를 재사용한다.
      // 이론상 도달하지 않아야 하는 방어적 경로(모든 활성 드랍은 마이그레이션으로 개체가
      // 연결돼 있어야 함)지만 방어 코드가 반환할 수 있는 값이라 매핑을 추가해 둔다.
      item_not_found: 404,
    }
    // RPC가 돌려주는 값도 snake_case 코드다. 값이 비어 있으면 일반 실패 코드로 흘린다.
    return NextResponse.json(
      { error: result.error ?? 'pickup_failed' },
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

    // 소식 #13(픽업됨) — 티켓 20260824_019
    // **드랍한 사람에게 간다.** 픽업한 사람이 아니다(픽업은 본인이 방금 한 행동).
    // dropper_user_id가 null이면 앰비언트(시스템) 드랍이라 받을 사람이 없다.
    if (drop.dropper_user_id && drop.dropper_user_id !== user.id) {
      await createNotification({
        userId: drop.dropper_user_id,
        type: 'drop_picked_up',
        actorUserId: user.id,
        // 6시간 묶음 — "시현님의 드랍 아이템 배지 3개가 픽업됐어요"
        groupKey: sixHourGroupKey('drop_picked_up'),
        payload: {
          actor_ids: [user.id],
          badge_ids: [b.id],
          badge_name: b.name,
          poi_id: drop.poi_id,
        },
        // actor_ids·badge_ids는 이어붙이고 중복을 제거한다 (DATA_MODEL §4-1).
        //   · badge_ids를 얕은 병합으로 두면 6시간 창의 직전 픽업 배지가 덮어써진다
        //   · actor_ids를 세야 actor_count가 "병합 횟수"가 아니라 "고유 인원"이 된다 —
        //     한 사람이 내 드랍 3건을 픽업해도 1명이어야 "예린님 외 2명"이 안 나온다
        appendKeys: ['actor_ids', 'badge_ids'],
      })
    }
  }

  return NextResponse.json({ inventory_item_id: result.inventory_item_id })
}
