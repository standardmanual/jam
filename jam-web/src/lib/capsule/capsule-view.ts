/**
 * 캡슐 화면용 순수 변환 (티켓 20261018_0054 1회)
 *
 * 서버가 준 값(필요량, 채운 양, 열 수 있는지, 못 여는 까닭)을 화면 상태로 옮기는 것까지만 한다. 열 수 있는지·못 여는 까닭을
 * 다시 계산하지 않는다. 게이지 비율은 표현 값이고 화면에 숫자로 내보내지 않는다(운영 로직 4.3절).
 *
 * 클라이언트·서버 경계: `capsule-contract`의 타입만 가져오는 순수 모듈이다.
 */
import type { CapsuleErrorResponse, CapsuleOpenPayload, CapsuleStatus } from '@/lib/capsule/capsule-contract'

/** 알약과 시트가 그리는 상태 — 로딩·오류는 데이터가 없는 상태라 여기에 없다 */
export type CapsuleViewStatus = 'filling' | 'ready' | 'noSlots'

/** 서버 필드로 화면 상태를 고른다. 못 여는 까닭이 빈칸 모자람이면 noSlots, 열 수 있으면 ready, 그 밖은 filling */
export function capsuleViewStatus(status: CapsuleStatus): CapsuleViewStatus {
  if (status.notOpenableReason === 'no_free_slots') return 'noSlots'
  if (status.openable) return 'ready'
  return 'filling'
}

/** 게이지 비율(0~100). 필요량이 0 이하면 0이다 */
export function capsulePercent(status: Pick<CapsuleStatus, 'required' | 'filled'>): number {
  if (!(status.required > 0)) return 0
  return Math.min(100, Math.max(0, (status.filled / status.required) * 100))
}

/**
 * 열기가 `insufficient_slots`로 거절됐을 때의 상태. 채우기 응답에는 빈칸 수가 없어서 «열 수 있음»으로 보였다가
 * 열기에서 빈칸 모자람이 드러날 수 있다. 응답이 준 빈칸 수를 그대로 싣는다.
 */
export function withInsufficientSlots(status: CapsuleStatus, body: Pick<CapsuleErrorResponse, 'freeSlots' | 'neededSlots'>): CapsuleStatus {
  return {
    ...status,
    openable: false,
    notOpenableReason: 'no_free_slots',
    ...(body.freeSlots !== undefined ? { freeSlots: body.freeSlots } : {}),
    ...(body.neededSlots !== undefined ? { neededSlots: body.neededSlots } : {}),
  }
}

/**
 * 열기가 끝난 직후의 임시 상태 — 열자마자 생긴 다음 캡슐(`next`)의 필요량·채운 양으로 게이지를 바로 옮기고,
 * 빈칸 수 같은 나머지는 뒤따르는 `GET /api/capsule` 응답이 정한다. 잼 잔액은 열기에서 줄지 않는다.
 */
export function statusAfterOpen(prev: CapsuleStatus, next: CapsuleOpenPayload['next']): CapsuleStatus {
  const remaining = Math.max(0, next.required - next.filled)
  return {
    ...prev,
    required: next.required,
    filled: next.filled,
    remaining,
    balance: prev.balance,
    openable: false,
    notOpenableReason: remaining > 0 ? 'not_full' : null,
  }
}
