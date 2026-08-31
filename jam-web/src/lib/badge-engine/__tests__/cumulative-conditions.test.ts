/**
 * badge-engine — distance_km/elevation_gain_m 누적 평가 복원 + 카테고리 2 복합배지 독립 평가
 * 회귀 테스트 (티켓 20260831_2100)
 *
 * 배경: 커밋 27163030(2026-07-31)이 "서로 다른 활동의 필드를 조합해 잘못 통과되던 버그"를
 * 고치면서 단독 distance_km/elevation_gain_m 필드(원래 누적 합계여야 함)와 카테고리 2
 * 복합배지(R7/C7/H7/T7, 원래 필드별 이력 전반 독립 평가여야 함)까지 "한 활동 동시 충족"으로
 * 과잉 일반화했다. 이 테스트는 문서(ACTIVITY_BADGES.md) 기준으로 복원된 동작과, 유일한
 * 예외(T1 '야생의 첫발' — same_activity:true)가 회귀하지 않는지를 지킨다.
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
    jamActivityType: 'running',
    startDate: '2026-07-20T05:30:00Z',
    startDateLocal: '2026-07-20T05:30:00',
    averageSpeedKmh: 10,
    startLatLng: null,
    endLatLng: null,
    weatherTempC: null,
    ...overrides,
  }
}

// ── distance_km / elevation_gain_m — 기본은 누적 합계 ─────────────────────

describe('distance_km — 단독 조건은 누적 합계로 평가된다', () => {
  it('어느 활동도 단독으로는 조건 미달이어도 합산이 조건 이상이면 pass', () => {
    const cond: BadgeCondition = { activity_type: 'walking', distance_km: 10 }
    const acts = [
      makeActivity({ jamActivityType: 'walking', distanceKm: 4, movingTimeSec: 1800, averageSpeedKmh: 4 }),
      makeActivity({ jamActivityType: 'walking', distanceKm: 4, movingTimeSec: 1800, averageSpeedKmh: 4 }),
      makeActivity({ jamActivityType: 'walking', distanceKm: 4, movingTimeSec: 1800, averageSpeedKmh: 4 }),
    ]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(true)
    expect(result.actual).toContain('누적거리')
  })

  it('합산도 조건 미달이면 fail', () => {
    const cond: BadgeCondition = { activity_type: 'walking', distance_km: 100 }
    const acts = [
      makeActivity({ jamActivityType: 'walking', distanceKm: 4, movingTimeSec: 1800, averageSpeedKmh: 4 }),
      makeActivity({ jamActivityType: 'walking', distanceKm: 4, movingTimeSec: 1800, averageSpeedKmh: 4 }),
    ]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('누적 거리 부족')
  })
})

describe('elevation_gain_m — 단독 조건은 누적 합계로 평가된다', () => {
  it('여러 활동의 고도 합산이 조건 이상이면 pass', () => {
    const cond: BadgeCondition = { activity_type: 'hiking', elevation_gain_m: 900 }
    const acts = [
      makeActivity({ jamActivityType: 'hiking', elevationGainM: 300 }),
      makeActivity({ jamActivityType: 'hiking', elevationGainM: 300 }),
      makeActivity({ jamActivityType: 'hiking', elevationGainM: 300 }),
    ]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(true)
  })

  it('합산도 미달이면 fail', () => {
    const cond: BadgeCondition = { activity_type: 'hiking', elevation_gain_m: 5000 }
    const acts = [makeActivity({ jamActivityType: 'hiking', elevationGainM: 300 })]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('누적 고도 상승 부족')
  })
})

// ── same_activity:true — T1 '야생의 첫발' 예외 (한 활동 동시 충족) ─────────

describe('same_activity:true — 한 활동이 두 필드를 함께 만족해야 한다 (T1 회귀 방지)', () => {
  const cond: BadgeCondition = {
    activity_type: 'trail_running',
    distance_km: 15,
    elevation_gain_m: 300,
    same_activity: true,
  }

  it('한 활동이 거리·고도를 동시에 만족하면 pass', () => {
    const acts = [makeActivity({ jamActivityType: 'trail_running', distanceKm: 20, elevationGainM: 350 })]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('서로 다른 활동에서 각각 한 필드씩만 만족하면 fail (누적/독립 합산 금지)', () => {
    const acts = [
      // 거리는 충분하지만 고도가 부족한 활동
      makeActivity({ jamActivityType: 'trail_running', distanceKm: 20, elevationGainM: 50 }),
      // 고도는 충분하지만 거리가 부족한 활동
      makeActivity({ jamActivityType: 'trail_running', distanceKm: 2, elevationGainM: 400 }),
    ]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
  })

  it('same_activity 플래그가 없으면(기본값) 같은 두 활동이 누적으로 통과한다 — 대조군', () => {
    const cumulativeCond: BadgeCondition = { activity_type: 'trail_running', distance_km: 15, elevation_gain_m: 300 }
    const acts = [
      makeActivity({ jamActivityType: 'trail_running', distanceKm: 20, elevationGainM: 50 }),
      makeActivity({ jamActivityType: 'trail_running', distanceKm: 2, elevationGainM: 400 }),
    ]
    // 누적거리 22km ≥ 15, 누적고도 450m ≥ 300 → pass (same_activity 없을 때만)
    expect(evaluateConditionDetailed(cumulativeCond, acts).pass).toBe(true)
  })
})

// ── same_activity:true — T23 '그냥 나갔다 옴' 예외 (단일 필드도 단일 활동 평가, 티켓 20260831_2100 후속) ─

describe('same_activity:true — 단일 필드(distance_km)도 단일 활동 충족만 인정한다 (T23 회귀 방지)', () => {
  const cond: BadgeCondition = {
    activity_type: 'walking',
    distance_km: 0.6,
    same_activity: true,
  }

  it('한 활동이 단독으로 0.6km를 만족하면 pass', () => {
    const acts = [makeActivity({ jamActivityType: 'walking', distanceKm: 0.6, movingTimeSec: 600, averageSpeedKmh: 3.6 })]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  // 참고: 걷기는 축1 게이트(WALKING_GATE_MIN_DISTANCE_KM=0.5km) 미만 활동을 조건 평가
  // 대상에서 아예 제외한다. 0.6km 임계값이 이 게이트에 근접해(티켓 A-3) 0.3km짜리 활동
  // 2건은 게이트 자체에서 걸러져 same_activity 로직을 검증하지 못한다. 게이트는 통과하되
  // (0.5km 이상) 개별로는 0.6km에 못 미치는 0.5km 활동 2건으로 same_activity 로직 자체를
  // 격리해 검증한다.
  it('여러 활동에 걸친 누적 0.6km(0.5km 두 번, 개별로는 게이트 통과·조건 미달)로는 fail (same_activity가 단일 필드에도 적용됨)', () => {
    const acts = [
      makeActivity({ jamActivityType: 'walking', distanceKm: 0.5, movingTimeSec: 600, averageSpeedKmh: 3.0 }),
      makeActivity({ jamActivityType: 'walking', distanceKm: 0.5, movingTimeSec: 600, averageSpeedKmh: 3.0 }),
    ]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
  })

  it('same_activity 플래그가 없으면(기본값) 같은 두 활동이 누적으로 통과한다 — 대조군', () => {
    const cumulativeCond: BadgeCondition = { activity_type: 'walking', distance_km: 0.6 }
    const acts = [
      makeActivity({ jamActivityType: 'walking', distanceKm: 0.5, movingTimeSec: 600, averageSpeedKmh: 3.0 }),
      makeActivity({ jamActivityType: 'walking', distanceKm: 0.5, movingTimeSec: 600, averageSpeedKmh: 3.0 }),
    ]
    // 누적거리 1.0km ≥ 0.6 → pass (same_activity 없을 때만)
    expect(evaluateConditionDetailed(cumulativeCond, acts).pass).toBe(true)
  })
})

// ── 카테고리 2 복합배지 — 이력 전반 독립 평가 (R7 스타일) ─────────────────

describe('카테고리 2 복합배지 — 필드별 이력 전반 독립 평가 (다른 세션 가능)', () => {
  it('R7 스피드 엔듀러 스타일 — 빠른 활동과 긴 활동이 달라도 pass', () => {
    const cond: BadgeCondition = {
      activity_type: 'running',
      max_pace_sec_per_km: 330, // 5:30/km 이하
      duration_minutes: 60,
    }
    const acts = [
      // 빠르지만 짧은 활동 (페이스만 충족)
      makeActivity({ jamActivityType: 'running', averageSpeedKmh: 12, movingTimeSec: 20 * 60 }),
      // 느리지만 긴 활동 (시간만 충족)
      makeActivity({ jamActivityType: 'running', averageSpeedKmh: 6, movingTimeSec: 90 * 60 }),
    ]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(true)
  })

  it('어느 필드도 만족하는 활동이 없으면 fail', () => {
    const cond: BadgeCondition = {
      activity_type: 'running',
      max_pace_sec_per_km: 330,
      duration_minutes: 60,
    }
    const acts = [makeActivity({ jamActivityType: 'running', averageSpeedKmh: 6, movingTimeSec: 20 * 60 })]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
  })

  it('C7 산악 라이더 스타일 — 속도(단일 최고)와 고도(누적)가 다른 세션이어도 pass', () => {
    const cond: BadgeCondition = {
      activity_type: 'cycling',
      min_speed_kmh: 20,
      elevation_gain_m: 1000,
    }
    const acts = [
      // 빠르지만 고도 없는 활동
      makeActivity({ jamActivityType: 'cycling', averageSpeedKmh: 22, elevationGainM: 0 }),
      // 느리지만 고도가 누적되는 활동들
      makeActivity({ jamActivityType: 'cycling', averageSpeedKmh: 10, elevationGainM: 600 }),
      makeActivity({ jamActivityType: 'cycling', averageSpeedKmh: 10, elevationGainM: 500 }),
    ]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(true)
  })
})
