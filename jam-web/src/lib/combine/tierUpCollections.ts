/**
 * 서비스 전체에서 «지금 나올 수 있는 아이템 배지의 등급»을 만드는 순수 함수 (티켓 20261023_1648 3회, 20261108_2322 정리, 20261111_0846, 운영 로직 8.4절)
 *
 * 서버 시작 검사(`tierUp.ts`)와 어드민 아이템 길(`admin/itemPaths/compute.ts`)이 쓴다. 믹스 화면은 컬렉션 목록을 읽지 않는다 — 유저가 컬렉션을
 * 고르지 않기 때문이다(티켓 20261108_2322).
 *
 * 규칙: 나올 수 있는 아이템 배지의 판정(활성 · 공개 기간 안 · 드랍 제외 아님 · 삭제 아님, **트라이브는 보지 않는다**)은 서버 굴림이 쓰는
 * `listServiceIssueCandidates`(`drop-engine/syncIssue.ts`)를 **그대로 부른다.** 조건을 여기서 다시 쓰지 않는다 — 서버와 어드민의 판정이 어긋나는 것(드리프트)을 막기 위해서다.
 */
import { listServiceIssueCandidates, type IssueBadge, type IssueBook } from '@/lib/drop-engine/syncIssue'
import type { BadgeRarity } from '@/types/database'

/** 낮은 등급부터 */
const RARITIES: readonly BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

/**
 * 순수 — 서비스 전체에서 «지금 나올 수 있는 등급»을 만든다. 나올 수 있는 배지가 하나도 없는 등급은 집합에 없다.
 * 등급마다 `listServiceIssueCandidates`를 한 번씩 부른다(서버 굴림이 등급을 정한 뒤 후보를 고르는 것과 같은 호출이다).
 * 서버 시작 검사와 어드민 아이템 길이 같은 함수를 쓴다.
 */
export function issuableServiceRarities(input: { books: readonly IssueBook[]; badges: readonly IssueBadge[]; now: Date }): Set<BadgeRarity> {
  const rarities = new Set<BadgeRarity>()
  for (const rarity of RARITIES) {
    if (listServiceIssueCandidates({ rarity, books: input.books, badges: input.badges, now: input.now }).length > 0) rarities.add(rarity)
  }
  return rarities
}
