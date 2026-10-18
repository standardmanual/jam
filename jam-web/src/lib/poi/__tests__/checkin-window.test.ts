/**
 * 체크인 배지 공개 기간 판정 — 경계·NULL (티켓 20261018_1814)
 *
 * 실행: cd jam-web && npx vitest run src/lib/poi/__tests__/checkin-window.test.ts
 */
import { describe, it, expect } from 'vitest'
import { isActivityWithinBadgeWindow } from '../checkin-window'

const FROM = '2026-10-10T00:00:00Z'
const UNTIL = '2026-10-20T00:00:00Z'

describe('isActivityWithinBadgeWindow', () => {
  it('시작 직전은 기간 밖, 시작 시각과 직후는 기간 안', () => {
    expect(isActivityWithinBadgeWindow('2026-10-09T23:59:59Z', FROM, UNTIL)).toBe(false)
    expect(isActivityWithinBadgeWindow('2026-10-10T00:00:00Z', FROM, UNTIL)).toBe(true)
    expect(isActivityWithinBadgeWindow('2026-10-10T00:00:01Z', FROM, UNTIL)).toBe(true)
  })

  it('끝 직전과 끝 시각은 기간 안, 직후는 기간 밖', () => {
    expect(isActivityWithinBadgeWindow('2026-10-19T23:59:59Z', FROM, UNTIL)).toBe(true)
    expect(isActivityWithinBadgeWindow('2026-10-20T00:00:00Z', FROM, UNTIL)).toBe(true)
    expect(isActivityWithinBadgeWindow('2026-10-20T00:00:01Z', FROM, UNTIL)).toBe(false)
  })

  it('둘 다 NULL이면 언제든 기간 안', () => {
    expect(isActivityWithinBadgeWindow('2020-01-01T00:00:00Z', null, null)).toBe(true)
    expect(isActivityWithinBadgeWindow('2099-01-01T00:00:00Z', null, null)).toBe(true)
  })

  it('시작만 있으면 끝은 제한 없음, 끝만 있으면 시작은 제한 없음', () => {
    expect(isActivityWithinBadgeWindow('2099-01-01T00:00:00Z', FROM, null)).toBe(true)
    expect(isActivityWithinBadgeWindow('2026-10-09T00:00:00Z', FROM, null)).toBe(false)
    expect(isActivityWithinBadgeWindow('2020-01-01T00:00:00Z', null, UNTIL)).toBe(true)
    expect(isActivityWithinBadgeWindow('2026-10-21T00:00:00Z', null, UNTIL)).toBe(false)
  })

  it('시각을 해석할 수 없으면 기간 밖으로 본다', () => {
    expect(isActivityWithinBadgeWindow('not-a-date', null, null)).toBe(false)
    expect(isActivityWithinBadgeWindow('2026-10-15T00:00:00Z', 'broken', null)).toBe(false)
  })
})
