/**
 * "완성 가능한데 아직 안 넣은" 컬렉션 판정 (서버 사이드 전용) — 티켓 20260824_019
 *
 * 소식 #11(컬렉션 완성 가능)의 트리거다. **완성 시점이 아니라 완성할 수 있는데
 * 아직 장착하지 않은 시점**의 소식이라, 완성 처리를 하는 `checkItemBookCompletion()`
 * (슬롯이 이미 다 찬 경우)과는 판정 대상이 정확히 반대다.
 *
 * 채움 판정은 타입별로 다르다(Phase 16 규칙 그대로).
 *   - `item` 배지: `user_item_book_slots`에 들어가야 채워진다
 *   - `poi`  배지: 1회 이상 획득 이력이 있으면 채워진다 (슬롯팅 개념 없음)
 *
 * service_role 클라이언트 사용 (RLS 우회)
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { BadgeType } from '@/types/database'

export interface CompletableItemBook {
  id: string
  name: string
}

/**
 * 유저가 지금 장착만 하면 완성되는 컬렉션 목록.
 *
 * @returns 완성 가능(잔여 칸 전부를 보유한 미장착 아이템으로 채울 수 있음)한 북.
 *          조회 실패 시 빈 배열 (소식이 하나 덜 나갈 뿐 본 흐름을 막지 않는다)
 */
export async function findCompletableItemBooks(userId: string): Promise<CompletableItemBook[]> {
  const supabase = createServiceClient()

  const { data: booksRaw, error: booksError } = await supabase
    .from('item_books')
    .select('id, name')
    .eq('is_active', true)

  if (booksError) {
    console.error('[findCompletableItemBooks] item_books 조회 오류:', booksError)
    return []
  }
  const books = (booksRaw ?? []) as { id: string; name: string }[]
  if (books.length === 0) return []

  const bookIds = books.map((b) => b.id)

  // 20260825_025: 완성 기준선(분모)은 소프트 삭제 여부와 무관하게 고정한다.
  // 삭제된 배지도 그대로 북 소속 배지 집합에 포함한다.
  //
  // 티켓 20260825_029: checker.ts와 동일한 이유로(활성 아이템북 전체 × item+poi 타입 —
  // type 필터만으로는 1000행 미만이 구조적으로 보장되지 않음) range로 페이지를 끝까지
  // 넘겨 전량을 가져온다. 절단되면 완성 가능 판정(분모)이 실제보다 작게 잡혀 "완성 가능"
  // 소식이 잘못된 타이밍에 나가는 오판으로 이어질 수 있다.
  const COMPLETABLE_BADGE_PAGE_SIZE = 1000
  type BookBadgeRow = { id: string; item_book_id: string | null; type: BadgeType }
  const bookBadges: BookBadgeRow[] = []
  for (let from = 0; ; from += COMPLETABLE_BADGE_PAGE_SIZE) {
    const { data: pageRaw, error: badgesError } = await supabase
      .from('badges')
      .select('id, item_book_id, type')
      .in('item_book_id', bookIds)
      .in('type', ['item', 'checkin'])
      .order('id')
      .range(from, from + COMPLETABLE_BADGE_PAGE_SIZE - 1)

    if (badgesError) {
      console.error('[findCompletableItemBooks] badges 조회 오류:', badgesError)
      return []
    }
    const page = (pageRaw ?? []) as BookBadgeRow[]
    bookBadges.push(...page)
    if (page.length < COMPLETABLE_BADGE_PAGE_SIZE) break
  }

  const badgeIdsByBook = new Map<string, string[]>()
  const poiBadgeIds: string[] = []
  const bookIdByBadge = new Map<string, string>()
  for (const b of bookBadges) {
    if (!b.item_book_id) continue
    const list = badgeIdsByBook.get(b.item_book_id) ?? []
    list.push(b.id)
    badgeIdsByBook.set(b.item_book_id, list)
    bookIdByBadge.set(b.id, b.item_book_id)
    if (b.type === 'checkin') poiBadgeIds.push(b.id)
  }
  if (badgeIdsByBook.size === 0) return []

  const allBadgeIds = bookBadges.map((b) => b.id)

  const [slotsRes, poiEarnsRes, inventoryRes] = await Promise.all([
    supabase
      .from('user_item_book_slots')
      .select('item_book_id, badge_id')
      .eq('user_id', userId)
      .in('item_book_id', bookIds),
    poiBadgeIds.length > 0
      ? supabase
          .from('user_checkin_badge_earns')
          .select('badge_id')
          .eq('user_id', userId)
          .in('badge_id', poiBadgeIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('inventory').select('id').eq('user_id', userId).maybeSingle(),
  ])

  if (slotsRes.error || poiEarnsRes.error || inventoryRes.error) {
    console.error(
      '[findCompletableItemBooks] 보유 현황 조회 오류:',
      slotsRes.error ?? poiEarnsRes.error ?? inventoryRes.error
    )
    return []
  }

  /** 이미 채워진 칸 = 슬롯에 들어간 배지 ∪ 획득 이력이 있는 POI 배지 */
  const filledBadgeIds = new Set<string>()
  for (const s of (slotsRes.data ?? []) as { item_book_id: string; badge_id: string }[]) {
    filledBadgeIds.add(s.badge_id)
  }
  for (const e of (poiEarnsRes.data ?? []) as { badge_id: string }[]) {
    filledBadgeIds.add(e.badge_id)
  }

  // 미장착 보유 아이템 배지 — 드랍해서 넘긴 것(dropped_at)은 더 이상 내 소유가 아니다
  const inventoryId = (inventoryRes.data as { id: string } | null)?.id ?? null
  const ownedUnslottedBadgeIds = new Set<string>()
  if (inventoryId && allBadgeIds.length > 0) {
    const { data: invItemsRaw, error: invItemsError } = await supabase
      .from('inventory_items')
      .select('badge_id')
      .eq('inventory_id', inventoryId)
      .in('badge_id', allBadgeIds)
      .is('dropped_at', null)
      .is('slotted_in', null)

    if (invItemsError) {
      console.error('[findCompletableItemBooks] inventory_items 조회 오류:', invItemsError)
      return []
    }
    for (const it of (invItemsRaw ?? []) as { badge_id: string }[]) {
      ownedUnslottedBadgeIds.add(it.badge_id)
    }
  }

  const result: CompletableItemBook[] = []
  for (const book of books) {
    const badgeIds = badgeIdsByBook.get(book.id) ?? []
    if (badgeIds.length === 0) continue // 배지 없는 북은 완성 불가

    const remaining = badgeIds.filter((id) => !filledBadgeIds.has(id))
    // 잔여 칸이 없으면 이미 완성 상태 — #11의 대상이 아니다
    if (remaining.length === 0) continue

    // 잔여 칸을 **전부** 보유한 미장착 아이템으로 채울 수 있어야 "완성 가능"이다
    const coverable = remaining.every((id) => ownedUnslottedBadgeIds.has(id))
    if (coverable) result.push({ id: book.id, name: book.name })
  }

  return result
}
