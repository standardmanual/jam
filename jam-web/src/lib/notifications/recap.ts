/**
 * ① 활동 결산 기록 (서버 사이드 전용) — 티켓 20260827_014
 * 스펙: Specs/PRD/Notification/RECAP_CASEBOOK.md
 *
 * ## 왜 한 곳에서 조립하지 않고 점진 병합인가
 *
 * 원칙적으로는 "활동 처리가 끝난 뒤 한 번 조립"이 깔끔하다. 그런데 보상 발급 지점이
 * `strava/sync`·`badge-engine`·`drop-engine`·`points` 네 곳에 흩어져 있고, 그중
 * **`points`와 `drop-engine`은 동기화 밖에서도 호출된다**(믹스·어드민·시뮬레이터).
 * 한 곳 조립으로 바꾸면 그 경로들의 보상이 결산에서 통째로 빠지거나, 수집기를 네 파일에
 * 실어 나르는 배관이 생긴다.
 *
 * 티켓이 우려한 「반쪽 결산」(배지만 있고 포인트가 빠진 채 확정된 것처럼 보이는 행)은
 * **묶음 단위를 KST 하루로 잡아** 해소한다.
 *
 *   · 하루 단위라 결산은 "확정된 행"이 아니라 **계속 자라는 행**이다. 중간에 sync가
 *     실패해도 남는 것은 「덜 자란 결산」이고, 다음 처리가 이어서 채운다.
 *   · 활동 2건 이상이면 자동으로 F2(「활동 N건에서 …」)가 된다 — R11이 한 행으로
 *     접으라고 요구하는 것을 group_key가 그대로 구현한다.
 *   · ①보상은 `bumps_badge=false`라 병합이 dot을 다시 켜지 않는다. 중간 상태가
 *     유저를 불러내지 않는다.
 *   · 같은 활동 재처리(F5)는 `appendKeys`의 중복 제거가 흡수한다.
 */
import { createNotification, type NotificationServiceClient } from './index'
import { dailyGroupKey } from './groupKey'
import type { NotificationPayloadMap } from './types'

export type ActivityRecapFragment = NotificationPayloadMap['activity_recap']

/**
 * 배열 필드는 전부 누적한다 — 얕은 병합으로 두면 나중에 온 조각이 앞의 목록을 통째로
 * 덮어써 "배지만 있고 아이템이 사라진" 결산이 된다 (DATA_MODEL §6).
 */
export const RECAP_APPEND_KEYS = [
  'activity_ids',
  'activity_badges',
  'checkin_badges',
  'item_badges',
] as const

/** 포인트는 종류가 아니라 문장 꼬리의 부속이라 합산한다 */
export const RECAP_SUM_KEYS = ['points'] as const

function isEmpty(fragment: ActivityRecapFragment): boolean {
  return (
    (fragment.activity_badges?.length ?? 0) === 0 &&
    (fragment.checkin_badges?.length ?? 0) === 0 &&
    (fragment.item_badges?.length ?? 0) === 0 &&
    !fragment.first_badge_id &&
    (fragment.points ?? 0) === 0
  )
}

/**
 * 결산 조각 1개를 오늘(KST) 결산 행에 합친다.
 *
 * **보상이 하나도 없으면 만들지 않는다**(F1 — "이번 활동은 조용했어요"는 순수 노이즈다).
 * `activity_ids`만 있는 조각도 만들지 않는다 — 활동 수만 오르고 문장은 만들 수 없다.
 */
export async function recordActivityRecap(
  userId: string,
  fragment: ActivityRecapFragment,
  options: { at?: Date | string | number; client?: NotificationServiceClient } = {}
): Promise<void> {
  if (!userId || isEmpty(fragment)) return

  await createNotification({
    userId,
    type: 'activity_recap',
    groupKey: dailyGroupKey('activity_recap', options.at ?? new Date()),
    payload: fragment,
    appendKeys: [...RECAP_APPEND_KEYS],
    sumKeys: [...RECAP_SUM_KEYS],
    client: options.client,
  })
}
