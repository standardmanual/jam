/**
 * 잠긴 채 드랍·픽업된 개체의 피드 표시 판정 (티켓 20261018_1837)
 * 실행: cd jam-web && npx vitest run src/lib/activity-feed/__tests__/lockedDrop.test.ts
 */
import { describe, it, expect } from 'vitest'
import { isDropRowLocked, lockedDropFeedMeta } from '../lockedDrop'

describe('isDropRowLocked — 열린 것이 확인될 때만 열린 것', () => {
  it('locked=true면 잠긴 것이다', () => {
    expect(isDropRowLocked({ inventory_item_id: 'i1', inventory_items: { locked: true } })).toBe(true)
  })

  it('locked=false면 열린 것이다', () => {
    expect(isDropRowLocked({ inventory_item_id: 'i1', inventory_items: { locked: false } })).toBe(false)
  })

  it('개체가 연결돼 있는데 잠김을 읽지 못하면 잠긴 것으로 본다', () => {
    expect(isDropRowLocked({ inventory_item_id: 'i1', inventory_items: null })).toBe(true)
    expect(isDropRowLocked({ inventory_item_id: 'i1', inventory_items: { locked: null } })).toBe(true)
  })

  it('개체 연결이 없는 과거 드랍은 잠글 개체가 없어 열린 것이다', () => {
    expect(isDropRowLocked({ inventory_item_id: null, inventory_items: null })).toBe(false)
  })
})

describe('lockedDropFeedMeta', () => {
  it('이름은 «잠긴 아이템 배지», 등급만 싣고 배지 id·그림은 비운다', () => {
    expect(lockedDropFeedMeta('epic')).toEqual({
      badge_id: '',
      badge_name: '잠긴 아이템 배지',
      badge_image_url: '',
      rarity: 'epic',
    })
  })

  it('등급이 없으면 null이다', () => {
    expect(lockedDropFeedMeta(undefined).rarity).toBeNull()
  })
})
