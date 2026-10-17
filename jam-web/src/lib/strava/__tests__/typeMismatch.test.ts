/**
 * strava/typeMismatch — 종목과 움직임 불일치 판정 단위 시험 (티켓 20261017_1421 2회, 운영 로직 16.2절)
 *
 * 러닝 평균 6km/h 미만, 자전거 평균 10km/h 미만은 걷기로 바꾸고 트레일러닝·등산·걷기는 판정하지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/typeMismatch.test.ts
 */
import { describe, it, expect } from 'vitest'
import { applyTypeMismatch, type TypeMismatchPolicy } from '../typeMismatch'
import type { NormalizedActivity } from '@/types/strava'

const POLICY: TypeMismatchPolicy = { mismatch_run_min_speed_kmh: 6, mismatch_cycling_min_speed_kmh: 10 }

function activity(jamActivityType: string | null, averageSpeedKmh: number): NormalizedActivity {
  return {
    stravaId: 1,
    name: 'test',
    distanceKm: 3,
    movingTimeSec: 1800,
    elevationGainM: 0,
    jamActivityType,
    startDate: '2026-10-01T00:00:00Z',
    averageSpeedKmh,
    startLatLng: null,
    endLatLng: null,
  }
}

describe('applyTypeMismatch', () => {
  it('러닝 평균 5km/h는 걷기로 바꾸고 원래 종목을 알려 준다', () => {
    const result = applyTypeMismatch(activity('running', 5), POLICY)
    expect(result.activity.jamActivityType).toBe('walking')
    expect(result.changedFrom).toBe('running')
  })

  it('자전거 평균 9km/h는 걷기로 바꾸고 원래 종목을 알려 준다', () => {
    const result = applyTypeMismatch(activity('cycling', 9), POLICY)
    expect(result.activity.jamActivityType).toBe('walking')
    expect(result.changedFrom).toBe('cycling')
  })

  it('바꿔도 거리·시간·평균 속도 같은 다른 값은 그대로다', () => {
    const original = activity('running', 5)
    const result = applyTypeMismatch(original, POLICY)
    expect({ ...result.activity, jamActivityType: 'running' }).toEqual(original)
  })

  it('기준 속도와 같으면 바꾸지 않는다(느린 경우만 바꾼다)', () => {
    const run = activity('running', 6)
    const ride = activity('cycling', 10)
    expect(applyTypeMismatch(run, POLICY)).toEqual({ activity: run, changedFrom: null })
    expect(applyTypeMismatch(ride, POLICY)).toEqual({ activity: ride, changedFrom: null })
    expect(applyTypeMismatch(run, POLICY).activity).toBe(run)
  })

  it('트레일러닝·등산·걷기는 아무리 느려도 판정하지 않는다', () => {
    for (const type of ['trail_running', 'hiking', 'walking']) {
      const a = activity(type, 1)
      const result = applyTypeMismatch(a, POLICY)
      expect(result.activity).toBe(a)
      expect(result.changedFrom).toBeNull()
    }
  })

  it('종목 값이 없으면 판정하지 않는다', () => {
    const a = activity(null, 1)
    expect(applyTypeMismatch(a, POLICY).activity).toBe(a)
  })

  it('정책에서 바꾼 기준값이 판정에 반영된다', () => {
    const run = activity('running', 7)
    expect(applyTypeMismatch(run, POLICY).changedFrom).toBeNull()
    expect(applyTypeMismatch(run, { ...POLICY, mismatch_run_min_speed_kmh: 8 }).changedFrom).toBe('running')

    const ride = activity('cycling', 11)
    expect(applyTypeMismatch(ride, POLICY).changedFrom).toBeNull()
    expect(applyTypeMismatch(ride, { ...POLICY, mismatch_cycling_min_speed_kmh: 12 }).changedFrom).toBe('cycling')
  })

  it('정책값이 비정상(0·음수·NaN)이면 바꾸지 않는다', () => {
    const run = activity('running', 1)
    for (const bad of [0, -1, Number.NaN]) {
      expect(applyTypeMismatch(run, { ...POLICY, mismatch_run_min_speed_kmh: bad }).activity).toBe(run)
    }
  })
})
