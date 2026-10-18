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
import { detectAndExcludeTransitSegments, needsTransitStreams, type TransitDetectionPolicy } from '../transitSegment'
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

  it('다섯 종목 밖의 종목 값(예: swimming)은 대상이 아니다', () => {
    const { velocitySmooth, time } = makeUniformStreams([40, 40, 40], 30)
    const activity = baseActivity({ jamActivityType: 'swimming', maxSpeedKmh: 40 })

    const result = detectAndExcludeTransitSegments(activity, { velocitySmooth, time }, POLICY)

    expect(result).toBe(activity)
    expect(needsTransitStreams(activity, POLICY)).toBe(false)
  })

  it('등산(hiking)도 걷기 기준 속도(20km/h)로 구간을 뺀다 (티켓 20261017_1421)', () => {
    // 등산 40km/h 90초 지속 — 걷기 임계값(20km/h) 초과이므로 재산정 대상
    const { velocitySmooth, time } = makeUniformStreams([40, 40, 40], 30)
    const activity = baseActivity({ jamActivityType: 'hiking', maxSpeedKmh: 40 })

    const result = detectAndExcludeTransitSegments(activity, { velocitySmooth, time }, POLICY)

    expect(result.movingTimeSec).toBe(1800 - 90)
    expect(result.distanceKm).toBeCloseTo(2.5 - 1.0, 3)
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

  it('trail_running은 러닝과 동일한 임계값(27km/h)을 재사용한다 (티켓 20260909_1031)', () => {
    // 트레일 러닝 30km/h 90초 지속 — 러닝과 동일한 임계값(27km/h) 초과이므로 재산정 대상
    const { velocitySmooth, time } = makeUniformStreams([30, 30, 30], 30)
    const trailRunning = baseActivity({
      jamActivityType: 'trail_running',
      maxSpeedKmh: 30,
      distanceKm: 8,
      movingTimeSec: 2400,
    })

    const result = detectAndExcludeTransitSegments(trailRunning, { velocitySmooth, time }, POLICY)

    expect(result.movingTimeSec).toBe(2400 - 90)
  })
})

describe('needsTransitStreams — 최대 속도 사전 거름 (티켓 20261017_1421)', () => {
  it('최대 속도가 종목 기준을 넘은 활동만 Streams가 필요하다', () => {
    expect(needsTransitStreams(baseActivity({ maxSpeedKmh: 40 }), POLICY)).toBe(true)
    expect(needsTransitStreams(baseActivity({ maxSpeedKmh: 20 }), POLICY)).toBe(false) // 기준과 같으면 넘지 않은 것
    expect(needsTransitStreams(baseActivity({ jamActivityType: 'hiking', maxSpeedKmh: 21 }), POLICY)).toBe(true)
    expect(needsTransitStreams(baseActivity({ jamActivityType: 'running', maxSpeedKmh: 27 }), POLICY)).toBe(false)
    expect(needsTransitStreams(baseActivity({ jamActivityType: 'cycling', maxSpeedKmh: 56 }), POLICY)).toBe(true)
  })

  it('최대 속도가 없거나 정책값이 이상하면 Streams가 필요 없다', () => {
    expect(needsTransitStreams(baseActivity(), POLICY)).toBe(false)
    expect(needsTransitStreams(baseActivity({ maxSpeedKmh: 40 }), { ...POLICY, transit_walk_max_speed_kmh: 0 })).toBe(false)
  })

  it('사전 거름이 false인 활동은 스트림이 무엇이든 판정 결과가 같다(호출만 줄어든다)', () => {
    // 최대 속도는 기준 이하인데 스트림에는 기준을 넘는 구간이 있는 모순된 입력 — 사전 거름이 막는 경우와
    // 스트림을 끝까지 훑는 경우의 결과가 같아야 판정이 바뀌지 않는다
    const fastStreams = makeUniformStreams([40, 40, 40], 30)
    const cases = [
      baseActivity({ maxSpeedKmh: 20 }),
      baseActivity({ jamActivityType: 'hiking', maxSpeedKmh: 20 }),
      baseActivity({ jamActivityType: 'running', maxSpeedKmh: 27 }),
      baseActivity({ jamActivityType: 'cycling', maxSpeedKmh: 55 }),
      baseActivity(),
    ]
    for (const activity of cases) {
      expect(needsTransitStreams(activity, POLICY)).toBe(false)
      expect(detectAndExcludeTransitSegments(activity, fastStreams, POLICY)).toBe(activity)
      expect(detectAndExcludeTransitSegments(activity, null, POLICY)).toBe(activity)
    }
  })

  it('사전 거름이 true인 활동은 스트림에 따라 구간을 빼거나(재산정) fail-open으로 원본을 둔다', () => {
    const activity = baseActivity({ maxSpeedKmh: 40 })
    expect(needsTransitStreams(activity, POLICY)).toBe(true)
    expect(detectAndExcludeTransitSegments(activity, makeUniformStreams([40, 40, 40], 30), POLICY).movingTimeSec).toBe(1710)
    expect(detectAndExcludeTransitSegments(activity, null, POLICY)).toBe(activity)
  })
})

describe('최고 속도(maxSpeedKmh)도 교통수단 구간을 뺀다 (티켓 20261018_1815 3회)', () => {
  /** (속도 km/h, 지속 초) 순서대로 5초 간격 스트림을 만든다 */
  function streamsFromSegments(segments: { kmh: number; sec: number }[]) {
    const speeds = segments.flatMap(({ kmh, sec }) => Array.from({ length: sec / 5 }, () => kmh))
    return makeUniformStreams(speeds, 5)
  }

  it('걷다가 지하철(60km/h)을 탄 활동의 최고 속도는 지하철 속도가 아니라 걷는 구간 속도다', () => {
    const activity = baseActivity({ distanceKm: 5, movingTimeSec: 3000, maxSpeedKmh: 60 })
    const result = detectAndExcludeTransitSegments(
      activity,
      streamsFromSegments([
        { kmh: 5, sec: 300 },
        { kmh: 60, sec: 120 },
        { kmh: 5, sec: 300 },
      ]),
      POLICY
    )
    expect(result.movingTimeSec).toBeLessThan(3000)
    expect(result.maxSpeedKmh).toBeCloseTo(5, 5)
    expect(result.transitExcludedSec).toBeGreaterThanOrEqual(120)
  })

  it('기준을 넘었어도 30초 미만이라 뺀 구간이 아닌 순간 속도는 최고 속도로 남는다', () => {
    const activity = baseActivity({ distanceKm: 5, movingTimeSec: 3000, maxSpeedKmh: 60 })
    const result = detectAndExcludeTransitSegments(
      activity,
      streamsFromSegments([
        { kmh: 5, sec: 60 },
        { kmh: 25, sec: 10 }, // 20km/h 초과지만 짧다 — 구간이 아니다
        { kmh: 5, sec: 60 },
        { kmh: 60, sec: 120 }, // 지하철
      ]),
      POLICY
    )
    expect(result.maxSpeedKmh).toBeCloseTo(25, 5)
  })

  it('최고 속도는 원래 값보다 커지지 않는다', () => {
    const activity = baseActivity({ maxSpeedKmh: 21 })
    const result = detectAndExcludeTransitSegments(
      activity,
      streamsFromSegments([
        { kmh: 15, sec: 60 },
        { kmh: 80, sec: 60 },
      ]),
      POLICY
    )
    expect(result.maxSpeedKmh).toBeLessThanOrEqual(21)
  })

  it('뺀 구간이 없으면 원본 그대로이고 transitExcludedSec도 없다', () => {
    const activity = baseActivity({ maxSpeedKmh: 40 })
    const unchanged = detectAndExcludeTransitSegments(activity, makeUniformStreams([5, 5, 5], 30), POLICY)
    expect(unchanged).toBe(activity)
    expect('transitExcludedSec' in unchanged).toBe(false)
  })
})
