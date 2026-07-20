/**
 * drop-engine — 드랍 가능 여부 판정 유닛 테스트
 *
 * 드랍엔진은 활동 1건(또는 이번 싱크 배치)만으로 조건을 평가한다.
 * 누적/기간 조건(monthly_km, season_count, weekly_count, streak_days, total_count)은
 * 단일 활동으로 평가 불가 → 해당 배지는 드랍 대상에서 제외(옵션 A).
 * 그 외 단일 활동으로 평가 가능한 조건은 checkCondition 결과에 따른다.
 *
 * 실행: jest 또는 vitest (프레임워크 무관 — describe/it/expect 호환)
 */

import { isDroppableForActivity, hasCumulativeCondition } from '../index'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeCondition } from '@/types/database'

function makeActivity(overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return {
    stravaId: 1,
    name: 'Test Activity',
    distanceKm: 10,
    movingTimeSec: 3600,
    elevationGainM: 100,
    jamActivityType: 'walking',
    startDate: '2026-07-20T05:30:00Z',
    startDateLocal: '2026-07-20T05:30:00',
    averageSpeedKmh: 5,
    startLatLng: null,
    endLatLng: null,
    weatherTempC: null,
    ...overrides,
  }
}

// ── 누적/기간 조건 → 드랍 불가 (옵션 A) ────────────────────────────────────

describe('누적/기간 조건은 드랍 대상에서 제외', () => {
  it('monthly_km 조건 → 드랍 불가 (pass:false)', () => {
    const cond: BadgeCondition = { activity_type: 'walking', monthly_km: 50 }
    const acts = [makeActivity({ distanceKm: 60 })] // 단일 활동이 커도 드랍 불가
    expect(isDroppableForActivity(cond, acts)).toBe(false)
  })

  it('season + season_count 조건 → 드랍 불가 (pass:false)', () => {
    const cond: BadgeCondition = { activity_type: 'cycling', season: 'summer', season_count: 5 }
    const acts = [makeActivity({ startDate: '2026-07-10T09:00:00Z' })]
    expect(isDroppableForActivity(cond, acts)).toBe(false)
  })

  it('weekly_count 조건 → 드랍 불가', () => {
    const cond: BadgeCondition = { activity_type: 'walking', weekly_count: 3 }
    expect(isDroppableForActivity(cond, [makeActivity()])).toBe(false)
  })

  it('streak_days 조건 → 드랍 불가', () => {
    const cond: BadgeCondition = { streak_days: 7 }
    expect(isDroppableForActivity(cond, [makeActivity()])).toBe(false)
  })

  it('total_count 조건 → 드랍 불가', () => {
    const cond: BadgeCondition = { total_count: 10 }
    expect(isDroppableForActivity(cond, [makeActivity()])).toBe(false)
  })
})

// ── 단일 활동 평가 가능 조건 → checkCondition 결과에 따름 ──────────────────

describe('단일 활동 평가 가능 조건', () => {
  it('조건 없음 → 항상 드랍 가능', () => {
    expect(isDroppableForActivity(null, [makeActivity()])).toBe(true)
    expect(isDroppableForActivity({}, [makeActivity()])).toBe(true)
  })

  it('distance_km 충족 → 드랍 가능', () => {
    const cond: BadgeCondition = { distance_km: 5 }
    expect(isDroppableForActivity(cond, [makeActivity({ distanceKm: 10 })])).toBe(true)
  })

  it('distance_km 미달 → 드랍 불가', () => {
    const cond: BadgeCondition = { distance_km: 50 }
    expect(isDroppableForActivity(cond, [makeActivity({ distanceKm: 10 })])).toBe(false)
  })

  it('duration_minutes 충족 → 드랍 가능', () => {
    const cond: BadgeCondition = { duration_minutes: 30 }
    // 3600초 = 60분 ≥ 30
    expect(isDroppableForActivity(cond, [makeActivity()])).toBe(true)
  })

  it('time_range 충족 → 드랍 가능', () => {
    const cond: BadgeCondition = { time_range: { start: '04:00', end: '07:00' } }
    const acts = [makeActivity({ startDateLocal: '2026-07-20T05:30:00' })]
    expect(isDroppableForActivity(cond, acts)).toBe(true)
  })
})

// ── hasCumulativeCondition 단위 검증 ──────────────────────────────────────

describe('hasCumulativeCondition', () => {
  it('누적 필드가 있으면 true', () => {
    expect(hasCumulativeCondition({ monthly_km: 50 })).toBe(true)
    expect(hasCumulativeCondition({ season_count: 5, season: 'summer' })).toBe(true)
    expect(hasCumulativeCondition({ weekly_count: 2 })).toBe(true)
    expect(hasCumulativeCondition({ streak_days: 3 })).toBe(true)
    expect(hasCumulativeCondition({ total_count: 10 })).toBe(true)
  })

  it('단일 활동 조건만 있으면 false', () => {
    expect(hasCumulativeCondition({ distance_km: 5 })).toBe(false)
    expect(hasCumulativeCondition({ duration_minutes: 30 })).toBe(false)
    expect(hasCumulativeCondition({ weekend_duration_hours: 0.5 })).toBe(false)
    expect(hasCumulativeCondition({ time_range: { start: '05:00', end: '08:00' } })).toBe(false)
    expect(hasCumulativeCondition({})).toBe(false)
  })
})
