/**
 * 막힌 장착·믹스·드랍 판별 — 클라이언트에서 쓰는 순수 함수 (티켓 20261018_0056)
 *
 * 서버는 잠긴 개체의 장착·믹스·드랍을 409 + `code: 'locked_item_not_allowed'`로 거절하고, 가득 찬 인벤토리의 장착 풀기를 409 + `code: 'inventory_full'`로
 * 거절한다. 둘 다 사용자가 잘못한 것이 아니라 «지금은 안 되는 까닭»이라 화면은 일반 실패(error)가 아니라 안내(info)로 낸다.
 * 장착 풀기의 가득 참은 SlotGrid가 서버 문구를 중립 배너로 그대로 보이므로 판별 함수 없이 `code` 값만 싣는다.
 * `suspension/suspended-block.ts`의 정지 403 판별과 같은 모양이다.
 *
 * 클라이언트·서버 경계: 순수 모듈이다. 서버 모듈(`lockedItem.ts`는 Supabase 조회 함수를 함께 둔다)을 가져오지 않는다. 코드 상수는 이 파일이 원천이고
 * `lockedItem.ts`가 다시 내보낸다.
 */

/** 잠긴 개체를 쓸 수 없을 때 응답이 싣는 `code`(`reason`) 값 — 장착·믹스·드랍이 같은 코드를 쓴다 */
export const LOCKED_ITEM_NOT_ALLOWED_CODE = 'locked_item_not_allowed'

/** 인벤토리가 가득 차 장착을 풀 수 없을 때 응답이 싣는 `code` 값 */
export const INVENTORY_FULL_CODE = 'inventory_full'

/** 상태 코드와 본문(이미 읽은 JSON)이 잠긴 개체 거절 409인가. 믹스 응답은 `reason`에도 같은 값을 싣는다 */
export function isLockedItemBody(status: number, body: unknown): boolean {
  if (status !== 409 || !body || typeof body !== 'object') return false
  const b = body as { code?: unknown; reason?: unknown }
  return b.code === LOCKED_ITEM_NOT_ALLOWED_CODE || b.reason === LOCKED_ITEM_NOT_ALLOWED_CODE
}
