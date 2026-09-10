/**
 * 믹스 레시피 저장 페이로드 — 재료 타입 자동 분류 + 검증 (티켓 20260910_1408)
 *
 * 어드민 폼은 재료 슬롯 하나에서 아이템·액티비티·체크인 배지를 구분 없이 고른다.
 * 분류는 서버가 배지 타입으로 수행한다 — 클라이언트 분류를 신뢰하지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/combine/__tests__/recipe-payload.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  classifyIngredients,
  normalizeRecipePayload,
  validateClassified,
} from '../recipe-payload'

const ITEM_A = '00000000-0000-0000-0000-00000000i0a1'
const ITEM_B = '00000000-0000-0000-0000-00000000i0b2'
const ACT = '00000000-0000-0000-0000-0000000000a1'
const CHK = '00000000-0000-0000-0000-0000000000c1'

describe('classifyIngredients — 배지 타입으로 소모/보유 조건을 가른다', () => {
  it('아이템 배지는 소모(ingredient), 액티비티·체크인 배지는 보유 조건(required)으로 간다', () => {
    const result = classifyIngredients([
      { id: ITEM_A, type: 'item' },
      { id: ACT, type: 'activity' },
      { id: ITEM_B, type: 'item' },
      { id: CHK, type: 'checkin' },
    ])
    expect(result.ingredientBadgeIds).toEqual([ITEM_A, ITEM_B])
    expect(result.requiredBadgeIds).toEqual([ACT, CHK])
  })

  it('아이템 배지만 고르면 보유 조건은 비어 있다', () => {
    const result = classifyIngredients([
      { id: ITEM_A, type: 'item' },
      { id: ITEM_B, type: 'item' },
    ])
    expect(result.ingredientBadgeIds).toHaveLength(2)
    expect(result.requiredBadgeIds).toEqual([])
  })
})

describe('validateClassified — 소모될 아이템 배지는 2~10개', () => {
  it('아이템 배지가 1개면 거부하고 사유를 돌려준다', () => {
    const result = validateClassified({ ingredientBadgeIds: [ITEM_A], requiredBadgeIds: [ACT, CHK] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('2개 이상')
  })

  it('아이템 배지가 11개면 거부한다', () => {
    const ids = Array.from({ length: 11 }, (_, i) => `item-${i}`)
    const result = validateClassified({ ingredientBadgeIds: ids, requiredBadgeIds: [] })
    expect(result.ok).toBe(false)
  })

  it('아이템 배지가 2개면 통과한다', () => {
    expect(validateClassified({ ingredientBadgeIds: [ITEM_A, ITEM_B], requiredBadgeIds: [] }).ok).toBe(true)
  })
})

describe('normalizeRecipePayload — 보상 3분기 검증', () => {
  const base = { badge_ids: [ITEM_A, ITEM_B] }

  it('포인트만 있어도 통과한다', () => {
    const result = normalizeRecipePayload({ ...base, reward_points: 100 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.rewardPoints).toBe(100)
      expect(result.value.rewardBadgeIds).toEqual([])
    }
  })

  it('배지만 있어도 통과한다', () => {
    const result = normalizeRecipePayload({ ...base, reward_badge_ids: [ACT] })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.rewardPoints).toBe(0)
  })

  it('포인트와 배지를 함께 지정할 수 있다', () => {
    const result = normalizeRecipePayload({ ...base, reward_points: 50, reward_badge_ids: [ACT, CHK] })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.rewardPoints).toBe(50)
      expect(result.value.rewardBadgeIds).toEqual([ACT, CHK])
    }
  })

  it('보상이 하나도 없으면 거부한다', () => {
    const result = normalizeRecipePayload({ ...base, reward_points: 0, reward_badge_ids: [] })
    expect(result.ok).toBe(false)
  })

  it('음수·소수 포인트는 거부한다', () => {
    expect(normalizeRecipePayload({ ...base, reward_points: -1 }).ok).toBe(false)
    expect(normalizeRecipePayload({ ...base, reward_points: 1.5 }).ok).toBe(false)
  })

  it('재료가 2개 미만이거나 중복이면 거부한다', () => {
    expect(normalizeRecipePayload({ badge_ids: [ITEM_A], reward_points: 10 }).ok).toBe(false)
    expect(normalizeRecipePayload({ badge_ids: [ITEM_A, ITEM_A], reward_points: 10 }).ok).toBe(false)
  })
})
