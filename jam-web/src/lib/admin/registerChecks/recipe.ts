/**
 * 레시피 등록 전 컬렉션 공개 검사(티켓 20261002_2221, 상위 20260930_1500 ⑧-a, 사용자 결정 2026-10-02).
 *
 * 레시피의 슬롯 후보·보상 배지가 레시피 공개 시각에 아직 열리지 않은 컬렉션 소속이면, 레시피만 열려도 그 배지를 얻을 수 있다.
 * 그래서 예약 등록 전에 막는다(PRD §8.4). 레시피 형식·배지 존재·타입은 어드민 서버 함수(`lib/admin/recipe-write.ts`의 `buildRecipeRow`)가 이미 본다.
 * 이 파일은 배지의 `item_book_id`와 컬렉션의 공개 상태만 읽는다(읽기 전용). 컬렉션 공개 판정은 순수 함수 `isItemBookLaunched`를 쓴다
 * (`lib/itembook/visibility.ts`: 활성이고 `valid_from`이 비었거나 기준 시각 이전). 종료 시각은 보지 않는다.
 *
 * `RegisterChecksClient`의 `in`·`is`만 쓴다. `node:`·Supabase를 가져오지 않는다(이 폴더의 계약).
 */
import { isItemBookLaunched } from '@/lib/itembook/visibility'
import type { RegisterChecksClient } from './shared'

/** 레시피 공개 시각에 열리지 않은 컬렉션에 속한 배지 한 건. */
export interface UnlaunchedCollectionBadge {
  badgeId: string
  itemBookId: string
}

/** `.in()` 한 번에 넣는 ID 개수. 80 × uuid 37자 ≈ 3KB로 URL 상한에 여유가 있다(`recipe-references.ts`와 같은 값). */
const IN_CHUNK = 80

const unique = (values: readonly string[]): string[] => [...new Set(values)]

/**
 * `badgeIds` 가운데 컬렉션(`item_book_id`)이 있고 그 컬렉션이 `atIso` 시점에 공개되지 않은 배지를 돌려준다.
 * 컬렉션이 없는 배지는 무시한다. 배지의 `item_book_id`가 가리키는 컬렉션 행이 없으면 열리지 않은 것으로 본다(판단할 수 없는데 통과시키지 않는다).
 * 삭제된 배지(`deleted_at`이 있음)는 읽지 않는다(존재 확인은 레시피 검증이 따로 한다).
 *
 * 읽지 못하면 «확인 없이 통과시키지 않는다»는 뜻으로 Error를 던진다(`references.ts`와 같다). 호출부가 실패로 본다.
 */
export async function findUnlaunchedCollectionBadges(
  client: RegisterChecksClient,
  badgeIds: readonly string[],
  atIso: string
): Promise<UnlaunchedCollectionBadge[]> {
  const ids = unique(badgeIds)
  const itemBookByBadge = new Map<string, string>()
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const read = await client.from('badges').select('id, item_book_id').in('id', ids.slice(i, i + IN_CHUNK)).is('deleted_at', null)
    if (read.error) throw new Error(`DB 조회에 실패했어요: ${read.error.message}`)
    for (const row of read.data ?? []) {
      if (typeof row.item_book_id === 'string' && row.item_book_id !== '') itemBookByBadge.set(String(row.id), row.item_book_id)
    }
  }
  if (itemBookByBadge.size === 0) return []

  const bookIds = unique([...itemBookByBadge.values()])
  const launchedBookIds = new Set<string>()
  for (let i = 0; i < bookIds.length; i += IN_CHUNK) {
    const read = await client.from('item_books').select('id, is_active, valid_from, valid_until').in('id', bookIds.slice(i, i + IN_CHUNK))
    if (read.error) throw new Error(`DB 조회에 실패했어요: ${read.error.message}`)
    for (const row of read.data ?? []) {
      const book = {
        is_active: row.is_active === true,
        valid_from: typeof row.valid_from === 'string' ? row.valid_from : null,
        valid_until: typeof row.valid_until === 'string' ? row.valid_until : null,
      }
      if (isItemBookLaunched(book, atIso)) launchedBookIds.add(String(row.id))
    }
  }

  return [...itemBookByBadge].filter(([, itemBookId]) => !launchedBookIds.has(itemBookId)).map(([badgeId, itemBookId]) => ({ badgeId, itemBookId }))
}
