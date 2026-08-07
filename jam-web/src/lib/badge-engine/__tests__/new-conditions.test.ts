/**
 * badge-engine evaluateConditionDetailed — 신규 조건 패턴 유닛 테스트
 *
 * 테스트 범위 (액티비티배지 레시피 신규 배지 대응):
 *   - monthly_km 단독 (month 없이) — 월 누적 거리
 *   - time_range + weekly_count 복합 (이력 전반 독립 평가)
 *   - weekend_duration_hours — 주말 단일 활동 최대 시간
 *   - season + season_count — 계절 내 활동 횟수
 *
 * 실행: jest 또는 vitest (프레임워크 무관 — describe/it/expect 호환)
 */

import { evaluateConditionDetailed } from '../index'
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

// ── monthly_km 단독 (month 없이) ──────────────────────────────────────────
// 레시피: {"activity_type":"walking","monthly_km":50.0}
// month 없이 monthly_km만 있을 때, 어느 한 달의 누적 거리가 조건을 넘으면 pass.

describe('monthly_km (단독, month 없음)', () => {
  it('한 달 누적 거리가 조건 이상이면 pass', () => {
    const cond: BadgeCondition = { activity_type: 'walking', monthly_km: 50 }
    const acts = [
      makeActivity({ distanceKm: 30, startDate: '2026-07-05T09:00:00Z' }),
      makeActivity({ distanceKm: 25, startDate: '2026-07-20T09:00:00Z' }),
    ]
    // 2026-07 누적 55km ≥ 50
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('한 달 누적 거리가 조건 미만이면 fail', () => {
    const cond: BadgeCondition = { activity_type: 'walking', monthly_km: 50 }
    const acts = [
      makeActivity({ distanceKm: 20, startDate: '2026-07-05T09:00:00Z' }),
      makeActivity({ distanceKm: 20, startDate: '2026-07-20T09:00:00Z' }),
    ]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('월 누적 거리 부족')
  })

  it('여러 달에 걸쳐 있으면 각 달을 독립 집계 — 합산으로 조건 충족 불가', () => {
    const cond: BadgeCondition = { activity_type: 'walking', monthly_km: 50 }
    const acts = [
      makeActivity({ distanceKm: 30, startDate: '2026-06-15T09:00:00Z' }),
      makeActivity({ distanceKm: 30, startDate: '2026-07-15T09:00:00Z' }),
    ]
    // 6월 30km, 7월 30km — 어느 달도 50 미달 → fail
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(false)
  })

  it('한 달에 몰아서 하면 pass (월별 최대값 기준)', () => {
    const cond: BadgeCondition = { activity_type: 'walking', monthly_km: 50 }
    const acts = [
      makeActivity({ distanceKm: 10, startDate: '2026-06-15T09:00:00Z' }),
      makeActivity({ distanceKm: 30, startDate: '2026-07-10T09:00:00Z' }),
      makeActivity({ distanceKm: 30, startDate: '2026-07-25T09:00:00Z' }),
    ]
    // 7월 60km ≥ 50 → pass
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })
})

// ── time_range + weekly_count (엄격 평가) ──────────────────────────────────
// 레시피: {"activity_type":"walking","time_range":{"start":"05:00","end":"08:00"},"weekly_count":2}
// time_range가 weekly_count와 함께 쓰이면 "해당 시간대 활동만 주간 집계"하는 엄격 평가 적용.
//   - 같은 주에 05:00~08:00 사이 활동이 2회 이상이어야 pass
//   - 시간대 밖 활동은 weekly_count 집계에서 제외됨
// (BADGE_ENGINE_UNIFIED.md §2.3 — "time_range 동반 시 시간대 내 활동만 카운트 (엄격 평가)")

describe('time_range + weekly_count (엄격 평가)', () => {
  it('같은 주에 시간대 내 활동이 2회면 pass', () => {
    const cond: BadgeCondition = {
      activity_type: 'walking',
      time_range: { start: '05:00', end: '08:00' },
      weekly_count: 2,
    }
    // 2026-07-20(월) 06:00, 07-21(화) 07:00 — 같은 주, 모두 05:00~08:00 범위
    const acts = [
      makeActivity({ startDate: '2026-07-20T06:00:00Z', startDateLocal: '2026-07-20T06:00:00' }),
      makeActivity({ startDate: '2026-07-21T07:00:00Z', startDateLocal: '2026-07-21T07:00:00' }),
    ]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('같은 주 2회지만 모두 시간대 밖이면 fail (시간대 필터 후 집계 0회)', () => {
    const cond: BadgeCondition = {
      activity_type: 'walking',
      time_range: { start: '05:00', end: '08:00' },
      weekly_count: 2,
    }
    // 두 활동 모두 15:00~16:00 — 시간대 필터 후 집계 0회 → 주간 횟수 부족
    const acts = [
      makeActivity({ startDate: '2026-07-20T15:00:00Z', startDateLocal: '2026-07-20T15:00:00' }),
      makeActivity({ startDate: '2026-07-21T16:00:00Z', startDateLocal: '2026-07-21T16:00:00' }),
    ]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('주간 활동 횟수 부족')
  })

  it('시간대는 맞으나 같은 주 2회 미달이면 fail', () => {
    const cond: BadgeCondition = {
      activity_type: 'walking',
      time_range: { start: '05:00', end: '08:00' },
      weekly_count: 2,
    }
    // 서로 다른 주에 1회씩 (07-20 월, 07-28 다음주 화) — 새벽
    const acts = [
      makeActivity({ startDate: '2026-07-20T06:00:00Z', startDateLocal: '2026-07-20T06:00:00' }),
      makeActivity({ startDate: '2026-07-28T06:00:00Z', startDateLocal: '2026-07-28T06:00:00' }),
    ]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('주간 활동 횟수 부족')
  })
})

// ── weekend_duration_hours ────────────────────────────────────────────────
// 레시피: {"activity_type":"running","weekend_duration_hours":0.5}

describe('weekend_duration_hours', () => {
  it('주말 활동의 이동 시간이 조건 이상이면 pass', () => {
    const cond: BadgeCondition = { weekend_duration_hours: 0.5 }
    // 2026-07-18 = 토요일, 40분(0.66시간)
    const acts = [makeActivity({ startDate: '2026-07-18T09:00:00Z', movingTimeSec: 2400 })]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('평일 활동만 있으면 fail (주말 활동 없음)', () => {
    const cond: BadgeCondition = { weekend_duration_hours: 0.5 }
    // 2026-07-20 = 월요일
    const acts = [makeActivity({ startDate: '2026-07-20T09:00:00Z', movingTimeSec: 7200 })]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('주말 활동 시간 부족')
  })

  it('주말 활동이 있으나 시간이 부족하면 fail', () => {
    const cond: BadgeCondition = { weekend_duration_hours: 2 }
    // 2026-07-19 = 일요일, 30분
    const acts = [makeActivity({ startDate: '2026-07-19T09:00:00Z', movingTimeSec: 1800 })]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(false)
  })
})

// ── season + season_count ─────────────────────────────────────────────────
// 레시피: {"activity_type":"cycling","season":"summer","season_count":5}

describe('season + season_count', () => {
  it('해당 계절 활동 횟수가 조건 이상이면 pass', () => {
    const cond: BadgeCondition = { season: 'summer', season_count: 3 }
    const acts = [
      makeActivity({ startDate: '2026-06-10T09:00:00Z' }),
      makeActivity({ startDate: '2026-07-10T09:00:00Z' }),
      makeActivity({ startDate: '2026-08-10T09:00:00Z' }),
    ]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('다른 계절 활동은 카운트에서 제외 → fail', () => {
    const cond: BadgeCondition = { season: 'summer', season_count: 3 }
    const acts = [
      makeActivity({ startDate: '2026-07-10T09:00:00Z' }), // 여름
      makeActivity({ startDate: '2026-03-10T09:00:00Z' }), // 봄
      makeActivity({ startDate: '2026-11-10T09:00:00Z' }), // 가을
    ]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('여름')
  })

  it('season 없이 season_count만 있으면 미구현으로 fail', () => {
    const cond: BadgeCondition = { season_count: 3 }
    const acts = [makeActivity()]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('season 필드 없음')
  })
})
