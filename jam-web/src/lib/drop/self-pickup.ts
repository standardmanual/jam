/**
 * 자기 픽업 판별 — «자기 드랍을 자기가 주운 것인가» (티켓 20261018_1812, 운영 로직 9.5절)
 *
 * 자기 드랍을 줍는 것은 허용되지만 챕터 점수와 드랍·픽업 횟수에는 세지 않는다. 횟수 지표(`jamActionDropMetrics.ts`의
 * `computeDropPickupMetrics`)와 판정 트리거(`jamActionDropTriggers.ts`의 `jamTriggersForPickup`)는 이미 같은 기준으로 자기 드랍을 뺀다.
 * 챕터 점수(묶음 5)가 같은 기준을 쓰도록 이 정의를 한 곳에 둔다. 같은 정의인지는 `__tests__/self-pickup.test.ts`가 고정한다.
 *
 * 놓은 사람이 없는 드랍(시스템 드랍·놓은 사람이 탈퇴한 드랍, `dropper_user_id` null)은 자기 드랍이 아니다.
 */

/** 자기 픽업 판정에 필요한 드랍의 값 */
export interface SelfPickupDrop {
  /** 놓은 사람. 시스템 드랍이거나 놓은 사람이 탈퇴했으면 null */
  dropper_user_id: string | null
}

/** `userId`가 줍는 이 드랍이 자기 드랍이면 true */
export function isSelfPickup(drop: SelfPickupDrop, userId: string): boolean {
  return drop.dropper_user_id !== null && drop.dropper_user_id === userId
}
