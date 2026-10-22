/**
 * drop-engine/cumulativeConditionFields — 아이템 배지에 걸 수 없는 누적·기간 조건 판정
 *
 * 누적/기간 조건(monthly_km, season_count, weekly_count, streak_days, total_count,
 * distance_km, elevation_gain_m)은 활동 1건만으로 평가할 수 없다. distance_km/elevation_gain_m은
 * 2026-08-31(티켓 20260831_2100)부터 badge-engine 기본 평가가 "전체 이력 누적 합계"로 바뀌면서
 * 이 목록에 합류했다.
 * 티켓 20261022_0938: 옛 드랍 엔진(`isDroppableForActivity`)과 그 시험을 지우고, 남는 모듈의 판정 시험만 둔다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/drop-engine/__tests__/cumulativeConditionFields.test.ts
 */

import { hasCumulativeCondition } from '../cumulativeConditionFields'

// ── hasCumulativeCondition 단위 검증 ──────────────────────────────────────

describe('hasCumulativeCondition', () => {
  it('누적 필드가 있으면 true', () => {
    expect(hasCumulativeCondition({ monthly_km: 50 })).toBe(true)
    expect(hasCumulativeCondition({ season_count: 5, season: 'summer' })).toBe(true)
    expect(hasCumulativeCondition({ weekly_count: 2 })).toBe(true)
    expect(hasCumulativeCondition({ streak_days: 3 })).toBe(true)
    expect(hasCumulativeCondition({ total_count: 10 })).toBe(true)
    // 2026-08-31(티켓 20260831_2100) — badge-engine 기본 평가가 누적 합계로 전환되며 합류
    expect(hasCumulativeCondition({ distance_km: 5 })).toBe(true)
    expect(hasCumulativeCondition({ elevation_gain_m: 100 })).toBe(true)
  })

  it('단일 활동 조건만 있으면 false', () => {
    expect(hasCumulativeCondition({ duration_minutes: 30 })).toBe(false)
    expect(hasCumulativeCondition({ weekend_duration_hours: 0.5 })).toBe(false)
    expect(hasCumulativeCondition({ time_range: { start: '05:00', end: '08:00' } })).toBe(false)
    expect(hasCumulativeCondition({})).toBe(false)
  })
})
