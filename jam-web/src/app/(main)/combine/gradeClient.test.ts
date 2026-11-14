/**
 * 믹서 화면의 등급 대응형 도우미 (티켓 20261114_1705 3회)
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/combine/gradeClient.test.ts"
 */
import { describe, it, expect } from 'vitest'
import {
  gradeLockNote,
  hasMixedGrades,
  isFollowMaterials,
  lockedGradeOf,
  narrowRecipeToGrade,
  representativeRewardBadges,
} from './gradeClient'

const badge = (id: string, rarity: string | null) => ({ id, name: id, image_url: null, rarity })

function recipe(gradeMode?: string) {
  return {
    grade_mode: gradeMode,
    slots: [
      { id: 's1', badge_type: 'item' as const, candidates: [badge('c1', 'common'), badge('r1', 'rare'), badge('e1', 'epic')] },
      { id: 's2', badge_type: 'item' as const, candidates: [badge('c2', 'common'), badge('r2', 'rare'), badge('e2', 'epic')] },
      { id: 's3', badge_type: 'activity' as const, candidates: [badge('a1', 'common'), badge('a2', 'rare')] },
    ],
    rewardBadges: [badge('rr', 'rare'), badge('rc', 'common'), badge('re', 'epic')],
  }
}

describe('isFollowMaterials', () => {
  it('follow_materials만 등급 대응형이고 비었거나 알 수 없는 값은 등급 고정형이다', () => {
    expect(isFollowMaterials({ grade_mode: 'follow_materials' })).toBe(true)
    expect(isFollowMaterials({ grade_mode: 'fixed' })).toBe(false)
    expect(isFollowMaterials({})).toBe(false)
    expect(isFollowMaterials({ grade_mode: 'whatever' })).toBe(false)
  })
})

describe('lockedGradeOf — 채운 아이템 칸의 등급', () => {
  it('아무것도 담지 않았으면 등급이 없다', () => {
    expect(lockedGradeOf(recipe('follow_materials'), {})).toBeNull()
  })

  it('첫 재료의 등급이 정해진다', () => {
    expect(lockedGradeOf(recipe('follow_materials'), { s1: { rarity: 'rare' } })).toBe('rare')
  })

  it('비우면 풀리고 하나라도 남아 있으면 유지된다', () => {
    const r = recipe('follow_materials')
    expect(lockedGradeOf(r, { s1: { rarity: 'rare' }, s2: { rarity: 'rare' } })).toBe('rare')
    expect(lockedGradeOf(r, { s2: { rarity: 'rare' } })).toBe('rare')
    expect(lockedGradeOf(r, {})).toBeNull()
  })

  it('등급이 섞이면 null을 돌려주고 섞임으로 판정한다(방어)', () => {
    const r = recipe('follow_materials')
    const mixed = { s1: { rarity: 'rare' }, s2: { rarity: 'epic' } }
    expect(lockedGradeOf(r, mixed)).toBeNull()
    expect(hasMixedGrades(r, mixed)).toBe(true)
    expect(hasMixedGrades(r, { s1: { rarity: 'rare' }, s2: { rarity: 'rare' } })).toBe(false)
  })

  it('조건 슬롯에 채운 값은 등급으로 세지 않는다', () => {
    expect(lockedGradeOf(recipe('follow_materials'), { s3: { rarity: 'epic' } })).toBeNull()
  })

  it('등급 고정형은 등급을 정하지도 섞임으로 막지도 않는다', () => {
    const fixed = recipe('fixed')
    const mixed = { s1: { rarity: 'rare' }, s2: { rarity: 'epic' } }
    expect(lockedGradeOf(fixed, { s1: { rarity: 'rare' } })).toBeNull()
    expect(hasMixedGrades(fixed, mixed)).toBe(false)
  })
})

describe('narrowRecipeToGrade', () => {
  it('아이템 슬롯 후보와 보상 배지를 그 등급으로 좁히고 조건 슬롯은 그대로 둔다', () => {
    const r = recipe('follow_materials')
    const narrowed = narrowRecipeToGrade(r, 'rare')
    expect(narrowed.slots[0].candidates.map((c) => c.id)).toEqual(['r1'])
    expect(narrowed.slots[1].candidates.map((c) => c.id)).toEqual(['r2'])
    expect(narrowed.slots[2].candidates.map((c) => c.id)).toEqual(['a1', 'a2'])
    expect(narrowed.rewardBadges.map((b) => b.id)).toEqual(['rr'])
    // 입력은 바뀌지 않는다
    expect(r.slots[0].candidates).toHaveLength(3)
    expect(r.rewardBadges).toHaveLength(3)
  })

  it('등급이 없거나 등급 고정형이면 그대로 돌려준다', () => {
    const follow = recipe('follow_materials')
    const fixed = recipe('fixed')
    expect(narrowRecipeToGrade(follow, null)).toBe(follow)
    expect(narrowRecipeToGrade(fixed, 'rare')).toBe(fixed)
  })
})

describe('representativeRewardBadges', () => {
  it('가장 낮은 등급의 보상 배지를 등급 칩이 없게(rarity null) 돌려준다', () => {
    const out = representativeRewardBadges(recipe('follow_materials'))
    expect(out.map((b) => b.id)).toEqual(['rc'])
    expect(out[0].rarity).toBeNull()
  })

  it('보상 배지가 없으면 빈 배열이다', () => {
    expect(representativeRewardBadges({ rewardBadges: [] })).toEqual([])
  })
})

describe('gradeLockNote', () => {
  it('등급을 영문으로 넣은 한 줄이다', () => {
    expect(gradeLockNote('rare')).toBe('지금은 Rare 아이템 배지만 넣을 수 있어요')
    expect(gradeLockNote('mystic')).toBe('지금은 Mystic 아이템 배지만 넣을 수 있어요')
  })
})
