/**
 * 컬렉션별 "채운 배지 집합" 구성 순수 함수 — 티켓 20260926_1344 (1245·1246)
 *
 * 완성 판정을 하는 `checker.ts`(보정)와 완성 가능 소식을 판정하는 `completable.ts`(표시)가
 * 같은 집합을 쓰도록 한 곳에 둔다. Supabase 호출 없이 입력만으로 결정된다.
 *
 * 장착 RPC(mig/179)처럼 "그 컬렉션에 장착된 슬롯만" 그 컬렉션의 분자로 센다(티켓 20260924_0937).
 * 배지의 컬렉션이 장착 이후 바뀌어도 다른 북의 분자에 들지 않는다.
 */

export interface FilledByBookInput {
  /** 유저가 장착한 슬롯 (`user_item_book_slots`) */
  slots: readonly { item_book_id: string; badge_id: string }[]
  /** 북별 체크인 배지 id 목록 (`badges.type = 'checkin'`이고 `item_book_id`가 있는 것) */
  checkinBadgesByBook: ReadonlyMap<string, readonly string[]>
  /** 1회 이상 획득 이력이 있는 체크인 배지 id (`user_checkin_badge_earns`) */
  earnedCheckinBadgeIds: ReadonlySet<string>
}

/**
 * 북별 채운 배지 집합. 슬롯은 그 슬롯의 `item_book_id` 집합에만,
 * 체크인 획득 이력은 그 배지가 속한 북의 집합에만 넣는다.
 * 채운 배지가 없는 북은 결과에 키가 없다(조회 시 빈 집합으로 다룬다).
 */
export function buildFilledByBook({
  slots,
  checkinBadgesByBook,
  earnedCheckinBadgeIds,
}: FilledByBookInput): Map<string, Set<string>> {
  const filledByBook = new Map<string, Set<string>>()
  const addFilled = (bookId: string, badgeId: string) => {
    const set = filledByBook.get(bookId)
    if (set) set.add(badgeId)
    else filledByBook.set(bookId, new Set([badgeId]))
  }

  for (const s of slots) addFilled(s.item_book_id, s.badge_id)

  // 체크인 배지는 슬롯팅이 아니라 "1회 이상 획득 이력 존재"로 채움 판정(Phase 16)
  for (const [bookId, ids] of checkinBadgesByBook) {
    for (const id of ids) {
      if (earnedCheckinBadgeIds.has(id)) addFilled(bookId, id)
    }
  }

  return filledByBook
}
