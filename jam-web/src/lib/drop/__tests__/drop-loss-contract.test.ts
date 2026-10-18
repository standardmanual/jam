/**
 * 사라질 채운 양 판정 (티켓 20261018_1812)
 *
 * 실행: cd jam-web && npx vitest run src/lib/drop/__tests__/drop-loss-contract.test.ts
 */
import { describe, it, expect } from 'vitest'
import { computeLostFill } from '../drop-loss-contract'

describe('computeLostFill', () => {
  it('잠긴 개체는 채운 양이 사라진다', () => {
    expect(computeLostFill({ locked: true, filled: 60 })).toBe(60)
  })

  it('잠긴 개체의 채운 양이 0이면 0이다', () => {
    expect(computeLostFill({ locked: true, filled: 0 })).toBe(0)
  })

  it('열린 개체는 채운 양 값이 남아 있어도 0이다', () => {
    expect(computeLostFill({ locked: false, filled: 100 })).toBe(0)
  })

  it('음수나 숫자가 아닌 값은 0으로 닫는다', () => {
    expect(computeLostFill({ locked: true, filled: -5 })).toBe(0)
    expect(computeLostFill({ locked: true, filled: Number.NaN })).toBe(0)
  })
})
