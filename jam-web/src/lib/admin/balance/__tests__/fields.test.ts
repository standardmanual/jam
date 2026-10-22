/**
 * 밸런스 설정 칸 검증과 초안 계산 (티켓 20261022_1132 1회) — 순수 함수라 DB를 쓰지 않는다. 지키는 것:
 * - 정수 칸은 정수만, 범위(최소·최대)와 소수 자릿수를 넘으면 칸 아래 문장이 나온다. 입력 글자는 숫자와 소수점만 읽는다
 * - 초안 오류(빈 칸·읽을 수 없는 글자·범위 밖), 바뀐 칸 계산(읽을 수 없는 글자는 바뀐 것으로 세지 않는다), 현재 값과 새 값의 차이(이력 줄)
 * - 등급 확률 합 100(±0.001) 검증: 합에 든 모든 칸에 같은 문장, 칸이 비어 있으면 합을 알 수 없어 검사하지 않는다
 * - 잼 구역의 칸 정의가 `lib/jam/policy.ts`의 `VALIDATORS`와 어긋나지 않고(칸 정의를 통과하면 `VALIDATORS`도 통과), 기본값이 `DEFAULT_JAM_POLICY`와 같다
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import { DEFAULT_JAM_POLICY, VALIDATORS } from '@/lib/jam/policy'
import { JAM_BALANCE_KEYS, JAM_FIELDS, JAM_SELECT } from '../jam'
import {
  checkFieldValue,
  diffValues,
  draftChangedValues,
  draftErrors,
  draftFromValues,
  formatBalanceNumber,
  parseDraftNumber,
  rangeMessage,
  validateSumTo100,
} from '../fields'
import { INTEGER_MAX, type BalanceFieldDef } from '../types'

const INT_FIELD: BalanceFieldDef = {
  key: 'weeks',
  label: '기간',
  decimals: 0,
  min: 1,
  max: INTEGER_MAX,
  defaultValue: 4,
  affectsDisclosure: false,
}
const DECIMAL_FIELD: BalanceFieldDef = {
  key: 'multiplier',
  label: '배수',
  decimals: 2,
  min: 0.01,
  max: 999.99,
  defaultValue: 3,
  affectsDisclosure: false,
}
const BOUNDED_INT_FIELD: BalanceFieldDef = { ...INT_FIELD, key: 'count', min: 0, max: 10 }

describe('parseDraftNumber', () => {
  it('숫자와 소수점만 읽고 앞뒤 공백은 버린다', () => {
    expect(parseDraftNumber('12')).toBe(12)
    expect(parseDraftNumber(' 0.25 ')).toBe(0.25)
    expect(parseDraftNumber('-3')).toBe(-3)
  })

  it('빈 글자·지수·16진수·쉼표·글자가 섞인 값은 읽지 않는다', () => {
    for (const text of ['', '   ', '1e3', '0x10', '1,200', '12개', '.5', '5.', 'abc', 'NaN', 'Infinity']) {
      expect(parseDraftNumber(text), text).toBeNull()
    }
  })
})

describe('checkFieldValue — 정수 칸', () => {
  it('범위 안의 정수는 통과한다', () => {
    expect(checkFieldValue(INT_FIELD, 1)).toBeNull()
    expect(checkFieldValue(INT_FIELD, INTEGER_MAX)).toBeNull()
    expect(checkFieldValue(BOUNDED_INT_FIELD, 10)).toBeNull()
  })

  it('소수·범위 밖은 칸 아래 문장이 나온다', () => {
    expect(checkFieldValue(INT_FIELD, 2.5)).toBe('1 이상의 정수로 입력해 주세요.')
    expect(checkFieldValue(INT_FIELD, 0)).toBe('1 이상의 정수로 입력해 주세요.')
    expect(checkFieldValue(INT_FIELD, INTEGER_MAX + 1)).toBe('1 이상의 정수로 입력해 주세요.')
    expect(checkFieldValue(BOUNDED_INT_FIELD, 11)).toBe('0 이상 10 이하의 정수로 입력해 주세요.')
  })

  it('숫자가 아닌 값(NaN·Infinity)은 거절한다', () => {
    expect(checkFieldValue(INT_FIELD, Number.NaN)).toBe('숫자로 입력해 주세요.')
    expect(checkFieldValue(INT_FIELD, Number.POSITIVE_INFINITY)).toBe('숫자로 입력해 주세요.')
  })
})

describe('checkFieldValue — 소수 칸', () => {
  it('소수 둘째 자리까지는 통과하고 셋째 자리부터 거절한다', () => {
    expect(checkFieldValue(DECIMAL_FIELD, 3)).toBeNull()
    expect(checkFieldValue(DECIMAL_FIELD, 2.5)).toBeNull()
    expect(checkFieldValue(DECIMAL_FIELD, 0.01)).toBeNull()
    expect(checkFieldValue(DECIMAL_FIELD, 999.99)).toBeNull()
    expect(checkFieldValue(DECIMAL_FIELD, 1.255)).toBe(rangeMessage(DECIMAL_FIELD))
  })

  it('0·상한 초과는 거절하고 문장에 범위와 자릿수가 있다', () => {
    expect(checkFieldValue(DECIMAL_FIELD, 0)).toBe('0.01 이상 999.99 이하로 입력해 주세요. 소수는 둘째 자리까지 쓸 수 있어요.')
    expect(checkFieldValue(DECIMAL_FIELD, 1000)).toBe(rangeMessage(DECIMAL_FIELD))
  })

  it('부동소수 곱셈 오차(0.07 × 100 등)로 올바른 값을 거절하지 않는다', () => {
    for (const n of [0.07, 0.29, 1.15, 4.35, 8.2]) expect(checkFieldValue(DECIMAL_FIELD, n), String(n)).toBeNull()
  })
})

describe('초안 계산', () => {
  const fields = [INT_FIELD, DECIMAL_FIELD]
  const saved = { weeks: 4, multiplier: 3 }

  it('저장된 값으로 입력 글자를 만든다', () => {
    expect(draftFromValues(fields, saved)).toEqual({ weeks: '4', multiplier: '3' })
  })

  it('빈 칸·읽을 수 없는 글자·범위 밖은 칸별 오류가 된다', () => {
    expect(draftErrors(fields, { weeks: '', multiplier: 'abc' })).toEqual({
      weeks: '값을 입력해 주세요.',
      multiplier: '숫자로 입력해 주세요.',
    })
    expect(draftErrors(fields, { weeks: '0', multiplier: '3' })).toEqual({ weeks: '1 이상의 정수로 입력해 주세요.' })
    expect(draftErrors(fields, { weeks: '4', multiplier: '3' })).toEqual({})
  })

  it('저장된 값과 다른 칸만 바뀐 값으로 센다(읽을 수 없는 글자는 세지 않는다)', () => {
    expect(draftChangedValues(fields, saved, { weeks: '6', multiplier: '3' })).toEqual({ weeks: 6 })
    expect(draftChangedValues(fields, saved, { weeks: '04', multiplier: '3.0' })).toEqual({})
    expect(draftChangedValues(fields, saved, { weeks: 'x', multiplier: '' })).toEqual({})
  })

  it('현재 값과 새 값을 견주어 바뀐 칸만 이력 줄로 만든다(칸 정의 순서)', () => {
    expect(diffValues(fields, saved, { multiplier: 2.5, weeks: 4 })).toEqual([{ field: 'multiplier', from: 3, to: 2.5 }])
    expect(diffValues(fields, saved, { weeks: 4 })).toEqual([])
    expect(diffValues(fields, saved, { multiplier: 5, weeks: 8 })).toEqual([
      { field: 'weeks', from: 4, to: 8 },
      { field: 'multiplier', from: 3, to: 5 },
    ])
  })

  it('숫자 글자는 천 단위 쉼표를 쓰고 소수는 필요한 자리까지만 쓴다', () => {
    expect(formatBalanceNumber(1200)).toBe('1,200')
    expect(formatBalanceNumber(0.25)).toBe('0.25')
    expect(formatBalanceNumber(100)).toBe('100')
  })
})

describe('validateSumTo100 — 등급 확률 합', () => {
  const keys = ['common', 'rare', 'epic', 'mystic']

  it('합이 100이면 통과한다(84 + 13 + 2.5 + 0.5)', () => {
    expect(validateSumTo100({ common: 84, rare: 13, epic: 2.5, mystic: 0.5 }, keys)).toEqual({})
  })

  it('허용 오차 0.001 안은 통과하고 그 밖은 합에 든 모든 칸에 같은 문장이 붙는다', () => {
    expect(validateSumTo100({ common: 84, rare: 13, epic: 2.5, mystic: 0.5004 }, keys)).toEqual({})
    const errors = validateSumTo100({ common: 80, rare: 13, epic: 2.5, mystic: 0.5 }, keys)
    expect(Object.keys(errors)).toEqual(keys)
    expect(new Set(Object.values(errors))).toEqual(new Set(['등급 확률 합이 100이어야 해요. 지금은 96이에요.']))
  })

  it('칸이 비어 있거나 숫자가 아니면 합을 알 수 없어 검사하지 않는다', () => {
    expect(validateSumTo100({ common: 84, rare: 13, epic: 2.5 }, keys)).toEqual({})
    expect(validateSumTo100({ common: 84, rare: 13, epic: 2.5, mystic: Number.NaN }, keys)).toEqual({})
  })
})

describe('잼 구역의 칸 정의', () => {
  it('편집 칸은 강도 배율 3칸과 대량 수령 경보 기준 3칸이고 읽기 칸 목록과 같다', () => {
    expect(JAM_FIELDS.map((def) => def.key)).toEqual([...JAM_BALANCE_KEYS])
    expect(JAM_FIELDS.map((def) => def.group)).toEqual([
      '강도 배율',
      '강도 배율',
      '강도 배율',
      '대량 수령 경보 기준',
      '대량 수령 경보 기준',
      '대량 수령 경보 기준',
    ])
    expect(JAM_SELECT.split(',').map((column) => column.trim())).toEqual([...JAM_BALANCE_KEYS, 'updated_at'])
  })

  it('기본값이 DEFAULT_JAM_POLICY와 같고 확률 안내에 반영되는 칸은 없다', () => {
    for (const def of JAM_FIELDS) {
      expect(def.defaultValue, def.key).toBe(DEFAULT_JAM_POLICY[def.key as keyof typeof DEFAULT_JAM_POLICY])
      expect(def.affectsDisclosure, def.key).toBe(false)
    }
  })

  it('칸 정의를 통과하는 값은 lib/jam/policy.ts의 VALIDATORS도 통과한다(DB CHECK와 같은 기준)', () => {
    const samples = [-1, 0, 0.005, 0.01, 0.5, 1, 2, 2.5, 3, 4, 52, 999.99, 1000, 1200, INTEGER_MAX, INTEGER_MAX + 1, Number.NaN]
    for (const def of JAM_FIELDS) {
      for (const n of samples) {
        if (checkFieldValue(def, n) === null) {
          expect(VALIDATORS[def.key as keyof typeof VALIDATORS](n), `${def.key}=${n}`).toBe(true)
        }
      }
    }
  })

  it('DB에서 허용하는 값은 칸 정의도 허용한다(0 배율, 경보 배수 0.01, 기간 1주)', () => {
    const byKey = Object.fromEntries(JAM_FIELDS.map((def) => [def.key, def]))
    expect(checkFieldValue(byKey.intensity_light, 0)).toBeNull()
    expect(checkFieldValue(byKey.mass_earn_alert_multiplier, 0.01)).toBeNull()
    expect(checkFieldValue(byKey.mass_earn_alert_weeks, 1)).toBeNull()
    expect(checkFieldValue(byKey.mass_earn_alert_weeks, 0)).not.toBeNull()
    expect(checkFieldValue(byKey.mass_earn_alert_no_history_amount, 0)).not.toBeNull()
  })
})
