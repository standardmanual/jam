/**
 * metricValues.ts — 랭킹모드 지표 값 계산 유닛테스트 (티켓 20260911_1440)
 *
 * 특히 중요한 회귀 기준(티켓 "테스트 결정"): 활동 이력 기반 지표는 같은 활동 이력을 넣었을 때
 * 배지 화면 진행률 표시(`computeUserPeriodMetrics`, badgeProgress.ts)가 보여주는 값과 같은
 * 값이 나와야 한다 — 두 계산이 같은 활동을 두고 다른 「누적 거리」를 말하면 안 된다.
 */
import { describe, it, expect } from 'vitest'
import type { NormalizedActivity } from '@/types/strava'
import {
  RANKING_ACTIVITY_METRIC_KEYS,
  RANKING_SUPPORTED_CONDITION_FIELD_KEYS,
  computeActivityMetricValue,
  isRankingSupportedConditionField,
  isRankingActivityMetric,
  isRankingUsageMetric,
} from '../metricValues'
import { computeUserPeriodMetrics } from '@/lib/badge-engine/badgeProgress'

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
    ...overrides,
  }
}

describe('isRankingSupportedConditionField / isRankingActivityMetric / isRankingUsageMetric', () => {
  it('1차 지원 필드는 8종(누적 목표 5종 + 사용량 3종)이다', () => {
    expect(RANKING_SUPPORTED_CONDITION_FIELD_KEYS).toHaveLength(8)
  })
  it('누적 목표 필드는 activity metric으로, 사용량 필드는 usage metric으로 분류된다', () => {
    expect(isRankingActivityMetric('distance_km')).toBe(true)
    expect(isRankingUsageMetric('distance_km')).toBe(false)
    expect(isRankingUsageMetric('follower_count')).toBe(true)
    expect(isRankingActivityMetric('follower_count')).toBe(false)
  })
  it('Out of Scope 필드(한 번의 활동 기록·기간류 등)는 지원 목록에 없다', () => {
    for (const key of ['max_speed_kmh', 'single_distance_km', 'weekly_count', 'monthly_km', 'personal_record_break']) {
      expect(isRankingSupportedConditionField(key)).toBe(false)
    }
  })
})

describe('computeActivityMetricValue — 누적 목표 지표 5종', () => {
  const activities = [
    makeActivity({ stravaId: 1, distanceKm: 5, elevationGainM: 50, startDate: '2026-07-20T00:00:00Z', startDateLocal: '2026-07-20T09:00:00' }),
    makeActivity({ stravaId: 2, distanceKm: 3, elevationGainM: 20, startDate: '2026-07-21T00:00:00Z', startDateLocal: '2026-07-21T09:00:00' }),
    // 같은 날 2건 — active_days_count는 날짜 기준이라 중복으로 세지 않는다
    makeActivity({ stravaId: 3, distanceKm: 2, elevationGainM: 10, startDate: '2026-07-21T05:00:00Z', startDateLocal: '2026-07-21T14:00:00' }),
  ]

  it('distance_km — 누적 합계', () => {
    expect(computeActivityMetricValue('distance_km', activities)).toBe(10)
  })
  it('elevation_gain_m — 누적 합계', () => {
    expect(computeActivityMetricValue('elevation_gain_m', activities)).toBe(80)
  })
  it('total_count — 활동 건수', () => {
    expect(computeActivityMetricValue('total_count', activities)).toBe(3)
  })
  it('active_days_count — 고유 날짜 수(같은 날 여러 건은 1일로 센다)', () => {
    expect(computeActivityMetricValue('active_days_count', activities)).toBe(2)
  })
  it('streak_days — 연속 활동 일수(activityFilters.ts의 calcMaxStreak를 그대로 쓴다)', () => {
    expect(computeActivityMetricValue('streak_days', activities)).toBe(2)
  })
  it('활동 이력이 없으면 전부 0이다', () => {
    for (const key of RANKING_ACTIVITY_METRIC_KEYS) {
      expect(computeActivityMetricValue(key, [])).toBe(0)
    }
  })
})

describe('computeActivityMetricValue — computeUserPeriodMetrics(배지 진행률 표시)와의 회귀 일치', () => {
  // 전부 같은 종목(running)으로 구성 — computeUserPeriodMetrics는 activityType으로 필터링하지만
  // 랭킹 지표는 종목 스코프가 없어(이번 범위는 지표 하나만 선택) 전체를 대상으로 계산한다.
  // 종목을 하나로 통일하면 그 차이가 결과에 영향을 주지 않아 공정하게 비교할 수 있다.
  const activities = [
    makeActivity({ stravaId: 1, distanceKm: 12.3, elevationGainM: 210, startDate: '2026-08-01T00:00:00Z', startDateLocal: '2026-08-01T09:00:00' }),
    makeActivity({ stravaId: 2, distanceKm: 5.5, elevationGainM: 30, startDate: '2026-08-02T00:00:00Z', startDateLocal: '2026-08-02T09:00:00' }),
    makeActivity({ stravaId: 3, distanceKm: 8.1, elevationGainM: 90, startDate: '2026-08-04T00:00:00Z', startDateLocal: '2026-08-04T09:00:00' }),
  ]
  const periodMetrics = computeUserPeriodMetrics('running', activities, new Date('2026-09-01T00:00:00Z'))

  it('distance_km 값이 totalDistanceKm과 같다', () => {
    expect(computeActivityMetricValue('distance_km', activities)).toBeCloseTo(periodMetrics.totalDistanceKm, 10)
  })
  it('elevation_gain_m 값이 totalElevationGainM과 같다', () => {
    expect(computeActivityMetricValue('elevation_gain_m', activities)).toBeCloseTo(periodMetrics.totalElevationGainM, 10)
  })
  it('total_count 값이 totalCount와 같다', () => {
    expect(computeActivityMetricValue('total_count', activities)).toBe(periodMetrics.totalCount)
  })
  it('active_days_count 값이 activeDaysCount와 같다', () => {
    expect(computeActivityMetricValue('active_days_count', activities)).toBe(periodMetrics.activeDaysCount)
  })
  it('streak_days 값이 streakDays와 같다', () => {
    expect(computeActivityMetricValue('streak_days', activities)).toBe(periodMetrics.streakDays)
  })
})
