/**
 * 컬렉션 완성 판정 공용 함수 (티켓 20260921_1110, 상위 20260914_1130)
 *
 * 정책: 완성 분모는 컬렉션 소속 배지에서 `drop_excluded = true`를 뺀 id 집합이다
 * (티켓 20260911_2236). 분자는 채운 배지 id 집합과 분모의 교집합 크기다 —
 * 슬롯 개수를 그대로 쓰지 않으므로 제외 배지를 이미 장착한 사용자가 조기 완성되지 않는다.
 * 예외(티켓 20260921_1142): 제외를 뺀 분모가 비고 등록 배지가 1개 이상이면 등록 배지 전체가 분모다.
 *
 * 순수 함수다. DB 조회는 호출부(checker·completable)가 한다.
 */
import { buildBadgeIdsOfBook } from '@/lib/drop-engine'

export interface CompletionBadgeInput {
  id: string
  item_book_id: string | null
  type: string
  drop_excluded: boolean | null
}

export interface BookCompletion {
  denomIds: string[]
  filledIds: string[]
  total: number
  filled: number
  complete: boolean
}

const EMPTY_SET: ReadonlySet<string> = new Set()

export function computeBookCompletion(
  badges: CompletionBadgeInput[],
  filledBadgeIds: ReadonlySet<string>,
  options?: {
    types?: readonly string[]
    /**
     * 북별 채운 배지 집합(티켓 20260924_0937). 있으면 각 북의 분자를 그 북의 집합으로만 센다
     * (집합에 없는 북은 빈 집합). 없으면 `filledBadgeIds` 하나를 모든 북에 공통으로 쓴다.
     * 장착 RPC(mig/179)처럼 "그 컬렉션에 장착된 슬롯만" 세야 하는 호출부(checker)가 쓴다.
     */
    filledByBook?: ReadonlyMap<string, ReadonlySet<string>>
  }
): Map<string, BookCompletion> {
  const types = options?.types
  const filledByBook = options?.filledByBook
  const target = types ? badges.filter((b) => types.includes(b.type)) : badges
  const denomByBook = buildBadgeIdsOfBook(
    target.map((b) => ({
      id: b.id,
      item_book_id: b.item_book_id ?? '',
      drop_excluded: b.drop_excluded ?? false,
    })) as Parameters<typeof buildBadgeIdsOfBook>[0]
  )

  const registeredByBook = new Map<string, string[]>()
  for (const b of target) {
    if (!b.item_book_id) continue
    const key = b.item_book_id
    const list = registeredByBook.get(key)
    if (list) list.push(b.id)
    else registeredByBook.set(key, [b.id])
  }

  const result = new Map<string, BookCompletion>()
  for (const [bookId, registered] of registeredByBook) {
    const excludedApplied = denomByBook.get(bookId) ?? []
    const denomIds =
      excludedApplied.length === 0 && registered.length > 0 ? registered : excludedApplied
    const filledSet = filledByBook ? (filledByBook.get(bookId) ?? EMPTY_SET) : filledBadgeIds
    const filledIds = denomIds.filter((id) => filledSet.has(id))
    result.set(bookId, {
      denomIds,
      filledIds,
      total: denomIds.length,
      filled: filledIds.length,
      complete: denomIds.length > 0 && filledIds.length >= denomIds.length,
    })
  }
  return result
}
