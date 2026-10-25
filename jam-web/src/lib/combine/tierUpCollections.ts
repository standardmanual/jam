/**
 * 등급 올리기에서 고를 수 있는 컬렉션 목록 (티켓 20261023_1648 3회, 운영 로직 8.4절)
 *
 * 믹스 화면(`app/(main)/combine/page.tsx`)이 소속 트라이브의 열린 컬렉션과 «그 컬렉션에서 지금 실제로 나올 수 있는 아이템 배지의 등급»을 읽어
 * 화면에 내린다. 화면은 재료 등급에 맞는 것만 걸러 보인다(`tierUpCollectionChoices`).
 *
 * 규칙: 나올 수 있는 아이템 배지의 판정(소속 트라이브 · 활성 · 공개 기간 안 · 드랍 제외 아님 · 삭제 아님)은 서버 굴림이 쓰는
 * `listIssueCandidates`(`drop-engine/syncIssue.ts`)를 **그대로 부른다.** 조건을 여기서 다시 쓰지 않는다 — 화면이 보인 컬렉션을 서버가
 * `invalid_collection`·`no_candidate`로 거절하는 어긋남(드리프트)을 막기 위해서다. DB에서 읽는 양을 줄이는 조회 조건(활성·드랍 제외 아님,
 * 소속 트라이브)은 `loadRollData`(`capsule/open.ts`)가 같은 풀을 읽는 방식을 따른 것이고, 최종 판정은 위 함수가 한다.
 *
 * 읽지 못하면 빈 배열이 아니라 null을 돌려준다. 빈 배열은 «읽었더니 없다»이고 null은 «읽지 못했다»라서, 화면이 «컬렉션이 없다»고 거짓말하지 않는다.
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TierUpCollectionOption } from '@/app/(main)/combine/tierUpClient'
import { fetchAllRowsIn } from '@/lib/db/fetchAllRows'
import { listIssueCandidates, type IssueBadge, type IssueBook } from '@/lib/drop-engine/syncIssue'
import type { BadgeRarity } from '@/types/database'

/** 컬렉션 판정 칸에 이름·이미지를 더한 읽기 모양 */
export interface TierUpCollectionBook extends IssueBook {
  name: string
  image_url: string | null
}

/** 낮은 등급부터 — 컬렉션마다 `rarities`가 이 순서로 담긴다 */
const RARITIES: readonly BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

/**
 * 순수 — 읽어 온 컬렉션·아이템 배지에서 컬렉션별로 «지금 나올 수 있는 등급»을 만든다. 나올 수 있는 배지가 하나도 없는 컬렉션은 뺀다.
 * 등급마다 `listIssueCandidates`를 한 번씩 부른다(서버 굴림이 등급을 정한 뒤 후보를 고르는 것과 같은 호출이다).
 */
export function buildTierUpCollectionOptions(input: {
  tribeId: string
  books: readonly TierUpCollectionBook[]
  badges: readonly IssueBadge[]
  now: Date
}): TierUpCollectionOption[] {
  const raritiesByBook = new Map<string, Set<BadgeRarity>>()
  for (const rarity of RARITIES) {
    for (const badge of listIssueCandidates({ tribeId: input.tribeId, rarity, books: input.books, badges: input.badges, now: input.now })) {
      if (badge.item_book_id === null) continue
      const found = raritiesByBook.get(badge.item_book_id) ?? new Set<BadgeRarity>()
      found.add(rarity)
      raritiesByBook.set(badge.item_book_id, found)
    }
  }
  return input.books
    .filter((book) => raritiesByBook.has(book.id))
    .map((book) => ({
      id: book.id,
      name: book.name,
      imageUrl: book.image_url,
      rarities: RARITIES.filter((rarity) => raritiesByBook.get(book.id)?.has(rarity)),
    }))
}

/**
 * 소속 트라이브의 열린 컬렉션과 등급을 읽는다. 소속 트라이브가 없으면 빈 배열이다(고를 컬렉션이 없다). 어느 읽기든 실패하면 null이다.
 * 이름·이미지는 `item_books`에서 따로 읽는다 — `loadRollData`는 두 칸을 읽지 않고 등급 올리기 서버 규칙(2회)이 같이 쓰므로 건드리지 않는다.
 */
export async function loadTierUpCollections(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<TierUpCollectionOption[] | null> {
  try {
    const { data: userRow, error: userError } = await supabase.from('users').select('tribe_id').eq('id', userId).maybeSingle()
    if (userError) throw new Error(`users 조회 실패: ${userError.message}`)
    const tribeId = (userRow as { tribe_id?: string | null } | null)?.tribe_id ?? null
    if (!tribeId) return []

    const { data: bookRows, error: bookError } = await supabase
      .from('item_books')
      .select('id, name, image_url, tribe_id, is_active, drop_excluded, valid_from, valid_until')
      .eq('tribe_id', tribeId)
      .eq('is_active', true)
      .eq('drop_excluded', false)
    if (bookError) throw new Error(`item_books 조회 실패: ${bookError.message}`)
    const books = (bookRows ?? []) as TierUpCollectionBook[]

    const badges = await fetchAllRowsIn<IssueBadge, string>(
      'tier-up-collections:item-badges',
      'id',
      books.map((book) => book.id),
      (chunk) =>
        supabase
          .from('badges')
          .select('id, rarity, item_book_id, drop_excluded, valid_from, valid_until, deleted_at')
          .eq('type', 'item')
          .is('deleted_at', null)
          .in('item_book_id', chunk),
    )

    return buildTierUpCollectionOptions({ tribeId, books, badges, now })
  } catch (error) {
    console.error('[combine/page] 등급 올리기 컬렉션 목록 조회 실패', error)
    return null
  }
}
