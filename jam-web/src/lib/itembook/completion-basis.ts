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

export function computeBookCompletion(
  badges: CompletionBadgeInput[],
  filledBadgeIds: ReadonlySet<string>,
  options?: { types?: readonly string[] }
): Map<string, BookCompletion> {
  const types = options?.types
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
    const filledIds = denomIds.filter((id) => filledBadgeIds.has(id))
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
