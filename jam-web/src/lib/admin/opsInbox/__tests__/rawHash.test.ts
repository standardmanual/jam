/**
 * 제출 본문 해시 (티켓 20260930_1816) — 재제출이 「같은 내용인가」를 가르는 기준이다.
 */
import { describe, it, expect } from 'vitest'
import { computeRawHash, stableStringify } from '../rawHash'

describe('stableStringify', () => {
  it('객체 키를 재귀적으로 정렬한다', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}')
  })

  it('배열 순서는 유지한다(순서에 의미가 있다)', () => {
    expect(stableStringify([3, 1, 2])).toBe('[3,1,2]')
    expect(stableStringify({ items: [{ b: 1, a: 2 }] })).toBe('{"items":[{"a":2,"b":1}]}')
  })

  it('null·문자열·숫자·불리언을 JSON 그대로 쓴다', () => {
    expect(stableStringify(null)).toBe('null')
    expect(stableStringify('가"나')).toBe('"가\\"나"')
    expect(stableStringify([1, true, null])).toBe('[1,true,null]')
  })
})

describe('computeRawHash', () => {
  it('64자리 16진수(SHA-256)다', () => {
    expect(computeRawHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/)
  })

  it('키 순서만 다른 본문은 같은 해시다', () => {
    expect(computeRawHash({ a: 1, b: { c: 2, d: 3 } })).toBe(computeRawHash({ b: { d: 3, c: 2 }, a: 1 }))
  })

  it('내용이 다르면 다른 해시다', () => {
    expect(computeRawHash({ a: 1 })).not.toBe(computeRawHash({ a: 2 }))
    expect(computeRawHash({ items: [1, 2] })).not.toBe(computeRawHash({ items: [2, 1] }))
  })
})
