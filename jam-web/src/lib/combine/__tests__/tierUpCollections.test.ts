/**
 * 컬렉션별로 나올 수 있는 등급 (티켓 20261023_1648 3회, 20261108_2322 정리, 운영 로직 8.4절)
 *
 * 서버 굴림의 후보 판정(`listIssueCandidates`)과 어긋나지 않는지를 고정한다. 믹스 화면의 컬렉션 목록 읽기는 유저가 컬렉션을 고르지 않게 되면서 없어졌다.
 */
import { describe, expect, it } from 'vitest'
import { listIssueCandidates, type IssueBadge, type IssueBook } from '@/lib/drop-engine/syncIssue'
import { issuableRaritiesByBook } from '../tierUpCollections'

/** 시험용 컬렉션 — 이름·이미지는 판정과 무관하다 */
type TierUpCollectionBook = IssueBook

const NOW = new Date('2026-10-23T03:00:00.000Z')
const TRIBE = 'tribe-run'
const PAST = '2026-01-01T00:00:00.000Z'
const FUTURE = '2027-01-01T00:00:00.000Z'

function book(id: string, overrides: Partial<TierUpCollectionBook> = {}): TierUpCollectionBook {
  return {
    id,
    tribe_id: TRIBE,
    is_active: true,
    drop_excluded: false,
    valid_from: null,
    valid_until: null,
    ...overrides,
  }
}

let badgeSeq = 0
function badge(bookId: string | null, rarity: IssueBadge['rarity'], overrides: Partial<IssueBadge> = {}): IssueBadge {
  badgeSeq += 1
  return {
    id: `badge-${badgeSeq}`,
    rarity,
    item_book_id: bookId,
    drop_excluded: false,
    valid_from: null,
    valid_until: null,
    deleted_at: null,
    ...overrides,
  }
}

/** 컬렉션 id → 낮은 등급부터 정렬한 등급 목록 */
function rarityMap(input: { books: IssueBook[]; badges: IssueBadge[] }): Record<string, string[]> {
  const order = ['common', 'rare', 'epic', 'mystic']
  const map = issuableRaritiesByBook({ tribeId: TRIBE, books: input.books, badges: input.badges, now: NOW })
  return Object.fromEntries([...map].map(([id, set]) => [id, order.filter((rarity) => set.has(rarity as never))]))
}

describe('issuableRaritiesByBook', () => {
  it('컬렉션마다 지금 나올 수 있는 등급을 모은다', () => {
    const books = [book('a'), book('b')]
    const badges = [badge('a', 'epic'), badge('a', 'common'), badge('a', 'common'), badge('a', 'rare'), badge('b', 'mystic')]
    expect(rarityMap({ books, badges })).toEqual({ a: ['common', 'rare', 'epic'], b: ['mystic'] })
  })

  it('나올 수 있는 아이템 배지가 하나도 없는 컬렉션은 맵에 없다', () => {
    const books = [book('empty'), book('has')]
    expect(Object.keys(rarityMap({ books, badges: [badge('has', 'rare')] }))).toEqual(['has'])
  })

  it('다른 트라이브·비활성·드랍 제외·공개 기간 밖 컬렉션은 빠진다', () => {
    const books = [
      book('ok'),
      book('other-tribe', { tribe_id: 'tribe-other' }),
      book('inactive', { is_active: false }),
      book('excluded', { drop_excluded: true }),
      book('not-yet', { valid_from: FUTURE }),
      book('ended', { valid_until: PAST }),
    ]
    const badges = books.map((b) => badge(b.id, 'rare'))
    expect(Object.keys(rarityMap({ books, badges }))).toEqual(['ok'])
  })

  it('드랍 제외·삭제·공개 기간 밖·컬렉션 없는 아이템 배지의 등급은 세지 않는다', () => {
    const books = [book('a')]
    const badges = [
      badge('a', 'common'),
      badge('a', 'rare', { drop_excluded: true }),
      badge('a', 'epic', { deleted_at: PAST }),
      badge('a', 'mystic', { valid_from: FUTURE }),
      badge('a', 'rare', { valid_until: PAST }),
      badge(null, 'rare'),
      badge('a', null),
    ]
    expect(rarityMap({ books, badges })).toEqual({ a: ['common'] })
  })

  it('서버 굴림의 후보 판정(listIssueCandidates)과 등급마다 같은 답을 낸다 - 조건을 따로 쓰지 않았다는 증거', () => {
    const books = [
      book('a'),
      book('b', { valid_until: PAST }),
      book('c', { is_active: false }),
      book('d', { tribe_id: 'tribe-other' }),
      book('e', { valid_from: PAST, valid_until: FUTURE }),
    ]
    const badges: IssueBadge[] = []
    for (const b of books) {
      badges.push(badge(b.id, 'common'), badge(b.id, 'rare', { drop_excluded: true }), badge(b.id, 'epic'), badge(b.id, 'mystic', { valid_until: PAST }))
    }
    const map = rarityMap({ books, badges })
    for (const b of books) {
      for (const rarity of ['common', 'rare', 'epic', 'mystic'] as const) {
        const serverHasCandidate = listIssueCandidates({ tribeId: TRIBE, rarity, books, badges, now: NOW }).some((c) => c.item_book_id === b.id)
        expect(map[b.id]?.includes(rarity) ?? false, `${b.id}/${rarity}`).toBe(serverHasCandidate)
      }
    }
  })
})
