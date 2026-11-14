/**
 * 레시피 유형(등급 대응형/등급 고정형) 순수 판정 — 티켓 20261114_1705 1회차
 *
 * 실행: cd jam-web && npx vitest run src/lib/combine/__tests__/gradeMode.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  narrowSlotsToGrade,
  pickRewardBadgeIdsForGrade,
  resolveGradeMode,
  resolveMaterialGrade,
  rewardBadgeCountOf,
} from '../gradeMode'
import type { CombinationRecipeSlotRow } from '@/types/database'

const RARITY = new Map<string, string | null>([
  ['sign-common', 'common'],
  ['sign-rare', 'rare'],
  ['sign-epic', 'epic'],
  ['sign-mystic', 'mystic'],
  ['lamp-common', 'common'],
  ['lamp-rare', 'rare'],
  ['activity-badge', null],
])

function slot(order: number, badgeType: CombinationRecipeSlotRow['badge_type'], ids: string[]): CombinationRecipeSlotRow {
  return { id: `slot-${order}`, recipe_id: 'recipe-1', slot_order: order, badge_type: badgeType, allowed_badge_ids: ids }
}

describe('resolveGradeMode', () => {
  it('follow_materials만 등급 대응형이고 나머지는 모두 등급 고정형이다', () => {
    expect(resolveGradeMode({ grade_mode: 'follow_materials' })).toBe('follow_materials')
    expect(resolveGradeMode({ grade_mode: 'fixed' })).toBe('fixed')
    expect(resolveGradeMode({})).toBe('fixed')
    expect(resolveGradeMode({ grade_mode: null })).toBe('fixed')
    expect(resolveGradeMode({ grade_mode: 'something-else' })).toBe('fixed')
  })
})

describe('resolveMaterialGrade', () => {
  it('재료가 모두 같은 등급이면 그 등급을 돌려준다(Common·Rare·Epic·Mystic 모두)', () => {
    expect(resolveMaterialGrade(['sign-common', 'lamp-common'], RARITY)).toEqual({ ok: true, rarity: 'common' })
    expect(resolveMaterialGrade(['sign-rare', 'lamp-rare'], RARITY)).toEqual({ ok: true, rarity: 'rare' })
    expect(resolveMaterialGrade(['sign-epic'], RARITY)).toEqual({ ok: true, rarity: 'epic' })
    expect(resolveMaterialGrade(['sign-mystic'], RARITY)).toEqual({ ok: true, rarity: 'mystic' })
  })

  it('재료 등급이 섞이면 mixed다', () => {
    expect(resolveMaterialGrade(['sign-common', 'lamp-rare'], RARITY)).toEqual({ ok: false, reason: 'mixed' })
  })

  it('등급을 알 수 없는 재료가 있거나 재료가 없으면 unknown이다(섞임보다 앞선다)', () => {
    expect(resolveMaterialGrade(['sign-common', 'missing'], RARITY)).toEqual({ ok: false, reason: 'unknown' })
    expect(resolveMaterialGrade(['sign-common', 'lamp-rare', 'missing'], RARITY)).toEqual({ ok: false, reason: 'unknown' })
    expect(resolveMaterialGrade(['activity-badge'], RARITY)).toEqual({ ok: false, reason: 'unknown' })
    expect(resolveMaterialGrade([], RARITY)).toEqual({ ok: false, reason: 'unknown' })
  })
})

describe('narrowSlotsToGrade', () => {
  const slots = [
    slot(0, 'item', ['sign-common', 'sign-rare', 'sign-epic', 'sign-mystic']),
    slot(1, 'item', ['lamp-common', 'lamp-rare']),
    slot(2, 'activity', ['activity-badge']),
  ]

  it('아이템 슬롯 후보를 그 등급의 배지로 좁히고 조건 슬롯은 그대로 둔다', () => {
    const narrowed = narrowSlotsToGrade(slots, 'rare', RARITY)
    expect(narrowed[0].allowed_badge_ids).toEqual(['sign-rare'])
    expect(narrowed[1].allowed_badge_ids).toEqual(['lamp-rare'])
    expect(narrowed[2].allowed_badge_ids).toEqual(['activity-badge'])
  })

  it('그 등급이 없는 슬롯은 후보가 빈다', () => {
    expect(narrowSlotsToGrade(slots, 'mystic', RARITY)[1].allowed_badge_ids).toEqual([])
  })

  it('입력 슬롯을 바꾸지 않는다', () => {
    narrowSlotsToGrade(slots, 'rare', RARITY)
    expect(slots[0].allowed_badge_ids).toHaveLength(4)
  })
})

describe('pickRewardBadgeIdsForGrade', () => {
  it('보상 배지 중 그 등급의 것만 입력 순서대로 고른다', () => {
    const rewards = ['sign-common', 'sign-rare', 'lamp-common', 'lamp-rare', 'sign-epic']
    expect(pickRewardBadgeIdsForGrade(rewards, 'rare', RARITY)).toEqual(['sign-rare', 'lamp-rare'])
    expect(pickRewardBadgeIdsForGrade(rewards, 'common', RARITY)).toEqual(['sign-common', 'lamp-common'])
  })

  it('등급이 없거나 조회되지 않은 배지는 고르지 않는다', () => {
    expect(pickRewardBadgeIdsForGrade(['activity-badge', 'missing', 'sign-rare'], 'rare', RARITY)).toEqual(['sign-rare'])
    expect(pickRewardBadgeIdsForGrade([], 'rare', RARITY)).toEqual([])
  })
})

describe('rewardBadgeCountOf — 보상 배지 표시 개수 (티켓 20261114_2111)', () => {
  const bundle = (prefix: string, bookId: string | null, name: string) =>
    ['common', 'rare', 'epic', 'mystic'].map((rarity) => ({ id: `${prefix}-${rarity}`, name, rarity, item_book_id: bookId }))
  const sign = bundle('sign', 'book-1', '표지판')
  const lamp = bundle('lamp', 'book-1', '가로등')
  const ids = (list: { id: string }[]) => list.map((b) => b.id)

  it('등급 대응형은 같은 이름 4등급을 묶음 하나로 센다', () => {
    expect(rewardBadgeCountOf({ grade_mode: 'follow_materials', reward_badge_ids: ids(sign) }, sign)).toBe(1)
  })

  it('묶음이 둘이면 둘이다', () => {
    expect(rewardBadgeCountOf({ grade_mode: 'follow_materials', reward_badge_ids: [...ids(sign), ...ids(lamp)] }, [...sign, ...lamp])).toBe(2)
  })

  it('같은 이름이어도 컬렉션이 다르면 다른 묶음이다', () => {
    const other = bundle('sign2', 'book-2', '표지판')
    expect(rewardBadgeCountOf({ grade_mode: 'follow_materials', reward_badge_ids: [...ids(sign), ...ids(other)] }, [...sign, ...other])).toBe(2)
  })

  it('일부 등급 배지가 삭제돼 남은 것만 읽혀도 묶음 하나로 센다', () => {
    expect(rewardBadgeCountOf({ grade_mode: 'follow_materials', reward_badge_ids: ids(sign) }, sign.slice(1))).toBe(1)
  })

  it('읽지 못한 배지는 세지 않아 「4개」로 되돌아가지 않는다', () => {
    expect(rewardBadgeCountOf({ grade_mode: 'follow_materials', reward_badge_ids: ids(sign) }, [])).toBe(0)
  })

  it('컬렉션이 없는 배지는 묶을 수 없어 각각 하나로 센다', () => {
    const loose = bundle('loose', null, '떠도는 배지')
    expect(rewardBadgeCountOf({ grade_mode: 'follow_materials', reward_badge_ids: ids(loose) }, loose)).toBe(4)
  })

  it('등급 고정형·칸 없음·알 수 없는 값은 보상 배지 칸의 길이 그대로다', () => {
    for (const grade_mode of ['fixed', undefined, null, 'weird']) {
      expect(rewardBadgeCountOf({ grade_mode, reward_badge_ids: ids(sign) }, sign)).toBe(4)
    }
    expect(rewardBadgeCountOf({ grade_mode: 'fixed', reward_badge_ids: null }, [])).toBe(0)
  })
})
