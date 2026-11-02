import { describe, it, expect } from 'vitest'
import { buildBookRarities } from '../book-rarities'

const badge = (item_book_id: string | null, rarity: string | null, extra: Partial<{ type: string; deleted_at: string | null }> = {}) => ({
  item_book_id,
  type: 'item',
  rarity,
  deleted_at: null,
  ...extra,
})

describe('buildBookRarities', () => {
  it('중복 없이 Common → Rare → Epic → Mystic 순으로 돌려준다(입력 순서 무관)', () => {
    const map = buildBookRarities([
      badge('b1', 'mystic'),
      badge('b1', 'rare'),
      badge('b1', 'rare'),
      badge('b1', 'common'),
      badge('b1', 'epic'),
    ])
    expect(map.get('b1')).toEqual(['common', 'rare', 'epic', 'mystic'])
  })

  it('컬렉션별로 나눠 담는다', () => {
    const map = buildBookRarities([badge('b1', 'rare'), badge('b2', 'epic')])
    expect(map.get('b1')).toEqual(['rare'])
    expect(map.get('b2')).toEqual(['epic'])
  })

  it('NULL 등급·item 아닌 배지·삭제된 배지·컬렉션 없는 배지는 건너뛴다', () => {
    const map = buildBookRarities([
      badge('b1', null),
      badge('b1', 'epic', { type: 'checkin' }),
      badge('b1', 'mystic', { deleted_at: '2026-01-01T00:00:00Z' }),
      badge(null, 'rare'),
      badge('b1', 'rare'),
    ])
    expect(map.get('b1')).toEqual(['rare'])
  })

  it('알 수 없는 등급 값은 건너뛰고, 등급이 없는 컬렉션은 키가 없다', () => {
    const map = buildBookRarities([badge('b1', 'legend'), badge('b2', null)])
    expect(map.has('b1')).toBe(false)
    expect(map.has('b2')).toBe(false)
  })
})
