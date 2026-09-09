/**
 * strava/transitSegment — 교통수단 구간 감지·재산정 단위 테스트 (티켓 20260909_1012)
 *
 * 배경: 걷기 활동 중간에 지하철·버스 구간이 섞여도 전체 평균속도(`averageSpeedKmh`)만으로는
 * 걸러지지 않는다. `maxSpeedKmh`가 활동 타입별 임계값을 넘는 활동에 한해, `velocity_smooth`
 * 스트림에서 임계값을 30초 이상 연속으로 초과하는 구간을 찾아 거리·시간을 제외하고 재산정한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/transitSegment.test.ts
 */
import { describe, it, expect } from 'vitest'
import { detectAndExcludeTransitSegments, type TransitDetectionPolicy } from '../transitSegment'
import type { NormalizedActivity } from '@/types/strava'

const POLICY: TransitDetectionPolicy = {
  transit_walk_max_speed_kmh: 20,
  transit_run_max_speed_kmh: 27,
  transit_cycling_max_speed_kmh: 55,
  transit_segment_min_duration_sec: 30,
}

/** km/h → m/s */
const kmhToMps = (kmh: number) => kmh / 3.6

function baseActivity(overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return {
    stravaId: 1,
    name: 'Morning Walk',
    distanceKm: 2.5,
    movingTimeSec: 1800, // 30분
    elevationGainM: 5,
    jamActivityType: 'walking',
    startDate: '2026-09-08T00:00:00Z',
    averageSpeedKmh: 7.0, // 2.5km / (1800/3600)h = 5km/h... 값은 테스트 취지상 임의
    startLatLng: null,
    endLatLng: null,
    ...overrides,
  }
}

/**
 * 균일한 dt(초)로 time·velocity_smooth 스트림을 만든다.
 * @param speedsKmh 각 구간의 대표 속도(km/h) — 포인트 개수는 speedsKmh.length + 1개
 * @param dtSec 포인트 사이 간격(초)
 */
function makeUniformStreams(speedsKmh: number[], dtSec: number) {
  const velocitySmooth: number[] = [kmhToMps(speedsKmh[0])]
  const time: number[] = [0]
  for (let i = 0; i < speedsKmh.length; i++) {
    velocitySmooth.push(kmhToMps(speedsKmh[i]))
    time.push(time[time.length - 1] + dtSec)
  }
  return { velocitySmooth, time }
}

describe('detectAndExcludeTransitSegments', () => {
  it('임계값을 30초 이상 연속 초과하는 구간의 거리·시간을 제외한다', () => {
    // 걷기 임계값 20km/h — 40km/h로 90초(4개 포인트 × 3구간 × 30초 dt) 지속되는 지하철 구간
    const { velocitySmooth, time } = makeUniformStreams([40, 40, 40], 30)
    const activity = baseActivity({
      distanceKm: 2.5,
      movingTimeSec: 1800,
      maxSpeedKmh: 40,
    })

    const result = detectAndExcludeTransitSegments(
      activity,
      { velocitySmooth, time },
      POLICY
    )

    // 40km/h로 90초 이동한 거리 = 40 × (90/3600) = 1.0km(속도가 일정하므로 정확히 떨어진다)
    expect(result.distanceKm).toBeCloseTo(2.5 - 1.0, 5)
    expect(result.movingTimeSec).toBe(1800 - 90)
    expect(result.averageSpeedKmh).toBeCloseTo(result.distanceKm / ((1800 - 90) / 3600), 5)
  })

  it('구간 전체가 임계값 이하면 원본을 그대로 돌려준다', () => {
    const { velocitySmooth, time } = makeUniformStreams([10, 12, 8], 30)
    const activity = baseActivity({ maxSpeedKmh: 12 }) // 임계값(20) 이하 — 스트림도 볼 필요 없음

    const result = detectAndExcludeTransitSegments(activity, { velocitySmooth, time }, POLICY)

    expect(result).toBe(activity) // 참조 동일 — 재산정 자체가 일어나지 않음
  })

  it('임계값을 초과해도 지속시간이 30초 미만이면 재산정하지 않는다', () => {
    // 40km/h로 단 10초만 지속 — 최소 지속시간(30초) 미달
    const { velocitySmooth, time } = makeUniformStreams([40], 10)
    const activity = baseActivity({ maxSpeedKmh: 40 })

    const result = detectAndExcludeTransitSegments(activity, { velocitySmooth, time }, POLICY)

    expect(result.distanceKm).toBe(activity.distanceKm)
    expect(result.movingTimeSec).toBe(activity.movingTimeSec)
  })

  it('스트림이 없으면(null) fail-open — 원본 그대로 돌려준다', () => {
    const activity = baseActivity({ maxSpeedKmh: 40 })

    const result = detectAndExcludeTransitSegments(activity, null, POLICY)

    expect(result).toBe(activity)
  })

  it('velocitySmooth·time 중 하나만 없어도 fail-open으로 원본을 돌려준다', () => {
    const { velocitySmooth } = makeUniformStreams([40, 40], 30)
    const activity = baseActivity({ maxSpeedKmh: 40 })

    const result = detectAndExcludeTransitSegments(
      activity,
      { velocitySmooth, time: null },
      POLICY
    )

    expect(result).toBe(activity)
  })

  it('걷기·러닝·자전거가 아닌 활동 타입은 대상이 아니다 (예: hiking)', () => {
    const { velocitySmooth, time } = makeUniformStreams([40, 40, 40], 30)
    const activity = baseActivity({ jamActivityType: 'hiking', maxSpeedKmh: 40 })

    const result = detectAndExcludeTransitSegments(activity, { velocitySmooth, time }, POLICY)

    expect(result).toBe(activity)
  })

  it('maxSpeedKmh가 없는 활동은 스트림을 보지 않고 원본을 돌려준다', () => {
    const { velocitySmooth, time } = makeUniformStreams([40, 40, 40], 30)
    const activity = baseActivity() // maxSpeedKmh 키 없음

    const result = detectAndExcludeTransitSegments(activity, { velocitySmooth, time }, POLICY)

    expect(result).toBe(activity)
  })

  it('러닝은 27km/h, 자전거는 55km/h 임계값을 각각 따른다', () => {
    // 러닝 30km/h 90초 지속 — 러닝 임계값(27km/h) 초과이므로 재산정 대상
    const runStreams = makeUniformStreams([30, 30, 30], 30)
    const running = baseActivity({ jamActivityType: 'running', maxSpeedKmh: 30, distanceKm: 8, movingTimeSec: 2400 })
    const runResult = detectAndExcludeTransitSegments(running, runStreams, POLICY)
    expect(runResult.movingTimeSec).toBe(2400 - 90)

    // 자전거 30km/h는 자전거 임계값(55km/h) 이하이므로 재산정 대상 아님
    const cyclingStreams = makeUniformStreams([30, 30, 30], 30)
    const cycling = baseActivity({ jamActivityType: 'cycling', maxSpeedKmh: 30, distanceKm: 20, movingTimeSec: 3600 })
    const cyclingResult = detectAndExcludeTransitSegments(cycling, cyclingStreams, POLICY)
    expect(cyclingResult).toBe(cycling)
  })
})
