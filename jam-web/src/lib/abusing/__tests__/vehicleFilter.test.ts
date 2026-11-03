/**
 * judgeVehicleActivity 시험 (티켓 20261103_1115) — 평균 속도 필터·교통수단 비율·걷기·등산 평균 상한
 * 실행: cd jam-web && npx vitest run src/lib/abusing/__tests__/vehicleFilter.test.ts
 */
import { describe, it, expect } from 'vitest'
import { judgeVehicleActivity, type VehicleFilterPolicy } from '../vehicleFilter'
import { DEFAULT_POLICY } from '../policy'
import type { NormalizedActivity } from '@/types/strava'

const POLICY: VehicleFilterPolicy = {
  vehicle_speed_filter_kmh: DEFAULT_POLICY.vehicle_speed_filter_kmh,
  transit_ratio_filter_pct: DEFAULT_POLICY.transit_ratio_filter_pct,
  walk_avg_max_speed_kmh: DEFAULT_POLICY.walk_avg_max_speed_kmh,
}

function activity(overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return {
    stravaId: 1,
    name: '시험 활동',
    distanceKm: 5,
    movingTimeSec: 3600,
    elevationGainM: 0,
    jamActivityType: 'walking',
    startDate: '2026-11-03T01:00:00Z',
    averageSpeedKmh: 5,
    startLatLng: null,
    endLatLng: null,
    ...overrides,
  }
}

const judge = (before: Partial<NormalizedActivity>, after: Partial<NormalizedActivity>, policy: VehicleFilterPolicy = POLICY) =>
  judgeVehicleActivity({ before: activity(before), after: activity(after), policy })

describe('judgeVehicleActivity', () => {
  it('기본값은 비율 50%, 걷기 상한 16km/h다', () => {
    expect(DEFAULT_POLICY.transit_ratio_filter_pct).toBe(50)
    expect(DEFAULT_POLICY.walk_avg_max_speed_kmh).toBe(16)
  })

  it('평범한 걷기(5km/h, 구간 없음)는 통과한다', () => {
    expect(judge({ distanceKm: 5 }, { distanceKm: 5, averageSpeedKmh: 5 })).toEqual({ filtered: false, reason: null })
  })

  it('평균 속도 필터(60km/h)가 먼저 본다 — 러닝도 걸린다', () => {
    expect(judge({ jamActivityType: 'running' }, { jamActivityType: 'running', averageSpeedKmh: 60.1 })).toEqual({
      filtered: true,
      reason: 'speed',
    })
    expect(judge({ jamActivityType: 'running' }, { jamActivityType: 'running', averageSpeedKmh: 60 }).filtered).toBe(false)
  })

  describe('교통수단 비율', () => {
    it('뺀 거리가 49.9%면 통과하고 50%면 걸린다', () => {
      expect(judge({ distanceKm: 1000 }, { distanceKm: 501, averageSpeedKmh: 5 }).filtered).toBe(false)
      expect(judge({ distanceKm: 1000 }, { distanceKm: 500, averageSpeedKmh: 5 })).toEqual({ filtered: true, reason: 'transit_ratio' })
      expect(judge({ distanceKm: 10 }, { distanceKm: 5, averageSpeedKmh: 5 }).reason).toBe('transit_ratio')
    })

    it('다섯 종목 모두에 적용된다', () => {
      for (const type of ['walking', 'hiking', 'running', 'trail_running', 'cycling']) {
        const out = judge({ jamActivityType: type, distanceKm: 10 }, { jamActivityType: type, distanceKm: 4, averageSpeedKmh: 5 })
        expect(out, type).toEqual({ filtered: true, reason: 'transit_ratio' })
      }
    })

    it('before 거리가 0이면 비율 규칙은 건너뛴다', () => {
      expect(judge({ distanceKm: 0 }, { distanceKm: 0, averageSpeedKmh: 5 })).toEqual({ filtered: false, reason: null })
    })

    it('기준(%)은 정책 값을 따른다', () => {
      const strict = { ...POLICY, transit_ratio_filter_pct: 20 }
      expect(judge({ distanceKm: 10 }, { distanceKm: 8, averageSpeedKmh: 5 }, strict).reason).toBe('transit_ratio')
      expect(judge({ distanceKm: 10 }, { distanceKm: 8.1, averageSpeedKmh: 5 }, strict).filtered).toBe(false)
    })

    it('정책 값이 비정상(0 이하)이면 기본값 50%로 판정한다', () => {
      const broken = { ...POLICY, transit_ratio_filter_pct: 0 }
      expect(judge({ distanceKm: 10 }, { distanceKm: 9, averageSpeedKmh: 5 }, broken).filtered).toBe(false)
      expect(judge({ distanceKm: 10 }, { distanceKm: 5, averageSpeedKmh: 5 }, broken).reason).toBe('transit_ratio')
    })
  })

  describe('걷기·등산 평균 속도 상한', () => {
    it('16km/h는 통과하고 16.01km/h는 걸린다', () => {
      for (const type of ['walking', 'hiking']) {
        expect(judge({ jamActivityType: type }, { jamActivityType: type, averageSpeedKmh: 16 }).filtered, `${type} 16`).toBe(false)
        expect(judge({ jamActivityType: type }, { jamActivityType: type, averageSpeedKmh: 16.01 }), `${type} 16.01`).toEqual({
          filtered: true,
          reason: 'walk_avg',
        })
      }
    })

    it('러닝·트레일 러닝·자전거에는 걷기 상한이 없다', () => {
      for (const type of ['running', 'trail_running', 'cycling']) {
        expect(judge({ jamActivityType: type }, { jamActivityType: type, averageSpeedKmh: 25 }).filtered, type).toBe(false)
      }
    })

    it('정책 값을 따르고, 비정상(0 이하)이면 기본값 16으로 판정한다', () => {
      expect(judge({}, { averageSpeedKmh: 10 }, { ...POLICY, walk_avg_max_speed_kmh: 8 }).reason).toBe('walk_avg')
      expect(judge({}, { averageSpeedKmh: 10 }, { ...POLICY, walk_avg_max_speed_kmh: 0 }).filtered).toBe(false)
      expect(judge({}, { averageSpeedKmh: 17 }, { ...POLICY, walk_avg_max_speed_kmh: 0 }).reason).toBe('walk_avg')
    })

    it('종목 불일치로 걷기가 된 활동(after가 walking)에도 걸린다', () => {
      // 러닝으로 기록했지만 감지·보정 뒤 걷기가 된 활동: before는 running, after는 walking
      expect(judge({ jamActivityType: 'running' }, { jamActivityType: 'walking', averageSpeedKmh: 18 }).reason).toBe('walk_avg')
    })

    it('종목이 없으면(null) 걷기 상한은 보지 않는다', () => {
      expect(judge({ jamActivityType: null }, { jamActivityType: null, averageSpeedKmh: 30 }).filtered).toBe(false)
    })
  })

  it('판정 순서: 평균 속도 → 교통수단 비율 → 걷기 상한', () => {
    expect(judge({ distanceKm: 10 }, { distanceKm: 4, averageSpeedKmh: 70 }).reason).toBe('speed')
    expect(judge({ distanceKm: 10 }, { distanceKm: 4, averageSpeedKmh: 20 }).reason).toBe('transit_ratio')
    expect(judge({ distanceKm: 10 }, { distanceKm: 9, averageSpeedKmh: 20 }).reason).toBe('walk_avg')
  })
})
