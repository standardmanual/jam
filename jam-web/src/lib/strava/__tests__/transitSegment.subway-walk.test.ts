/**
 * 지하철을 탄 걷기 활동의 실제 Strava 기록으로 교통수단 구간 감지를 재현한다 (티켓 20261103_0900)
 *
 * 2026-11-03 프로덕션이 통과시킨 활동(Strava 20837068405)의 속도·시간 스트림을 그대로 넣어,
 * 구간 감지가 프로덕션이 저장한 값(거리 1.7070565km·움직인 시간 339초)을 다시 만들어 내는지 확인한다.
 * 이 시험이 지키는 것은 «지금 감지가 어디까지 걸러내는가»이고, 걸러내지 못하고 남는 구간(가속·감속 구간 등)을
 * 필터 보강으로 어떻게 처리할지는 후속 티켓이 이 자료로 새 시험을 더한다.
 *
 * 자료: `fixtures/subway-walk-20837068405.json` (좌표 스트림은 개인 위치 정보라 넣지 않았다)
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/transitSegment.subway-walk.test.ts
 */
import { describe, it, expect } from 'vitest'
import { detectAndExcludeTransitSegments, type TransitDetectionPolicy } from '../transitSegment'
import { judgeVehicleActivity } from '@/lib/abusing/vehicleFilter'
import { DEFAULT_POLICY } from '@/lib/abusing/policy'
import type { NormalizedActivity } from '@/types/strava'
import fixture from './fixtures/subway-walk-20837068405.json'

const POLICY: TransitDetectionPolicy = {
  transit_walk_max_speed_kmh: fixture.policyAtCapture.transit_walk_max_speed_kmh,
  transit_run_max_speed_kmh: fixture.policyAtCapture.transit_run_max_speed_kmh,
  transit_cycling_max_speed_kmh: fixture.policyAtCapture.transit_cycling_max_speed_kmh,
  transit_segment_min_duration_sec: fixture.policyAtCapture.transit_segment_min_duration_sec,
}

/** Strava 원본 요약을 동기화가 만드는 정규화 활동 모양으로 옮긴다 (`normalizeActivity`와 같은 단위 변환) */
function rawActivity(): NormalizedActivity {
  const s = fixture.summary
  return {
    stravaId: Number(s.id),
    name: s.name,
    // 동기화 때 Strava가 준 거리는 5270.0m였다(지금 Strava 값은 5270.5m). 프로덕션 저장값 1.7070565km에서
    // 뺀 구간 3.5629435km를 거꾸로 더하면 5.27km가 나온다. 재현이 저장값과 정확히 맞도록 그 값을 쓴다.
    distanceKm: 5.27,
    movingTimeSec: s.moving_time_sec,
    elevationGainM: s.elevation_gain_m,
    jamActivityType: 'walking',
    startDate: s.start_date_utc,
    averageSpeedKmh: s.avg_speed_ms * 3.6,
    // 프로덕션이 저장한 최고 속도(정수로 올림된 값)를 그대로 쓴다
    maxSpeedKmh: fixture.storedByProduction.row.normalized.maxSpeedKmh,
    startLatLng: null,
    endLatLng: null,
  }
}

const streams = {
  velocitySmooth: fixture.streams.velocity_smooth,
  time: fixture.streams.time,
}

describe('지하철 걷기 활동 (Strava 20837068405) 구간 감지 재현', () => {
  const stored = fixture.storedByProduction.row.normalized
  const result = detectAndExcludeTransitSegments(rawActivity(), streams, POLICY)

  it('자료가 온전하다: 스트림 길이가 같고 시간이 늘어나기만 한다', () => {
    expect(fixture.streams.time).toHaveLength(fixture.streams.velocity_smooth.length)
    expect(fixture.streams.distance).toHaveLength(fixture.streams.time.length)
    expect(fixture.streams.altitude).toHaveLength(fixture.streams.time.length)
    for (let i = 1; i < fixture.streams.time.length; i++) {
      expect(fixture.streams.time[i]).toBeGreaterThan(fixture.streams.time[i - 1])
    }
    expect(fixture.streams.distance.at(-1)).toBeCloseTo(fixture.summary.distance_m, 1)
  })

  it('원본은 걷기라고 부르기엔 너무 빠르다: 평균 32km/h, 최고 87km/h', () => {
    const raw = rawActivity()
    expect(raw.averageSpeedKmh).toBeGreaterThan(30)
    expect(raw.maxSpeedKmh).toBeGreaterThan(80)
  })

  it('프로덕션이 저장한 거리와 움직인 시간을 그대로 만든다', () => {
    expect(result.distanceKm).toBeCloseTo(stored.distanceKm, 6)
    expect(result.movingTimeSec).toBe(stored.movingTimeSec)
  })

  it('거리 3.56km·250초를 뺐다', () => {
    expect(result.transitExcludedSec).toBe(250)
    expect(rawActivity().distanceKm - result.distanceKm).toBeCloseTo(3.5629435, 6)
  })

  it('그런데 남은 구간도 18km/h 수준이라 여전히 걷기 속도가 아니다 (필터 보강이 풀 문제)', () => {
    expect(result.averageSpeedKmh).toBeGreaterThan(15)
    // 차량 속도 필터(평균 60km/h 초과)는 이 값을 걸러내지 못한다
    expect(result.averageSpeedKmh).toBeLessThan(fixture.policyAtCapture.vehicle_speed_filter_kmh)
  })

  // 티켓 20261103_1115: 새 판정이 이 자료를 거른다. 위 시험은 현재 감지 동작을 지키고, 아래는 보강한 판정을 지킨다.
  describe('새 판정(judgeVehicleActivity)', () => {
    const before = rawActivity()
    const policy = {
      vehicle_speed_filter_kmh: fixture.policyAtCapture.vehicle_speed_filter_kmh,
      transit_ratio_filter_pct: DEFAULT_POLICY.transit_ratio_filter_pct,
      walk_avg_max_speed_kmh: DEFAULT_POLICY.walk_avg_max_speed_kmh,
    }

    it('뺀 거리가 원래 거리의 약 68%라 교통수단 비율 규칙(50%)에 걸린다', () => {
      const ratio = (before.distanceKm - result.distanceKm) / before.distanceKm
      expect(ratio).toBeGreaterThan(0.67)
      expect(ratio).toBeLessThan(0.69)
      expect(judgeVehicleActivity({ before, after: result, policy })).toEqual({ filtered: true, reason: 'transit_ratio' })
    })

    it('비율 규칙이 없어도 남은 평균 18km/h가 걷기 상한(16km/h)에 걸린다', () => {
      const noRatio = { ...policy, transit_ratio_filter_pct: 100 }
      expect(judgeVehicleActivity({ before, after: result, policy: noRatio })).toEqual({ filtered: true, reason: 'walk_avg' })
    })

    it('시간 비율은 42%뿐이라 시간 기준이었다면 놓쳤을 활동이다', () => {
      expect(result.transitExcludedSec! / before.movingTimeSec).toBeLessThan(0.5)
    })
  })
})
