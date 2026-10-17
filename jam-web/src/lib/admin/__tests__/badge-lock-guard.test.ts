/**
 * 배지 양식의 잠금 칸 검증·정규화 (티켓 20261018_0051 2회, 운영 로직 7.4절)
 *
 * 고정하는 것: 최소값 미만 거부, 비움 허용(등급 최소값을 쓴다), 최소값 이상 허용, 정수가 아닌 값 거부,
 * 아이템 배지가 아니면 검사·저장하지 않음. 최소값은 `jam_policy.locked_min_*`에서 온다.
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_JAM_POLICY } from '@/lib/jam/policy'
import {
  findUnlockRequiredError,
  lockedMinimumsFrom,
  normalizeLockFields,
  parseUnlockRequired,
} from '../badge-lock-guard'

const MINS = lockedMinimumsFrom(DEFAULT_JAM_POLICY)

describe('lockedMinimumsFrom', () => {
  it('정책의 등급별 최소값(30·60·120·240)을 그대로 뽑는다', () => {
    expect(MINS).toEqual({ common: 30, rare: 60, epic: 120, mystic: 240 })
  })

  it('정책 값이 바뀌면 따라 바뀐다', () => {
    expect(lockedMinimumsFrom({ ...DEFAULT_JAM_POLICY, locked_min_rare: 75 }).rare).toBe(75)
  })
})

describe('parseUnlockRequired', () => {
  it('비움(null·undefined·빈 문자열·공백)은 null이다', () => {
    for (const raw of [null, undefined, '', '   ']) expect(parseUnlockRequired(raw)).toBeNull()
  })

  it('1 이상의 정수는 숫자로 돌려준다(문자열 입력 포함)', () => {
    expect(parseUnlockRequired(60)).toBe(60)
    expect(parseUnlockRequired(' 90 ')).toBe(90)
  })

  it('0·음수·소수·숫자가 아닌 값·INTEGER 상한 초과는 invalid다', () => {
    for (const raw of [0, -5, 1.5, 'abc', NaN, 2_147_483_648, true, {}]) expect(parseUnlockRequired(raw)).toBe('invalid')
  })
})

describe('findUnlockRequiredError', () => {
  it('등급 최소값보다 적으면 거부하고 등급 이름과 최소값을 문구에 담는다', () => {
    const message = findUnlockRequiredError('item', 'rare', 59, MINS)
    expect(message).toContain('Rare')
    expect(message).toContain('60잼')
    expect(findUnlockRequiredError('item', 'mystic', 239, MINS)).toContain('240잼')
  })

  it('최소값과 같거나 크면 허용한다', () => {
    expect(findUnlockRequiredError('item', 'rare', 60, MINS)).toBeNull()
    expect(findUnlockRequiredError('item', 'common', 500, MINS)).toBeNull()
  })

  it('비우면 허용한다(발급 때 등급 최소값을 쓴다)', () => {
    expect(findUnlockRequiredError('item', 'epic', '', MINS)).toBeNull()
    expect(findUnlockRequiredError('item', 'epic', null, MINS)).toBeNull()
  })

  it('정수가 아닌 값은 형식 안내로 거부한다', () => {
    expect(findUnlockRequiredError('item', 'rare', 'abc', MINS)).toContain('1 이상의 정수')
    expect(findUnlockRequiredError('item', 'rare', 0, MINS)).toContain('1 이상의 정수')
  })

  it('정책 최소값이 바뀌면 같은 입력의 판정도 바뀐다', () => {
    const raised = lockedMinimumsFrom({ ...DEFAULT_JAM_POLICY, locked_min_rare: 80 })
    expect(findUnlockRequiredError('item', 'rare', 70, MINS)).toBeNull()
    expect(findUnlockRequiredError('item', 'rare', 70, raised)).not.toBeNull()
  })

  it('아이템 배지가 아니면 검사하지 않는다', () => {
    expect(findUnlockRequiredError('activity', 'rare', 1, MINS)).toBeNull()
    expect(findUnlockRequiredError('checkin', null, 'abc', MINS)).toBeNull()
  })

  it('등급이 없는 아이템 배지는 최소값 비교를 건너뛴다', () => {
    expect(findUnlockRequiredError('item', null, 1, MINS)).toBeNull()
  })
})

describe('normalizeLockFields', () => {
  it('아이템 배지는 입력 그대로 저장한다', () => {
    expect(normalizeLockFields('item', true, 90)).toEqual({ always_locked: true, unlock_required: 90 })
    expect(normalizeLockFields('item', false, '')).toEqual({ always_locked: false, unlock_required: null })
  })

  it('true가 아닌 잠김 값은 잠그지 않는다', () => {
    expect(normalizeLockFields('item', 'true', null).always_locked).toBe(false)
    expect(normalizeLockFields('item', undefined, null).always_locked).toBe(false)
  })

  it('아이템 배지가 아니면 항상 잠그지 않고 값을 비운다', () => {
    expect(normalizeLockFields('activity', true, 90)).toEqual({ always_locked: false, unlock_required: null })
  })
})
