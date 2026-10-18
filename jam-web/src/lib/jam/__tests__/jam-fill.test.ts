/**
 * 잼 채우기 입력 보정 (티켓 20261018_0054 1회)
 *
 * 실행: cd jam-web && npx vitest run src/lib/jam/__tests__/jam-fill.test.ts
 */
import { describe, it, expect } from 'vitest'
import { defaultFillAmount, maxFillAmount, parseFillAmount, sanitizeFillInput } from '../jam-fill'

describe('defaultFillAmount·maxFillAmount', () => {
  it('기본값은 남은 양이다(가진 잼이 넉넉할 때)', () => {
    expect(defaultFillAmount(180, 500)).toBe(180)
  })

  it('가진 잼이 남은 양보다 적으면 가진 양이다', () => {
    expect(defaultFillAmount(180, 40)).toBe(40)
  })

  it('둘 중 하나가 0 이하이면 0이다', () => {
    expect(defaultFillAmount(0, 40)).toBe(0)
    expect(defaultFillAmount(180, 0)).toBe(0)
    expect(defaultFillAmount(-5, 40)).toBe(0)
    expect(defaultFillAmount(180, -1)).toBe(0)
  })

  it('숫자가 아닌 값은 0으로 본다', () => {
    expect(maxFillAmount(Number.NaN, 40)).toBe(0)
    expect(maxFillAmount(180, Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('소수는 내린다', () => {
    expect(maxFillAmount(10.9, 20.5)).toBe(10)
  })
})

describe('sanitizeFillInput', () => {
  it('숫자가 아닌 글자를 지운다', () => {
    expect(sanitizeFillInput('1a2b3', 500)).toBe('123')
    expect(sanitizeFillInput('-5', 500)).toBe('5')
    expect(sanitizeFillInput('1,2', 500)).toBe('12')
  })

  it('앞의 0을 뗀다. 0만 있으면 빈 값이다', () => {
    expect(sanitizeFillInput('007', 500)).toBe('7')
    expect(sanitizeFillInput('0', 500)).toBe('')
    expect(sanitizeFillInput('000', 500)).toBe('')
  })

  it('비어 있으면 빈 값 그대로다(지우는 중에 0이 끼어들지 않는다)', () => {
    expect(sanitizeFillInput('', 500)).toBe('')
  })

  it('상한을 넘으면 상한으로 맞춘다', () => {
    expect(sanitizeFillInput('181', 180)).toBe('180')
    expect(sanitizeFillInput('999999', 180)).toBe('180')
    // 자릿수가 크게 넘어도 정밀도 문제 없이 상한이다
    expect(sanitizeFillInput('99999999999999999999999', 180)).toBe('180')
  })

  it('상한 이하는 그대로다', () => {
    expect(sanitizeFillInput('180', 180)).toBe('180')
    expect(sanitizeFillInput('25', 180)).toBe('25')
  })
})

describe('parseFillAmount', () => {
  it('1 이상의 정수 문자열만 숫자로 읽는다', () => {
    expect(parseFillAmount('1')).toBe(1)
    expect(parseFillAmount('180')).toBe(180)
  })

  it('빈 값·0·비숫자는 null이다', () => {
    expect(parseFillAmount('')).toBeNull()
    expect(parseFillAmount('0')).toBeNull()
    expect(parseFillAmount('abc')).toBeNull()
    expect(parseFillAmount('1.5')).toBeNull()
    expect(parseFillAmount('-3')).toBeNull()
  })
})
