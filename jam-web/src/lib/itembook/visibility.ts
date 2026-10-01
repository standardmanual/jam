/**
 * 컬렉션(`item_books`) 노출 판정 — 화면·API·드랍·완성 판정이 같은 조건을 쓰도록 한 곳에 모은다
 * (티켓 20260930_1516, 컬럼은 마이그레이션 171).
 *
 * 판정은 둘이다(사용자 결정 E1, 2026-10-01). 기간이 끝난 컬렉션을 이미 가진 유저에게는 계속 보여
 * 주되, 새로 드랍하거나 완성 판정 대상으로 삼지는 않기 때문이다.
 *
 * | 판정 | 조건 | 쓰는 곳 |
 * |---|---|---|
 * | 공개됨(화면용) | `is_active` 그리고 (`valid_from`이 비었거나 지금 이전) | `/api/itembooks`, `/collections/[id]`, 장착 `/api/itembooks/[id]/slot` |
 * | 노출 중(드랍·완성용) | 공개됨 그리고 (`valid_until`이 비었거나 지금 이후) | 앰비언트 드랍, 완성 판정(`checker.ts`), 완성 가능 소식(`completable.ts`) |
 *
 * 순수 판정(`isItemBook*`)은 이미 읽어 온 행을 거를 때, 쿼리 헬퍼(`apply*ItemBookFilter`)는 DB에서
 * 읽을 때 쓴다. 둘의 조건은 같다. 시작·종료 시각은 경계값을 포함한다(`valid_from <= now <= valid_until`).
 * 순수 판정의 시각 비교는 DB 응답(`...+00:00`)과 `toISOString()`(`...Z`)의 표기가 달라도 어긋나지
 * 않도록 문자열이 아니라 시각(epoch ms)으로 한다.
 *
 * 어드민 컬렉션 목록의 「노출 중」·「기간 밖」 상태 필터(`lib/admin/itembook-list-query.ts`)는 어드민
 * 전용 분류라 이 판정을 쓰지 않는다.
 */

/** 판정에 필요한 `item_books` 컬럼만 */
export interface ItemBookVisibilityFields {
  is_active: boolean
  valid_from: string | null
  valid_until: string | null
}

/** 공개됨 — 활성이고 시작 시각이 지났다(종료 시각은 보지 않는다). 화면·API용 */
export function isItemBookLaunched(book: ItemBookVisibilityFields, nowIso: string): boolean {
  if (!book.is_active) return false
  if (book.valid_from && new Date(book.valid_from).getTime() > new Date(nowIso).getTime()) return false
  return true
}

/** 노출 중 — 공개됨이고 종료 시각도 지나지 않았다. 드랍·완성 판정용 */
export function isItemBookDroppable(book: ItemBookVisibilityFields, nowIso: string): boolean {
  if (!isItemBookLaunched(book, nowIso)) return false
  if (book.valid_until && new Date(book.valid_until).getTime() < new Date(nowIso).getTime()) return false
  return true
}

/** Supabase 쿼리 빌더가 구조적으로 그대로 들어맞는 최소 인터페이스 */
export interface ItemBookFilterable<Q> {
  eq(column: string, value: boolean): Q
  or(filters: string): Q
}

/** 공개됨 조건을 `item_books` 쿼리에 건다. `nowIso`는 「지금」의 기준 시각이다 */
export function applyLaunchedItemBookFilter<Q extends ItemBookFilterable<Q>>(query: Q, nowIso: string): Q {
  return query.eq('is_active', true).or(`valid_from.is.null,valid_from.lte.${nowIso}`)
}

/** 노출 중 조건을 `item_books` 쿼리에 건다. 공개됨 조건에 종료 시각 조건을 더한 것이다 */
export function applyDroppableItemBookFilter<Q extends ItemBookFilterable<Q>>(query: Q, nowIso: string): Q {
  return applyLaunchedItemBookFilter(query, nowIso).or(`valid_until.is.null,valid_until.gte.${nowIso}`)
}
