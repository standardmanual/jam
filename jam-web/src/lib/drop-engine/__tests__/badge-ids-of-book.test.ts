/**
 * drop-engine — 컬렉션 완성률 분모(badgeIdsOfBook) 구성 회귀 테스트
 *
 * 티켓 20260911_2235: 배지 개별 drop_excluded=true는 컬렉션 완성 분모에서 제외해야 한다.
 * (컬렉션 단위 drop_excluded는 상위 item_books 조회에서 이미 걸러지므로 이 테스트 범위 밖)
 *
 * 실행: jest 또는 vitest (프레임워크 무관 — describe/it/expect 호환)
 */

import { buildBadgeIdsOfBook } from '../index'

function makeBadge(id: string, itemBookId: string, dropExcluded: boolean) {
  return { id, item_book_id: itemBookId, drop_excluded: dropExcluded }
}

describe('buildBadgeIdsOfBook', () => {
  it('개별 drop_excluded=true 배지는 분모에서 제외된다', () => {
    const badges = [
      makeBadge('b1', 'book-a', false),
      makeBadge('b2', 'book-a', false),
      makeBadge('b3', 'book-a', true), // 드랍 제외 배지
    ]
    const result = buildBadgeIdsOfBook(badges)
    expect(result.get('book-a')).toEqual(['b1', 'b2'])
  })

  it('drop_excluded 배지가 없으면 전체가 분모에 포함된다', () => {
    const badges = [
      makeBadge('b1', 'book-a', false),
      makeBadge('b2', 'book-a', false),
    ]
    const result = buildBadgeIdsOfBook(badges)
    expect(result.get('book-a')).toEqual(['b1', 'b2'])
  })

  it('item_book_id가 없는 배지는 무시된다', () => {
    const badges = [{ id: 'b1', item_book_id: null, drop_excluded: false }]
    const result = buildBadgeIdsOfBook(badges)
    expect(result.size).toBe(0)
  })

  it('9개 중 1개를 드랍 제외하면 8/8 완성이 가능해진다 (분모 재계산 정합성)', () => {
    const badges = Array.from({ length: 8 }, (_, i) => makeBadge(`b${i}`, 'book-a', false)).concat([
      makeBadge('b8', 'book-a', true),
    ])
    const result = buildBadgeIdsOfBook(badges)
    const denom = result.get('book-a') ?? []
    expect(denom).toHaveLength(8)
    expect(denom).not.toContain('b8')

    // 이미 8개를 보유한 유저는 이 변경으로 즉시 8/8(100%) 완성으로 전환된다 — 의도된 동작.
    const owned = new Set(denom) // 드랍 제외 배지를 제외한 8개를 모두 보유한 상태를 가정
    const ownedCount = denom.filter((id) => owned.has(id)).length
    expect(ownedCount / denom.length).toBe(1)
  })
})
