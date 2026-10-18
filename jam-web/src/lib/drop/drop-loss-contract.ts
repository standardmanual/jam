/**
 * 드랍으로 사라질 채운 양 계약 — 서버와 클라이언트가 함께 읽는 순수 타입·판정 (티켓 20261018_1812, 운영 로직 7.2절)
 *
 * 채우다 만 잠긴 개체를 드랍하면 채운 양은 사라지고 돌려주지 않는다(`create_user_drop`이 0으로 되돌린다, 마이그레이션 239).
 * 드랍 확인 단계(4-6)가 «채운 잼 N은 사라져요»를 보이려고 드랍 전에 읽는 값이다. 열린 개체이거나 채운 양이 0이면 0이다.
 * 응답에는 이름·그림 등 개체를 알 수 있는 값을 싣지 않는다(7.3절).
 *
 * 이 파일은 아무것도 가져오지 않는다 — 클라이언트 컴포넌트가 가져와도 서버 모듈이 번들에 끌려오지 않는다.
 */

/** 사라질 양 조회 응답 */
export interface DropLossPayload {
  /** 드랍하면 사라질 채운 양. 열린 개체이거나 채운 양이 없으면 0 */
  lostFill: number
}

/** 사라질 양을 계산하는 데 쓰는 개체 상태 — `LockedItemStatus`의 일부 */
export interface DropLossSource {
  locked: boolean
  filled: number
}

/** 잠긴 개체만 채운 양이 사라진다. 열린 개체의 채운 양은 열 때 쓰였으므로 0이고, 음수·비정상 값도 0으로 닫는다 */
export function computeLostFill(item: DropLossSource): number {
  if (!item.locked) return 0
  return Number.isFinite(item.filled) && item.filled > 0 ? item.filled : 0
}
