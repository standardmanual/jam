/**
 * 컬렉션별로 «지금 나올 수 있는 아이템 배지의 등급»을 만드는 순수 함수 (티켓 20261023_1648 3회, 20261108_2322 정리, 운영 로직 8.4절)
 *
 * 서버 굴림(`tierUp.ts`)과 어드민 아이템 길(`admin/itemPaths/compute.ts`)이 쓴다. 믹스 화면은 더 이상 컬렉션 목록을 읽지 않는다 — 유저가 컬렉션을
 * 고르지 않기 때문이다(티켓 20261108_2322).
 *
 * 규칙: 나올 수 있는 아이템 배지의 판정(소속 트라이브 · 활성 · 공개 기간 안 · 드랍 제외 아님 · 삭제 아님)은 서버 굴림이 쓰는
 * `listIssueCandidates`(`drop-engine/syncIssue.ts`)를 **그대로 부른다.** 조건을 여기서 다시 쓰지 않는다 — 서버와 어드민의 판정이 어긋나는 것(드리프트)을 막기 위해서다.
 */
import { listIssueCandidates, type IssueBadge, type IssueBook } from '@/lib/drop-engine/syncIssue'
import type { BadgeRarity } from '@/types/database'

/** 낮은 등급부터 */
const RARITIES: readonly BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

/**
 * 순수 — 컬렉션별로 «지금 나올 수 있는 등급»을 만든다. 나올 수 있는 배지가 하나도 없는 컬렉션은 맵에 없다.
 * 등급마다 `listIssueCandidates`를 한 번씩 부른다(서버 굴림이 등급을 정한 뒤 후보를 고르는 것과 같은 호출이다).
 * 서버 굴림과 어드민 아이템 길이 같은 함수를 쓴다.
 */
export function issuableRaritiesByBook(input: {
  tribeId: string
  books: readonly IssueBook[]
  badges: readonly IssueBadge[]
  now: Date
}): Map<string, Set<BadgeRarity>> {
  const raritiesByBook = new Map<string, Set<BadgeRarity>>()
  for (const rarity of RARITIES) {
    for (const badge of listIssueCandidates({ tribeId: input.tribeId, rarity, books: input.books, badges: input.badges, now: input.now })) {
      if (badge.item_book_id === null) continue
      const found = raritiesByBook.get(badge.item_book_id) ?? new Set<BadgeRarity>()
      found.add(rarity)
      raritiesByBook.set(badge.item_book_id, found)
    }
  }
  return raritiesByBook
}
