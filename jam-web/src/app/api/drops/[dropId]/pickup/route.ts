import { NextRequest, NextResponse, after } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isUserNearPoi, DROP_RADIUS_METERS } from '@/lib/poi/proximity'
import { recordFeedEvent } from '@/lib/activity-feed'
import { createNotification, sixHourGroupKey } from '@/lib/notifications'
import { notifyInventorySlotsLow } from '@/lib/inventory/slotAlert'
import type { PoiRow, PoiDropRow } from '@/types/database'
import { getAbusingPolicy } from '@/lib/abusing/policy'
import { isPoiBlocked, blockPoiForUser } from '@/lib/abusing/poi-block'
import { checkAndUpdateLocation } from '@/lib/abusing/gps-detector'
import { applyBan, logAbusingEvent } from '@/lib/abusing/shadow-ban'
import { getOrCreateInventoryId } from '@/lib/inventory/get-or-create'
import { findLockedItemIds } from '@/lib/inventory/lockedItem'
import { assertNotSuspended, UserSuspendedError } from '@/lib/suspension/suspension'
import { USER_SUSPENDED_CODE, type UserSuspendedResponse } from '@/lib/suspension/suspension-contract'
import { runJamActionEvaluation } from '@/lib/badge-engine/jamActionRoute'
import { jamTriggersForPickup } from '@/lib/badge-engine/jamActionDropTriggers'
import { d, t } from '@/lib/i18n'

// 20260915_2241 — ADR 0001에 따라 이 라우트의 `error` 필드는 `src/lib/i18n/ko.ts`의 drops
// 네임스페이스로 완성한 사용자 문구를 담아 돌려준다. 클라이언트는 이 문구를 그대로 신뢰해
// 노출한다(코드로 재매핑하지 않는다). (이전에는 snake_case 코드만 돌려주고 클라이언트가
// 코드→문구 매핑을 따로 들고 있었다 — 20260826_002, 20260825_039.)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ dropId: string }> }
) {
  const { dropId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: d.drops.sessionExpired }, { status: 401 })

  const service = createServiceClient()

  // 이용 정지 중이면 줍지 않는다(티켓 20261018_1812, 운영 로직 9.5절). 위치·GPS 판정보다 앞서 막아 GPS 제재 기록도 남기지 않는다.
  // 정지 여부를 읽지 못하면 던져 줍지 않는다 — 정지 중인 유저가 조회 실패 틈에 줍는 일이 없어야 한다.
  const suspendedResponse = () => {
    const suspended: UserSuspendedResponse = { error: d.suspension.pickupBlocked, code: USER_SUSPENDED_CODE }
    return NextResponse.json(suspended, { status: 403 })
  }
  try {
    await assertNotSuspended(service, user.id)
  } catch (err) {
    if (err instanceof UserSuspendedError) return suspendedResponse()
    console.error('[pickup] 이용 정지 조회 오류:', err)
    return NextResponse.json({ error: d.drops.pickupFailed }, { status: 500 })
  }

  const body = await req.json()
  const { user_lat, user_lng } = body

  if (isNaN(user_lat) || isNaN(user_lng)) {
    return NextResponse.json({ error: d.drops.locationMissing }, { status: 400 })
  }

  // 드랍 레코드 조회
  const { data: dropRaw, error: dropError } = await service
    .from('poi_drops')
    .select('*')
    .eq('id', dropId)
    .single()

  if (dropError || !dropRaw) {
    return NextResponse.json({ error: d.drops.pickupDropNotFound }, { status: 404 })
  }

  const drop = dropRaw as PoiDropRow

  if (!drop.is_available) {
    // 20260825_039: RPC 경로(already_picked_up)와 같은 문구로 맞춘다.
    return NextResponse.json({ error: d.drops.pickupAlreadyDone }, { status: 409 })
  }

  // POI 조회 + 드랍 반경(DROP_RADIUS_METERS) 검증
  const { data: poiRaw, error: poiError } = await service
    .from('poi')
    .select('*')
    .eq('id', drop.poi_id)
    .single()

  if (poiError || !poiRaw) {
    return NextResponse.json({ error: d.drops.pickupPoiNotFound }, { status: 404 })
  }

  // 꺼진 장소(`is_active = false`)에서는 줍지 못한다. 드랍은 지우지 않으므로 장소를 다시 켜면 다시 주울 수 있다.
  // 드랍이 없을 때(`drop_not_found`)와 같은 404·문구로 닫아 꺼진 장소에 드랍이 남아 있다는 정보를 주지 않는다.
  if (!(poiRaw as PoiRow).is_active) {
    return NextResponse.json({ error: d.drops.pickupDropNotFound }, { status: 404 })
  }

  if (!isUserNearPoi(user_lat, user_lng, poiRaw as PoiRow)) {
    return NextResponse.json({ error: t(d.drops.pickupOutOfRange, { m: DROP_RADIUS_METERS }) }, { status: 403 })
  }

  const policy = await getAbusingPolicy()

  // POI 블록 확인 (GPS 조작 감지 후 차단된 경우)
  const blocked = await isPoiBlocked(user.id, drop.poi_id)
  if (blocked) {
    return NextResponse.json({ error: d.drops.pickupPoiBlocked }, { status: 403 })
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
    try {
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
    } catch (e) {
      // 제재 기록(밴·POI 블록) 저장이 실패해도 이번 픽업은 그대로 차단한다 — 스푸핑은 이미
      // 감지됐으므로 이 요청의 판정을 바꿀 이유가 없다. 다만 제재가 실제로 걸리지 않았을 수
      // 있으므로(다음 요청부터 다시 통과할 위험) 반드시 서버 로그로 남긴다.
      // 이전에는 applyBan/blockPoiForUser의 upsert 에러가 통째로 삼켜져 이 실패가 무음이었다
      // (티켓 20260901_1843).
      console.error(
        `[pickup] GPS 스푸핑 제재 기록 실패 — 이번 요청은 차단 유지, 제재는 미적용일 수 있음 (userId: ${user.id}, poiId: ${drop.poi_id}):`,
        e
      )
    }
    return NextResponse.json({ error: d.drops.pickupLocationUnverified }, { status: 403 })
  }

  // 인벤토리 조회 — 없으면 즉석 생성한다(get-or-create, 티켓 20260906_2217 회귀 방지).
  const inventoryId = await getOrCreateInventoryId(service, user.id)

  if (!inventoryId) {
    return NextResponse.json({ error: d.drops.loadInventoryFailed }, { status: 404 })
  }

  // RPC로 원자 트랜잭션 실행
  const rpcArgs = {
    p_drop_id: dropId,
    p_picker_id: user.id,
    p_inventory_id: inventoryId,
  }
  const { data: rpcResult, error: rpcError } = await service.rpc('pickup_drop', rpcArgs)

  if (rpcError) {
    console.error('[pickup] RPC 오류:', rpcError)
    return NextResponse.json({ error: d.drops.pickupFailed }, { status: 500 })
  }

  const result = rpcResult as { ok: boolean; error?: string; inventory_item_id?: string }

  if (!result.ok) {
    const code = result.error ?? ''
    // DB 함수도 정지를 검사한다(방어). 위 검사와 이 호출 사이에 정지가 걸린 경우다.
    if (code === 'user_suspended') return suspendedResponse()
    // RPC가 돌려주는 값은 snake_case 코드다 — 여기서 사용자 문구로 완성해 돌려준다
    // (ADR 0001, 클라이언트는 이 문구를 그대로 신뢰해 노출한다).
    // 자기 드랍 줍기는 허용이라 «자기 드랍» 거절 코드는 없다(티켓 20261018_1812). 꺼진 장소(`poi_inactive`)는 위 검사와 같은 문구다.
    const messageMap: Record<string, string> = {
      already_picked_up: d.drops.pickupAlreadyDone,
      poi_inactive: d.drops.pickupDropNotFound,
      inventory_not_found: d.drops.loadInventoryFailed,
      inventory_full: d.drops.pickupInventoryFull,
      // 20260829_2101: pickup_drop() 재작성 — 신규 INSERT를 제거하고 기존 개체를 재사용한다.
      // item_not_found는 이론상 도달하지 않아야 하는 방어적 경로(모든 활성 드랍은
      // 마이그레이션으로 개체가 연결돼 있어야 함)라 전용 문구 없이 일반 실패 문구로 흘린다.
    }
    const statusMap: Record<string, number> = {
      already_picked_up: 409,
      poi_inactive: 404,
      inventory_not_found: 404,
      inventory_full: 422,
      item_not_found: 404,
    }
    return NextResponse.json(
      { error: messageMap[code] ?? d.drops.pickupFailed },
      { status: statusMap[code] ?? 400 }
    )
  }

  // JAM! 행동 지표(드랍·픽업) — 응답을 보낸 뒤에 줍는 사람과 놓은 사람을 각각 판정한다(티켓 20261001_0632).
  // 주워짐(`picked_up_by_user_count`)은 놓은 사람에게 발급·알림한다. 자기 드랍이면 예약하지 않는다.
  // `after()`로 미루는 이유: 이 라우트는 이미 왕복이 많고 두 유저 판정이 붙으며, 획득 알림이 알림함 결산뿐이라
  // 응답 뒤로 미뤄도 유저가 잃는 것이 없다. `allSettled`라 한쪽 판정이 거부돼도 다른 쪽은 끝까지 돈다.
  const jamTriggers = jamTriggersForPickup(user.id, drop.dropper_user_id)
  if (jamTriggers.picker.length > 0 || jamTriggers.dropper.length > 0) {
    const dropperId = drop.dropper_user_id
    after(async () => {
      await Promise.allSettled([
        runJamActionEvaluation(user.id, jamTriggers.picker),
        dropperId ? runJamActionEvaluation(dropperId, jamTriggers.dropper) : Promise.resolve(),
      ])
    })
  }

  // 잠긴 채 받은 개체는 어떤 아이템 배지인지 알 수 있는 값(이름·그림)을 피드와 소식에 싣지 않는다(운영 로직 7.3절, 티켓 20261018_1812).
  // 응답은 개체 id뿐이라 이미 비어 있다. 잠김 여부를 읽지 못하면 잠긴 것으로 본다 — 드러내는 쪽이 되돌릴 수 없다.
  let pickedLocked = true
  if (result.inventory_item_id) {
    try {
      pickedLocked = (await findLockedItemIds(service, [result.inventory_item_id])).length > 0
    } catch (err) {
      console.error('[pickup] 잠긴 개체 조회 실패 — 잠긴 것으로 보고 피드·소식을 남기지 않는다:', err)
    }
  }

  // 피드 기록 (배지 + POI 정보 조회)
  const poi = poiRaw as PoiRow
  const { data: badgeRaw } = pickedLocked
    ? { data: null }
    : await service.from('badges').select('id, name, image_url, rarity').eq('id', drop.badge_id).single()
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

  // 주운 배지로 칸이 찼으니 남은 칸 알림을 검사한다(티켓 20261018_0056). 던지지 않는다.
  await notifyInventorySlotsLow(user.id, service)

  return NextResponse.json({ inventory_item_id: result.inventory_item_id })
}
