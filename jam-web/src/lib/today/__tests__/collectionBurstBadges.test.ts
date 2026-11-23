/**
 * 컬렉션 소개 카드가 쓰는 아이템 배지 선택 규칙 (티켓 20261121_0115, 20261122_2224 7회차)
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/collectionBurstBadges.test.ts
 */
import { describe, expect, it } from 'vitest'
import { COLLECTION_BURST_BADGE_LIMIT, pickCollectionItemBadges, type CollectionItemBadgeRow } from '../collectionBurstBadges'

const row = (id: string, name: string, extra: Partial<CollectionItemBadgeRow> = {}): CollectionItemBadgeRow => ({
  id,
  item_book_id: 'book-1',
  type: 'item',
  name,
  image_url: `https://example.test/${id}.webp`,
  ...extra,
})

describe('pickCollectionItemBadges', () => {
  it('이름·id 순으로 최대 4개를 고르고 같은 이름·그림 없음·체크인 배지는 건너뛴다', () => {
    const rows = [
      row('b5', '마'),
      row('b2', '나'),
      row('b2x', '나'),
      row('b1', '가'),
      row('bn', '그림없음', { image_url: ' ' }),
      row('bc', '체크인', { type: 'checkin' }),
      row('b4', '라'),
      row('b3', '다'),
    ]
    const picked = pickCollectionItemBadges(rows).get('book-1')
    expect(COLLECTION_BURST_BADGE_LIMIT).toBe(4)
    expect(picked?.map((badge) => badge.id)).toEqual(['b1', 'b2', 'b3', 'b4'])
  })

  it('조회 순서가 달라도 같은 컬렉션은 늘 같은 4개를 고른다', () => {
    const rows = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'].map((id, index) => row(id, `이름${index}`))
    const forward = pickCollectionItemBadges(rows).get('book-1')
    const reversed = pickCollectionItemBadges([...rows].reverse()).get('book-1')
    expect(reversed).toEqual(forward)
  })

  it('컬렉션마다 따로 고른다', () => {
    const picked = pickCollectionItemBadges([row('a', '가'), row('b', '나', { item_book_id: 'book-2' })])
    expect(picked.get('book-1')?.map((badge) => badge.id)).toEqual(['a'])
    expect(picked.get('book-2')?.map((badge) => badge.id)).toEqual(['b'])
  })
})
