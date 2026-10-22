/**
 * 밸런스 설정 칸 검증과 초안 계산 (티켓 20261022_1132 1회) — 순수 함수라 DB를 쓰지 않는다. 지키는 것:
 * - 정수 칸은 정수만, 범위(최소·최대)와 소수 자릿수를 넘으면 칸 아래 문장이 나온다. 입력 글자는 숫자와 소수점만 읽는다
 * - 초안 오류(빈 칸·읽을 수 없는 글자·범위 밖), 바뀐 칸 계산(읽을 수 없는 글자는 바뀐 것으로 세지 않는다), 현재 값과 새 값의 차이(이력 줄)
 * - 등급 확률 합 100(±0.001) 검증: 합에 든 모든 칸에 같은 문장, 칸이 비어 있으면 합을 알 수 없어 검사하지 않는다
 * - 잼 구역의 칸 정의가 `lib/jam/policy.ts`의 `VALIDATORS`와 어긋나지 않고(칸 정의를 통과하면 `VALIDATORS`도 통과), 기본값이 `DEFAULT_JAM_POLICY`와 같다
 * - (2회) 합계 묶음 계산(`groupSums`), «모두 0» 경고(`activeZeroWarnings`), 확률 안내 반영 칸 가름(`splitDisclosureChanges`),
 *   같은 행을 쓰는 다른 구역의 저장 뒤 수정 시각 비교(`reconcileSnapshot`), DB 숫자 읽기(`dbNumber`)
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import { DEFAULT_JAM_POLICY, VALIDATORS } from '@/lib/jam/policy'
import { JAM_BALANCE_KEYS, JAM_FIELDS, JAM_SELECT } from '../jam'
import {
  activeZeroWarnings,
  checkFieldValue,
  dbNumber,
  diffValues,
  draftChangedValues,
  draftErrors,
  draftFromValues,
  formatBalanceNumber,
  fullFieldLabel,
  groupSums,
  parseDraftNumber,
  rangeMessage,
  reconcileSnapshot,
  splitDisclosureChanges,
  sumMismatchMessage,
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

  it('이력에 쓰는 칸 이름은 묶음 제목이 있으면 함께 쓴다', () => {
    expect(fullFieldLabel({ ...INT_FIELD, label: '가벼움', group: '강도 배율' })).toBe('강도 배율 · 가벼움')
    expect(fullFieldLabel(INT_FIELD)).toBe('기간')
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

describe('dbNumber — DB 숫자 칸 읽기', () => {
  it('NUMERIC 문자열과 숫자를 읽고 그 밖은 null이다', () => {
    expect(dbNumber('3.00')).toBe(3)
    expect(dbNumber(2.5)).toBe(2.5)
    expect(dbNumber('abc')).toBeNull()
    expect(dbNumber(null)).toBeNull()
    expect(dbNumber(undefined)).toBeNull()
    expect(dbNumber(Number.NaN)).toBeNull()
  })
})

describe('groupSums — 합계를 맞춰야 하는 묶음', () => {
  const rarity = (key: string): BalanceFieldDef => ({ ...DECIMAL_FIELD, key, label: key, group: '등급 확률', unit: '%', min: 0, max: 100, sumTo: 100 })
  const fields = [INT_FIELD, rarity('a'), rarity('b'), rarity('c'), rarity('d')]
  const draft = (a: string, b: string, c: string, d: string) => ({ weeks: '4', a, b, c, d })

  it('sumTo를 지정한 칸이 있는 묶음마다 하나씩 합계를 낸다(그 밖의 묶음은 없다)', () => {
    const sums = groupSums(fields, draft('84', '13', '2.5', '0.5'))
    expect(sums).toEqual([{ title: '등급 확률', target: 100, unit: '%', sum: 100, ok: true, message: null }])
    expect(groupSums([INT_FIELD, DECIMAL_FIELD], { weeks: '4', multiplier: '3' })).toEqual([])
  })

  it('합이 100이 아니면 어긋난 문장을 돌려준다(서버와 같은 문장)', () => {
    const [sum] = groupSums(fields, draft('80', '13', '2.5', '0.5'))
    expect(sum.ok).toBe(false)
    expect(sum.sum).toBe(96)
    expect(sum.message).toBe(sumMismatchMessage('등급 확률', 96))
    expect(sum.message).toBe('등급 확률 합이 100이어야 해요. 지금은 96이에요.')
    expect(validateSumTo100({ a: 80, b: 13, c: 2.5, d: 0.5 }, ['a', 'b', 'c', 'd']).a).toBe(sum.message)
  })

  it('허용 오차 0.001 안은 맞는 것으로 본다', () => {
    expect(groupSums(fields, draft('84', '13', '2.5', '0.5004'))[0].ok).toBe(true)
    expect(groupSums(fields, draft('84', '13', '2.5', '0.502'))[0].ok).toBe(false)
  })

  it('읽을 수 없는 칸이 있으면 합계를 알 수 없고 어긋난 것으로 세지 않는다(칸 오류가 따로 저장을 막는다)', () => {
    const [sum] = groupSums(fields, draft('84', '13', '', '0.5'))
    expect(sum).toMatchObject({ sum: null, ok: true, message: null })
  })
})

describe('activeZeroWarnings — 모두 0이면 켜지는 경고', () => {
  const warnings = [{ keys: ['a', 'b'], message: '둘 다 0이에요.' }]

  it('나열한 칸이 모두 0일 때만 문장이 나온다', () => {
    expect(activeZeroWarnings(warnings, { a: '0', b: '0' })).toEqual(['둘 다 0이에요.'])
    expect(activeZeroWarnings(warnings, { a: '0', b: '1' })).toEqual([])
    expect(activeZeroWarnings(warnings, { a: '0', b: '' })).toEqual([])
    expect(activeZeroWarnings(warnings, { a: '0', b: 'x' })).toEqual([])
  })

  it('경고가 없는 구역은 빈 목록이다', () => {
    expect(activeZeroWarnings(undefined, { a: '0' })).toEqual([])
    expect(activeZeroWarnings([], { a: '0' })).toEqual([])
  })
})

describe('splitDisclosureChanges — 확률 안내에 반영되는 칸 가름', () => {
  const affecting: BalanceFieldDef = { ...INT_FIELD, key: 'p', label: '확률', affectsDisclosure: true }
  const plain: BalanceFieldDef = { ...INT_FIELD, key: 'q', label: '그 밖', affectsDisclosure: false }
  const fields = [affecting, plain]
  const saved = { p: 1, q: 2 }

  it('바뀐 칸을 반영 칸과 그 밖의 칸으로 나눈다(칸 정의 순서)', () => {
    expect(splitDisclosureChanges(fields, saved, { p: 5, q: 6 })).toEqual({
      disclosure: [{ field: 'p', from: 1, to: 5 }],
      others: [{ field: 'q', from: 2, to: 6 }],
    })
  })

  it('반영 칸이 바뀌지 않았으면 disclosure가 비어 확인창이 필요 없다', () => {
    expect(splitDisclosureChanges(fields, saved, { q: 9 })).toEqual({ disclosure: [], others: [{ field: 'q', from: 2, to: 9 }] })
    expect(splitDisclosureChanges(fields, saved, {})).toEqual({ disclosure: [], others: [] })
  })

  it('값이 같은 칸은 바뀐 것으로 세지 않는다', () => {
    expect(splitDisclosureChanges(fields, saved, { p: 1 }).disclosure).toEqual([])
  })
})

describe('reconcileSnapshot — 화면을 새로 읽었을 때', () => {
  const fields = [INT_FIELD, DECIMAL_FIELD]
  const prev = { values: { weeks: 4, multiplier: 3 }, updatedAt: 't1' }

  it('수정 시각이 같으면 same이다', () => {
    expect(reconcileSnapshot(fields, prev, { values: { weeks: 9, multiplier: 9 }, updatedAt: 't1' })).toBe('same')
  })

  it('수정 시각만 달라지고 이 구역의 값은 그대로면 adopt다(같은 행을 쓰는 다른 구역이 저장했다)', () => {
    expect(reconcileSnapshot(fields, prev, { values: { weeks: 4, multiplier: 3 }, updatedAt: 't2' })).toBe('adopt')
  })

  it('이 구역의 값이 달라졌으면 reset이다', () => {
    expect(reconcileSnapshot(fields, prev, { values: { weeks: 5, multiplier: 3 }, updatedAt: 't2' })).toBe('reset')
  })
})
