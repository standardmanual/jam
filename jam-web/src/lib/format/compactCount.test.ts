import { describe, expect, it } from 'vitest'
import { compactCount } from './compactCount'

describe('compactCount', () => {
  it('999,999까지는 쉼표 표기다', () => {
    expect(compactCount(0)).toBe('0')
    expect(compactCount(586)).toBe('586')
    expect(compactCount(12345)).toBe('12,345')
    expect(compactCount(999999)).toBe('999,999')
  })

  it('1,000,000부터 소수 한 자리 M이다', () => {
    expect(compactCount(1_000_000)).toBe('1.0M')
    expect(compactCount(1_234_567)).toBe('1.2M')
    expect(compactCount(12_000_000)).toBe('12.0M')
  })

  it('소수 한 자리는 버림이다', () => {
    expect(compactCount(1_999_999)).toBe('1.9M')
  })

  it('음수·비정상 값은 0으로 본다', () => {
    expect(compactCount(-5)).toBe('0')
    expect(compactCount(Number.NaN)).toBe('0')
  })
})
