/**
 * 잠긴 개체의 사용 제한 — 거부 코드와 판정 (티켓 20261018_0051 1회, 운영 로직 7.2절)
 *
 * 잠긴 개체(`inventory_items.locked`)는 컬렉션 장착·교체, 믹스 재료, 드랍에 쓸 수 없다(드랍은 묶음 4가 잠긴 채 드랍을 열 때까지).
 * 거절은 서버가 한다. 마이그레이션 231의 트리거(`locked_item_cannot_be_slotted`, `locked_item_cannot_be_dropped`)는 `slotted_in`·`dropped_at`
 * 갱신만 막는 마지막 방어선이라, 각 경로는 호출 전에 `findLockedItemIds`로 먼저 거르고, 트리거 오류가 올라오면 같은 코드로 바꾼다.
 *
 * 서버 전용 모듈을 가져오지 않는다 — Supabase 클라이언트는 호출부가 넘긴다(타입만 가져온다).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** 잠긴 개체를 쓸 수 없을 때 응답이 싣는 `code`(`reason`) 값 — 장착·믹스·드랍이 같은 코드를 쓴다 */
export const LOCKED_ITEM_NOT_ALLOWED_CODE = 'locked_item_not_allowed'

/** 마이그레이션 231 트리거가 올리는 오류 메시지 — 장착과 드랍 */
export const LOCKED_ITEM_TRIGGER_MESSAGES = ['locked_item_cannot_be_slotted', 'locked_item_cannot_be_dropped'] as const

/** DB 오류가 잠긴 개체 거부 트리거에서 온 것인가 */
export function isLockedItemTriggerError(error: { message?: string | null } | null | undefined): boolean {
  const message = error?.message
  if (typeof message !== 'string') return false
  return LOCKED_ITEM_TRIGGER_MESSAGES.some((m) => message.includes(m))
}

/**
 * 주어진 개체 중 잠긴 것의 id. 읽지 못하면 던진다 — 잠긴 개체를 열린 것으로 보고 통과시키는 쪽이 위험하므로 호출부가 500으로 닫는다.
 * 존재하지 않는 id는 결과에 없다(잠긴 것이 아니므로 기존 경로의 «없음» 판정에 맡긴다).
 */
export async function findLockedItemIds(supabase: SupabaseClient, itemIds: readonly string[]): Promise<string[]> {
  if (itemIds.length === 0) return []
  const { data, error } = await supabase.from('inventory_items').select('id').in('id', [...itemIds]).eq('locked', true)
  if (error) throw new Error(`잠긴 개체 조회 실패: ${error.message}`)
  return ((data ?? []) as { id: string }[]).map((row) => row.id)
}
