/**
 * 배지 유효기간 판정 순수 함수 — 경계값 단위 테스트 (티켓 20260930_0015)
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/valid-period.test.ts
 */
import { describe, it, expect } from 'vitest'
import { isWithinValidPeriod } from '../validPeriod'

const NOW = new Date('2026-09-30T00:00:00.000Z')

describe('isWithinValidPeriod', () => {
  it('valid_from·valid_until이 모두 NULL이면 제한 없음(기간 안)', () => {
    expect(isWithinValidPeriod({ valid_from: null, valid_until: null }, NOW)).toBe(true)
  })

  it('valid_from이 지금보다 뒤면 기간 밖(시작 전)', () => {
    expect(isWithinValidPeriod({ valid_from: '2026-09-30T00:00:01+00:00', valid_until: null }, NOW)).toBe(false)
  })

  it('valid_until이 지금보다 앞이면 기간 밖(종료 후)', () => {
    expect(isWithinValidPeriod({ valid_from: null, valid_until: '2026-09-29T23:59:59+00:00' }, NOW)).toBe(false)
  })

  it('valid_from == now는 기간 안(경계 포함)', () => {
    expect(isWithinValidPeriod({ valid_from: '2026-09-30T00:00:00+00:00', valid_until: null }, NOW)).toBe(true)
  })

  it('valid_until == now는 기간 안(경계 포함)', () => {
    expect(isWithinValidPeriod({ valid_from: null, valid_until: '2026-09-30T00:00:00+00:00' }, NOW)).toBe(true)
  })

  it('시작 후·종료 전이면 기간 안', () => {
    expect(
      isWithinValidPeriod({ valid_from: '2026-09-01T00:00:00+00:00', valid_until: '2026-10-01T00:00:00+00:00' }, NOW)
    ).toBe(true)
  })

  it('valid_from만 있고 이미 지났으면 기간 안', () => {
    expect(isWithinValidPeriod({ valid_from: '2026-09-24T00:00:00+00:00', valid_until: null }, NOW)).toBe(true)
  })

  it('DB 표기(+00:00)와 toISOString 표기(Z)가 같은 시각이면 같게 판정한다', () => {
    const zNow = new Date('2026-09-30T00:00:00.000Z')
    expect(isWithinValidPeriod({ valid_from: '2026-09-30T00:00:00+00:00', valid_until: null }, zNow)).toBe(true)
    expect(isWithinValidPeriod({ valid_from: '2026-09-30T00:00:00.000Z', valid_until: null }, zNow)).toBe(true)
  })

  it('UTC가 아닌 오프셋 표기도 시각 값으로 비교한다(KST 09:00 == UTC 00:00)', () => {
    expect(isWithinValidPeriod({ valid_from: '2026-09-30T09:00:00+09:00', valid_until: null }, NOW)).toBe(true)
    expect(isWithinValidPeriod({ valid_from: '2026-09-30T09:00:01+09:00', valid_until: null }, NOW)).toBe(false)
  })
})
