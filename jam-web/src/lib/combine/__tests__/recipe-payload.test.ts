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
import { normalizeRecipePayload, normalizeValidFrom, normalizeValidUntil, validateSlotTypes } from '../recipe-payload'

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
      name: '테스트 레시피',
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
    const result = normalizeRecipePayload({ name: '테스트 레시피', slots: [itemSlot([ITEM_A])], reward_points: 10 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('2개 이상')
  })

  it('슬롯이 11개면 거부한다', () => {
    const slots = Array.from({ length: 11 }, (_, i) => itemSlot([`item-${i}`]))
    const result = normalizeRecipePayload({ name: '테스트 레시피', slots, reward_points: 10 })
    expect(result.ok).toBe(false)
  })

  it('슬롯 안 후보가 비어 있으면 거부한다', () => {
    const result = normalizeRecipePayload({
      name: '테스트 레시피',
      slots: [itemSlot([ITEM_A]), itemSlot([])],
      reward_points: 10,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('1개 이상')
  })

  it('slots가 배열이 아니거나 badge_type이 잘못되면 거부한다', () => {
    expect(normalizeRecipePayload({ name: '테스트 레시피', slots: 'nope', reward_points: 10 }).ok).toBe(false)
    expect(
      normalizeRecipePayload({
        name: '테스트 레시피',
        slots: [{ badge_type: 'weapon', allowed_badge_ids: [ITEM_A] }, itemSlot([ITEM_B])],
        reward_points: 10,
      }).ok
    ).toBe(false)
  })

  it('슬롯 후보에 중복 id가 있으면 거부한다', () => {
    const result = normalizeRecipePayload({
      name: '테스트 레시피',
      slots: [itemSlot([ITEM_A, ITEM_A]), itemSlot([ITEM_B])],
      reward_points: 10,
    })
    expect(result.ok).toBe(false)
  })

  it('포인트만 있어도 통과한다', () => {
    const base = { name: '테스트 레시피', slots: [itemSlot([ITEM_A]), itemSlot([ITEM_B])] }
    const result = normalizeRecipePayload({ ...base, reward_points: 100 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.rewardPoints).toBe(100)
      expect(result.value.rewardBadgeIds).toEqual([])
    }
  })

  it('배지만 있어도 통과한다', () => {
    const base = { name: '테스트 레시피', slots: [itemSlot([ITEM_A]), itemSlot([ITEM_B])] }
    const result = normalizeRecipePayload({ ...base, reward_badge_ids: [ACT] })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.rewardPoints).toBe(0)
  })

  it('보상이 하나도 없으면 거부한다', () => {
    const base = { name: '테스트 레시피', slots: [itemSlot([ITEM_A]), itemSlot([ITEM_B])] }
    const result = normalizeRecipePayload({ ...base, reward_points: 0, reward_badge_ids: [] })
    expect(result.ok).toBe(false)
  })

  it('이름이 비어 있으면 거부한다(티켓 20260917_1828)', () => {
    const result = normalizeRecipePayload({
      slots: [itemSlot([ITEM_A]), itemSlot([ITEM_B])],
      reward_points: 10,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('이름')
  })

  it('음수·소수 포인트는 거부한다', () => {
    const base = { name: '테스트 레시피', slots: [itemSlot([ITEM_A]), itemSlot([ITEM_B])] }
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

describe('normalizeValidFrom — 공개 시각 입력 (티켓 20261001_1158)', () => {
  const NOW = new Date('2026-10-01T00:00:00Z')

  it('칸이 없으면 건드리지 않는다(undefined)', () => {
    expect(normalizeValidFrom(undefined, NOW)).toEqual({ ok: true, value: undefined })
  })

  it('null·빈 문자열·공백은 바로 공개(null)다', () => {
    expect(normalizeValidFrom(null, NOW)).toEqual({ ok: true, value: null })
    expect(normalizeValidFrom('', NOW)).toEqual({ ok: true, value: null })
    expect(normalizeValidFrom('   ', NOW)).toEqual({ ok: true, value: null })
  })

  it('시간대가 포함된 미래 시각은 UTC ISO로 정규화한다', () => {
    expect(normalizeValidFrom('2026-10-05T09:00:00+09:00', NOW)).toEqual({
      ok: true,
      value: '2026-10-05T00:00:00.000Z',
    })
    expect(normalizeValidFrom('2026-10-05T09:00+09:00', NOW)).toEqual({
      ok: true,
      value: '2026-10-05T00:00:00.000Z',
    })
    expect(normalizeValidFrom('2026-10-05T00:00:00Z', NOW)).toEqual({
      ok: true,
      value: '2026-10-05T00:00:00.000Z',
    })
  })

  it('과거 시각은 거부하고 해결책(바로 공개)을 알려 준다', () => {
    const result = normalizeValidFrom('2026-09-30T23:59:59Z', NOW)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('이미 지났어요')
      expect(result.error).toContain('바로 공개')
    }
  })

  it('지금과 같은 시각도 거부한다(미래여야 한다)', () => {
    expect(normalizeValidFrom('2026-10-01T00:00:00Z', NOW).ok).toBe(false)
  })

  it('시간대가 없는 값은 거부한다', () => {
    const result = normalizeValidFrom('2026-10-05T09:00:00', NOW)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('시간대')
  })

  it('해석할 수 없는 값은 거부한다', () => {
    expect(normalizeValidFrom('내일 아침', NOW).ok).toBe(false)
    expect(normalizeValidFrom('2026-13-01T09:00:00+09:00', NOW).ok).toBe(false)
    expect(normalizeValidFrom('2026-10-05T25:00:00+09:00', NOW).ok).toBe(false)
  })

  it('달력에 없는 날짜는 다음 달로 넘겨 읽지 않고 거부한다', () => {
    const result = normalizeValidFrom('2026-11-31T09:00:00+09:00', NOW)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('읽을 수 없어요')
  })

  it('문자열이 아닌 값은 거부한다', () => {
    expect(normalizeValidFrom(1790000000000, NOW).ok).toBe(false)
    expect(normalizeValidFrom({}, NOW).ok).toBe(false)
  })
})

describe('normalizeRecipePayload — valid_from 전달', () => {
  const NOW = new Date('2026-10-01T00:00:00Z')
  const base = { name: '테스트 레시피', slots: [itemSlot([ITEM_A]), activitySlot([ACT])], reward_points: 10 }

  it('valid_from을 보내지 않으면 validFrom은 undefined다', () => {
    const result = normalizeRecipePayload(base, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.validFrom).toBeUndefined()
  })

  it('미래 시각이면 정규화된 값이 validFrom으로 나온다', () => {
    const result = normalizeRecipePayload({ ...base, valid_from: '2026-10-05T09:00:00+09:00' }, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.validFrom).toBe('2026-10-05T00:00:00.000Z')
  })

  it('valid_from이 null이면 바로 공개(null)다', () => {
    const result = normalizeRecipePayload({ ...base, valid_from: null }, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.validFrom).toBeNull()
  })

  it('과거 시각이면 저장 전에 거부한다', () => {
    const result = normalizeRecipePayload({ ...base, valid_from: '2026-09-01T09:00:00+09:00' }, NOW)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('이미 지났어요')
  })
})

describe('normalizeValidUntil — 종료 시각 입력 (티켓 20261002_0710)', () => {
  it('칸이 없으면 건드리지 않는다(undefined)', () => {
    expect(normalizeValidUntil(undefined)).toEqual({ ok: true, value: undefined })
  })

  it('null·빈 문자열·공백은 종료 없음(null, 상시)이다', () => {
    expect(normalizeValidUntil(null)).toEqual({ ok: true, value: null })
    expect(normalizeValidUntil('')).toEqual({ ok: true, value: null })
    expect(normalizeValidUntil('   ')).toEqual({ ok: true, value: null })
  })

  it('시간대가 포함된 시각은 UTC ISO로 정규화한다', () => {
    expect(normalizeValidUntil('2026-10-12T09:00:00+09:00')).toEqual({ ok: true, value: '2026-10-12T00:00:00.000Z' })
    expect(normalizeValidUntil('2026-10-12T09:00+09:00')).toEqual({ ok: true, value: '2026-10-12T00:00:00.000Z' })
    expect(normalizeValidUntil('2026-10-12T00:00:00Z')).toEqual({ ok: true, value: '2026-10-12T00:00:00.000Z' })
  })

  it('지난 시각도 받는다 — 저장하면 곧바로 내려간다(공개 시각과 다른 점)', () => {
    expect(normalizeValidUntil('2020-01-01T00:00:00Z')).toEqual({ ok: true, value: '2020-01-01T00:00:00.000Z' })
  })

  it('시간대가 없는 값은 거부한다', () => {
    const result = normalizeValidUntil('2026-10-12T09:00:00')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('종료 시각 형식이 올바르지 않아요')
      expect(result.error).toContain('시간대')
    }
  })

  it('해석할 수 없는 값은 거부한다', () => {
    expect(normalizeValidUntil('내일 아침').ok).toBe(false)
    expect(normalizeValidUntil('2026-13-01T09:00:00+09:00').ok).toBe(false)
    expect(normalizeValidUntil('2026-10-12T25:00:00+09:00').ok).toBe(false)
  })

  it('달력에 없는 날짜는 다음 달로 넘겨 읽지 않고 거부한다', () => {
    const result = normalizeValidUntil('2026-11-31T09:00:00+09:00')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('종료 시각을 읽을 수 없어요')
  })

  it('문자열이 아닌 값은 거부한다', () => {
    expect(normalizeValidUntil(1790000000000).ok).toBe(false)
    expect(normalizeValidUntil({}).ok).toBe(false)
  })
})

describe('normalizeRecipePayload — valid_until 전달', () => {
  const NOW = new Date('2026-10-01T00:00:00Z')
  const base = { name: '테스트 레시피', slots: [itemSlot([ITEM_A]), activitySlot([ACT])], reward_points: 10 }

  it('valid_until을 보내지 않으면 validUntil은 undefined다', () => {
    const result = normalizeRecipePayload(base, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.validUntil).toBeUndefined()
  })

  it('시각이면 정규화된 값이 validUntil로 나온다', () => {
    const result = normalizeRecipePayload({ ...base, valid_until: '2026-10-12T09:00:00+09:00' }, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.validUntil).toBe('2026-10-12T00:00:00.000Z')
  })

  it('valid_until이 null이면 종료 없음(null)이다', () => {
    const result = normalizeRecipePayload({ ...base, valid_until: null }, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.validUntil).toBeNull()
  })

  it('지난 시각도 통과한다', () => {
    const result = normalizeRecipePayload({ ...base, valid_until: '2026-09-01T09:00:00+09:00' }, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.validUntil).toBe('2026-09-01T00:00:00.000Z')
  })

  it('형식이 올바르지 않으면 저장 전에 거부한다', () => {
    const result = normalizeRecipePayload({ ...base, valid_until: '2026-10-12 09:00' }, NOW)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('종료 시각 형식이 올바르지 않아요')
  })
})
