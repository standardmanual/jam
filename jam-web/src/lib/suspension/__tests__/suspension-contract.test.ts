/**
 * 이용 정지 계약 — 정지 구간 판정 (티켓 20261017_1426, 운영 로직 16.4절)
 *
 * 고정하는 것:
 * - 구간은 반열린 `[suspendedAt, liftedAt)`이다. 경계 4종: 정지 직전(밖), 정지 정각(안), 해제 직전(안), 해제 정각(밖).
 * - `liftedAt`이 null이면 끝없음이다(정지 정각 이후 전부 안).
 * - 구간이 여러 개이면 어느 하나에라도 들면 안이다. 구간 사이(풀린 동안)는 밖이다.
 * - 구간이 없거나 시각을 읽을 수 없으면 밖이다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/suspension/__tests__/suspension-contract.test.ts
 */
import { describe, it, expect } from 'vitest'
import { isDuringSuspension, USER_SUSPENDED_CODE, type SuspensionPeriod } from '../suspension-contract'

const SUSPENDED_AT = '2026-10-10T00:00:00.000Z'
const LIFTED_AT = '2026-10-12T00:00:00.000Z'
const at = (iso: string) => Date.parse(iso)

const CLOSED: SuspensionPeriod[] = [{ suspendedAt: SUSPENDED_AT, liftedAt: LIFTED_AT }]
const OPEN_ENDED: SuspensionPeriod[] = [{ suspendedAt: SUSPENDED_AT, liftedAt: null }]

describe('isDuringSuspension — 반열린 구간 [suspendedAt, liftedAt) 경계', () => {
  it('정지 직전(1ms 전)에 시작한 활동은 구간 밖이다', () => {
    expect(isDuringSuspension(at(SUSPENDED_AT) - 1, CLOSED)).toBe(false)
  })

  it('정지 정각(건 시각과 같은 ms)에 시작한 활동은 구간 안이다', () => {
    expect(isDuringSuspension(at(SUSPENDED_AT), CLOSED)).toBe(true)
  })

  it('정지 직후(1ms 뒤)에 시작한 활동은 구간 안이다', () => {
    expect(isDuringSuspension(at(SUSPENDED_AT) + 1, CLOSED)).toBe(true)
  })

  it('해제 직전(1ms 전)에 시작한 활동은 구간 안이다', () => {
    expect(isDuringSuspension(at(LIFTED_AT) - 1, CLOSED)).toBe(true)
  })

  it('해제 정각(푼 시각과 같은 ms)에 시작한 활동은 구간 밖이다', () => {
    expect(isDuringSuspension(at(LIFTED_AT), CLOSED)).toBe(false)
  })

  it('해제 직후(1ms 뒤)에 시작한 활동은 구간 밖이다', () => {
    expect(isDuringSuspension(at(LIFTED_AT) + 1, CLOSED)).toBe(false)
  })
})

describe('isDuringSuspension — 끝없는 정지(liftedAt null)', () => {
  it('정지 직전은 밖, 정지 정각과 그 뒤 아주 먼 미래까지는 안이다', () => {
    expect(isDuringSuspension(at(SUSPENDED_AT) - 1, OPEN_ENDED)).toBe(false)
    expect(isDuringSuspension(at(SUSPENDED_AT), OPEN_ENDED)).toBe(true)
    expect(isDuringSuspension(at('2099-01-01T00:00:00.000Z'), OPEN_ENDED)).toBe(true)
  })
})

describe('isDuringSuspension — 구간이 여러 개', () => {
  const PERIODS: SuspensionPeriod[] = [
    { suspendedAt: '2026-09-01T00:00:00.000Z', liftedAt: '2026-09-03T00:00:00.000Z' },
    { suspendedAt: '2026-10-10T00:00:00.000Z', liftedAt: null },
  ]

  it('앞 구간 안, 구간 사이(풀린 동안), 뒤 구간 안을 각각 가른다', () => {
    expect(isDuringSuspension(at('2026-09-02T00:00:00.000Z'), PERIODS)).toBe(true)
    expect(isDuringSuspension(at('2026-09-20T00:00:00.000Z'), PERIODS)).toBe(false)
    expect(isDuringSuspension(at('2026-10-11T00:00:00.000Z'), PERIODS)).toBe(true)
  })

  it('첫 정지 이전은 밖이다', () => {
    expect(isDuringSuspension(at('2026-08-31T23:59:59.999Z'), PERIODS)).toBe(false)
  })

  it('배열 순서와 무관하다', () => {
    expect(isDuringSuspension(at('2026-09-02T00:00:00.000Z'), [...PERIODS].reverse())).toBe(true)
  })
})

describe('isDuringSuspension — 구간 없음·읽을 수 없는 시각', () => {
  it('구간이 없으면 밖이다', () => {
    expect(isDuringSuspension(at(SUSPENDED_AT), [])).toBe(false)
  })

  it('활동 시작 시각을 읽을 수 없으면(NaN) 밖이다', () => {
    expect(isDuringSuspension(Number.NaN, OPEN_ENDED)).toBe(false)
  })
})

describe('상수', () => {
  it('정지 응답 코드는 user_suspended다', () => {
    expect(USER_SUSPENDED_CODE).toBe('user_suspended')
  })
})
