/**
 * 믹스 레시피 저장 페이로드 — 슬롯 기반 OR 매칭 검증 (티켓 20260917_1427)
 *
 * 슬롯 하나는 후보 배지(OR) 목록이다. 슬롯 개수 하한/상한, 슬롯당 후보 최소 1개, 보상
 * 3분기는 `normalizeRecipePayload()`가, 슬롯 내 배지 실제 타입 일치·아이템 타입 슬롯
 * 하한은 `validateSlotTypes()`가 검증한다(배지 실제 타입 조회가 필요해 분리돼 있다).
 *
 * 실행: cd jam-web && npx vitest run src/lib/combine/__tests__/recipe-payload.test.ts
 */
import { describe, it, expect } from 'vitest'
import { normalizeRecipePayload, validateSlotTypes } from '../recipe-payload'

const ITEM_A = '00000000-0000-0000-0000-00000000i0a1'
const ITEM_B = '00000000-0000-0000-0000-00000000i0b2'
const ACT = '00000000-0000-0000-0000-0000000000a1'
const CHK = '00000000-0000-0000-0000-0000000000c1'

function itemSlot(ids: string[]) {
  return { badge_type: 'item', allowed_badge_ids: ids }
}
function activitySlot(ids: string[]) {
  return { badge_type: 'activity', allowed_badge_ids: ids }
}

describe('normalizeRecipePayload — 슬롯 구조·개수·보상 3분기 검증', () => {
  it('슬롯 2개(아이템 1 + 액티비티 1)와 포인트 보상이면 통과한다', () => {
    const result = normalizeRecipePayload({
      slots: [itemSlot([ITEM_A]), activitySlot([ACT])],
      reward_points: 100,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.slots).toEqual([
        { badgeType: 'item', allowedBadgeIds: [ITEM_A] },
        { badgeType: 'activity', allowedBadgeIds: [ACT] },
      ])
      expect(result.value.rewardPoints).toBe(100)
    }
  })

  it('슬롯이 1개면 거부한다', () => {
    const result = normalizeRecipePayload({ slots: [itemSlot([ITEM_A])], reward_points: 10 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('2개 이상')
  })

  it('슬롯이 11개면 거부한다', () => {
    const slots = Array.from({ length: 11 }, (_, i) => itemSlot([`item-${i}`]))
    const result = normalizeRecipePayload({ slots, reward_points: 10 })
    expect(result.ok).toBe(false)
  })

  it('슬롯 안 후보가 비어 있으면 거부한다', () => {
    const result = normalizeRecipePayload({
      slots: [itemSlot([ITEM_A]), itemSlot([])],
      reward_points: 10,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('1개 이상')
  })

  it('slots가 배열이 아니거나 badge_type이 잘못되면 거부한다', () => {
    expect(normalizeRecipePayload({ slots: 'nope', reward_points: 10 }).ok).toBe(false)
    expect(
      normalizeRecipePayload({
        slots: [{ badge_type: 'weapon', allowed_badge_ids: [ITEM_A] }, itemSlot([ITEM_B])],
        reward_points: 10,
      }).ok
    ).toBe(false)
  })

  it('슬롯 후보에 중복 id가 있으면 거부한다', () => {
    const result = normalizeRecipePayload({
      slots: [itemSlot([ITEM_A, ITEM_A]), itemSlot([ITEM_B])],
      reward_points: 10,
    })
    expect(result.ok).toBe(false)
  })

  it('포인트만 있어도 통과한다', () => {
    const base = { slots: [itemSlot([ITEM_A]), itemSlot([ITEM_B])] }
    const result = normalizeRecipePayload({ ...base, reward_points: 100 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.rewardPoints).toBe(100)
      expect(result.value.rewardBadgeIds).toEqual([])
    }
  })

  it('배지만 있어도 통과한다', () => {
    const base = { slots: [itemSlot([ITEM_A]), itemSlot([ITEM_B])] }
    const result = normalizeRecipePayload({ ...base, reward_badge_ids: [ACT] })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.rewardPoints).toBe(0)
  })

  it('보상이 하나도 없으면 거부한다', () => {
    const base = { slots: [itemSlot([ITEM_A]), itemSlot([ITEM_B])] }
    const result = normalizeRecipePayload({ ...base, reward_points: 0, reward_badge_ids: [] })
    expect(result.ok).toBe(false)
  })

  it('음수·소수 포인트는 거부한다', () => {
    const base = { slots: [itemSlot([ITEM_A]), itemSlot([ITEM_B])] }
    expect(normalizeRecipePayload({ ...base, reward_points: -1 }).ok).toBe(false)
    expect(normalizeRecipePayload({ ...base, reward_points: 1.5 }).ok).toBe(false)
  })
})

describe('validateSlotTypes — 슬롯 내 타입 일치 + 아이템 슬롯 하한', () => {
  it('슬롯이 선언한 타입과 후보 배지 실제 타입이 모두 일치하면 통과한다', () => {
    const slots = [
      { badgeType: 'item' as const, allowedBadgeIds: [ITEM_A, ITEM_B] },
      { badgeType: 'activity' as const, allowedBadgeIds: [ACT] },
    ]
    const actualTypeById = new Map([
      [ITEM_A, 'item'],
      [ITEM_B, 'item'],
      [ACT, 'activity'],
    ])
    expect(validateSlotTypes(slots, actualTypeById)).toEqual({ ok: true })
  })

  it('슬롯 안에 다른 타입 배지가 섞여 있으면 거부한다', () => {
    const slots = [
      { badgeType: 'item' as const, allowedBadgeIds: [ITEM_A, CHK] },
      { badgeType: 'activity' as const, allowedBadgeIds: [ACT] },
    ]
    const actualTypeById = new Map([
      [ITEM_A, 'item'],
      [CHK, 'checkin'],
      [ACT, 'activity'],
    ])
    const result = validateSlotTypes(slots, actualTypeById)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('아이템 배지만')
  })

  it('아이템 타입 슬롯이 하나도 없으면 거부한다', () => {
    const slots = [
      { badgeType: 'activity' as const, allowedBadgeIds: [ACT] },
      { badgeType: 'checkin' as const, allowedBadgeIds: [CHK] },
    ]
    const actualTypeById = new Map([
      [ACT, 'activity'],
      [CHK, 'checkin'],
    ])
    const result = validateSlotTypes(slots, actualTypeById)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('아이템 타입 슬롯')
  })
})
