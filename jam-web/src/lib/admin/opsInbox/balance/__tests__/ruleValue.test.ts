/**
 * 규칙 값 저장 검증 (티켓 20260930_1459 조각 B)
 *
 * 서버(PATCH)와 설정 화면이 함께 쓰는 `validateRuleValue`와 `checkIntegerField`를 칸별 오류 문장까지 고정한다:
 * - R1~R3 `max`와 R4 `min_days`는 1 이상의 정수, R5의 다섯 `max`는 0 이상의 정수, `provisional`은 불리언
 * - 빈 칸·소수·음수·글자·너무 큰 수가 각각 맞는 문장으로 막힌다(칸별 `fieldErrors`)
 * - R6·R7·R8은 값을 바꿀 수 없다
 * - 통과한 값은 저장 모양(`{ max, provisional }` 등)으로 정리되고 모르는 칸은 버려진다
 * - 규칙 행 읽기(`toRuleRecord`)와 값 읽기(`parseRuleValue`)
 */
import { describe, it, expect } from 'vitest'
import {
  BALANCE_RULE_KEYS,
  RULE_VALUE_ERRORS,
  checkIntegerField,
  isValueEditable,
  parseRuleValue,
  toRuleRecord,
  validateRuleValue,
} from '../rules'

describe('checkIntegerField', () => {
  it('빈 값은 「값을 적어 주세요」다', () => {
    for (const raw of [undefined, null, '', '   ']) expect(checkIntegerField(raw, 1)).toBe('값을 적어 주세요')
  })

  it('정수가 아닌 것(소수·글자·무한·너무 큰 수·글자로 온 숫자)은 「정수로 적어 주세요 (예: 6)」다', () => {
    for (const raw of [1.5, 'abc', '6', NaN, Infinity, 2 ** 60, true, {}]) {
      expect(checkIntegerField(raw, 1)).toBe('정수로 적어 주세요 (예: 6)')
    }
  })

  it('1 이상 칸: 0과 음수는 「1 이상의 정수로 적어 주세요」다', () => {
    expect(checkIntegerField(0, 1)).toBe('1 이상의 정수로 적어 주세요')
    expect(checkIntegerField(-3, 1)).toBe('1 이상의 정수로 적어 주세요')
    expect(checkIntegerField(1, 1)).toBeNull()
  })

  it('0 이상 칸: 0은 통과하고 음수는 「0 이상의 정수로 적어 주세요 (0이면 …)」다', () => {
    expect(checkIntegerField(0, 0)).toBeNull()
    expect(checkIntegerField(-1, 0)).toBe('0 이상의 정수로 적어 주세요 (0이면 포인트가 있는 항목은 모두 알려요)')
  })
})

describe('validateRuleValue R1~R3', () => {
  for (const key of ['open_collections_max', 'weekly_new_collections_max', 'rolling_new_collections_max'] as const) {
    it(`${key}: 통과하면 { max, provisional } 모양이다(모르는 칸은 버린다)`, () => {
      expect(validateRuleValue(key, { max: 6, provisional: true, extra: 'x' })).toEqual({ ok: true, value: { max: 6, provisional: true } })
    })

    it(`${key}: 칸별 오류가 max와 provisional에 따로 달린다`, () => {
      expect(validateRuleValue(key, { max: 0, provisional: 'yes' })).toEqual({
        ok: false,
        fieldErrors: { max: '1 이상의 정수로 적어 주세요', provisional: RULE_VALUE_ERRORS.provisional },
      })
      expect(validateRuleValue(key, { max: 1.5, provisional: false })).toEqual({
        ok: false,
        fieldErrors: { max: '정수로 적어 주세요 (예: 6)' },
      })
      expect(validateRuleValue(key, { provisional: false })).toEqual({ ok: false, fieldErrors: { max: '값을 적어 주세요' } })
    })
  }

  it('값이 객체가 아니면 값 전체의 오류(value)다', () => {
    for (const raw of [null, 6, 'x', [1]]) {
      expect(validateRuleValue('open_collections_max', raw)).toEqual({ ok: false, fieldErrors: { value: RULE_VALUE_ERRORS.shape } })
    }
  })
})

describe('validateRuleValue R4', () => {
  it('min_days는 1 이상의 정수다', () => {
    expect(validateRuleValue('launch_lead_days_min', { min_days: 28, provisional: false })).toEqual({
      ok: true,
      value: { min_days: 28, provisional: false },
    })
    expect(validateRuleValue('launch_lead_days_min', { min_days: 0, provisional: false })).toEqual({
      ok: false,
      fieldErrors: { min_days: '1 이상의 정수로 적어 주세요' },
    })
  })

  it('R1~R3의 max 칸 이름(max)은 R4에서 받지 않는다', () => {
    expect(validateRuleValue('launch_lead_days_min', { max: 28, provisional: false })).toEqual({
      ok: false,
      fieldErrors: { min_days: '값을 적어 주세요' },
    })
  })
})

describe('validateRuleValue R5', () => {
  const kinds = (patch: Record<string, unknown> = {}) => ({
    kinds: {
      count_badge: { max: 10, provisional: true },
      achievement_badge: { max: 100, provisional: false },
      mission: { max: 50, provisional: true },
      collection_completion: { max: 20, provisional: false },
      recipe: { max: 30, provisional: false },
      ...patch,
    },
  })

  it('다섯 종류가 모두 통과하면 kinds 모양으로 저장한다(0도 통과)', () => {
    const result = validateRuleValue('point_reward_max', kinds({ recipe: { max: 0, provisional: false } }))
    expect(result).toEqual({
      ok: true,
      value: {
        kinds: {
          count_badge: { max: 10, provisional: true },
          achievement_badge: { max: 100, provisional: false },
          mission: { max: 50, provisional: true },
          collection_completion: { max: 20, provisional: false },
          recipe: { max: 0, provisional: false },
        },
      },
    })
  })

  it('오류는 종류별 칸 경로(kinds.<종류>.max)에 달린다', () => {
    const result = validateRuleValue(
      'point_reward_max',
      kinds({ mission: { max: -1, provisional: true }, recipe: { max: '', provisional: false }, count_badge: { max: 2.5, provisional: 'x' } })
    )
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        'kinds.count_badge.max': '정수로 적어 주세요 (예: 6)',
        'kinds.count_badge.provisional': RULE_VALUE_ERRORS.provisional,
        'kinds.mission.max': '0 이상의 정수로 적어 주세요 (0이면 포인트가 있는 항목은 모두 알려요)',
        'kinds.recipe.max': '값을 적어 주세요',
      },
    })
  })

  it('kinds가 없거나 종류가 빠지면 빠진 종류마다 오류다', () => {
    const result = validateRuleValue('point_reward_max', { kinds: { mission: { max: 50, provisional: true } } })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(Object.keys(result.fieldErrors).sort()).toEqual([
        'kinds.achievement_badge.max',
        'kinds.achievement_badge.provisional',
        'kinds.collection_completion.max',
        'kinds.collection_completion.provisional',
        'kinds.count_badge.max',
        'kinds.count_badge.provisional',
        'kinds.recipe.max',
        'kinds.recipe.provisional',
      ])
    }
    expect(validateRuleValue('point_reward_max', {}).ok).toBe(false)
  })
})

describe('R6·R7·R8은 값을 바꿀 수 없다', () => {
  it('값을 보내면 어떤 값이어도 거부한다', () => {
    for (const key of ['single_action_points', 'count_ladder_points', 'economy_keys'] as const) {
      expect(isValueEditable(key)).toBe(false)
      for (const raw of [{}, { keys: ['a'] }, null, 5]) {
        expect(validateRuleValue(key, raw)).toEqual({ ok: false, fieldErrors: { value: RULE_VALUE_ERRORS.readOnly } })
      }
    }
  })

  it('값을 바꿀 수 있는 규칙은 R1~R5뿐이다', () => {
    expect(BALANCE_RULE_KEYS.filter((key) => isValueEditable(key))).toEqual([
      'open_collections_max',
      'weekly_new_collections_max',
      'rolling_new_collections_max',
      'launch_lead_days_min',
      'point_reward_max',
    ])
  })
})

describe('규칙 행 읽기', () => {
  it('toRuleRecord는 열 이름을 camelCase로 옮기고 level이 낯설면 주의로 읽는다', () => {
    const row = {
      rule_key: 'open_collections_max',
      rule_group: 'balance',
      value: { max: 6, provisional: true },
      level: 'weird',
      enabled: true,
      updated_at: '2026-10-01T05:00:00+00:00',
      updated_by: null,
      previous_value: null,
    }
    expect(toRuleRecord(row)).toEqual({
      ruleKey: 'open_collections_max',
      group: 'balance',
      value: { max: 6, provisional: true },
      level: 'warn',
      enabled: true,
      updatedAt: '2026-10-01T05:00:00+00:00',
      edited: false,
      previousValue: null,
    })
    expect(toRuleRecord({ ...row, level: 'info' }).level).toBe('info')
  })

  it('parseRuleValue는 규칙 키에 맞는 타입으로 읽고 모양이 틀리면 null이다', () => {
    expect(parseRuleValue('open_collections_max', { max: 6, provisional: true })).toEqual({ max: 6, provisional: true })
    expect(parseRuleValue('launch_lead_days_min', { min_days: 28, provisional: false })).toEqual({ minDays: 28, provisional: false })
    expect(parseRuleValue('economy_keys', { keys: ['a', 'b'] })).toEqual({ keys: ['a', 'b'] })
    expect(parseRuleValue('single_action_points', {})).toEqual({})
    expect(parseRuleValue('open_collections_max', { max: 'x' })).toBeNull()
    expect(parseRuleValue('economy_keys', { keys: [1] })).toBeNull()
  })
})
