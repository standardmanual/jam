/**
 * `normalizeActivity` — v5 확장 6필드 수집 회귀 테스트 (티켓 20260905_0029)
 *
 * 배경: 심박·파워·케이던스·최고속도·최고도달고도·경과시간은 Strava **목록 응답**에 이미
 * 오고 `StravaSummaryActivity` 타입에도 선언돼 있었는데, `normalizeActivity`가 읽지 않아
 * 통째로 버려지고 있었다. 정규화 지점이 이 함수 하나뿐이라 여기가 유일한 수집 관문이다.
 *
 * 이 파일이 고정하는 것 — 티켓의 완료 조건 4가지:
 * ① 값이 있으면 저장한다
 * ② 값이 없으면 **키 자체가 없다**(`null`이 아니라). 심박계 없는 유저의 활동이
 *    «데이터 없음 = 카운트 안 함»으로 자연히 동작해야 한다
 * ③ 단위 변환이 맞다 (`max_speed` m/s → km/h, `elev_high` → `maxElevationM`)
 * ④ 기존 10필드는 무변경
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/normalize-activity.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import type { StravaSummaryActivity } from '@/types/strava'

// sync.ts는 배지·드랍·미션·소식 엔진을 전부 끌어온다. 이 테스트는 순수 변환 함수만 보므로
// 무거운 의존을 모킹해 잘라낸다 (sync-vehicle-speed-filter.test.ts와 같은 방식).
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 이 테스트는 DB에 접근하지 않는다')
  },
}))
vi.mock('@/lib/drop-engine/index', () => ({ tryItemDrop: vi.fn(async () => []) }))
vi.mock('@/lib/badge-engine/index', () => ({ evaluateBadges: vi.fn(async () => []) }))
vi.mock('@/lib/poi/matcher', () => ({ matchPoisForActivity: vi.fn(async () => []) }))
vi.mock('@/lib/itembook/checker', () => ({
  checkItemBookCompletion: vi.fn(async () => ({ completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] })),
}))
vi.mock('@/lib/itembook/completable', () => ({ findCompletableItemBooks: vi.fn(async () => []) }))
vi.mock('@/lib/missions/checker', () => ({
  checkMissions: vi.fn(async () => ({ completedMissionIds: [], awardedBadgeIds: [] })),
}))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn(async () => {}),
  dailyGroupKey: vi.fn(() => 'group-key'),
}))
vi.mock('@/lib/notifications/recap', () => ({ recordActivityRecap: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications/batch/collections', () => ({ selectCompletableDrafts: vi.fn(() => []) }))
vi.mock('@/lib/strava/api', () => ({
  getActivityStreams: vi.fn(async () => null),
  getActivities: vi.fn(),
  refreshStravaToken: vi.fn(),
}))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: vi.fn(async () => {}) }))

import { normalizeActivity } from '../sync'
import { extractExtendedActivityFields, EXTENDED_ACTIVITY_FIELD_KEYS } from '@/types/strava'

/**
 * 확장 필드가 **하나도 없는** 최소 활동. Strava는 심박계·파워미터가 없으면 해당 키를
 * 응답에서 아예 뺀다. `max_speed`·`elapsed_time`은 타입상 항상 오므로 여기서도 채운다.
 */
function baseActivity(overrides: Partial<StravaSummaryActivity> = {}): StravaSummaryActivity {
  return {
    id: 1001,
    resource_state: 2,
    name: '아침 러닝',
    distance: 10_120,          // 10.12km
    moving_time: 3_600,
    elapsed_time: 3_900,
    total_elevation_gain: 88,
    type: 'Run',
    sport_type: 'Run',
    start_date: '2026-09-01T00:10:00Z',
    start_date_local: '2026-09-01T09:10:00Z',
    timezone: '(GMT+09:00) Asia/Seoul',
    utc_offset: 32400,
    location_city: null,
    location_state: null,
    location_country: 'South Korea',
    achievement_count: 0,
    kudos_count: 0,
    comment_count: 0,
    athlete_count: 1,
    photo_count: 0,
    map: { id: 'a1', summary_polyline: null, resource_state: 2 },
    trainer: false,
    commute: false,
    manual: false,
    private: false,
    visibility: 'everyone',
    flagged: false,
    gear_id: null,
    start_latlng: [37.5, 127.0],
    end_latlng: [37.51, 127.01],
    average_speed: 2.8,        // m/s
    max_speed: 4.5,            // m/s → 16.2km/h
    has_heartrate: false,
    heartrate_opt_out: false,
    display_hide_heartrate_option: false,
    upload_id: null,
    upload_id_str: null,
    external_id: null,
    pr_count: 0,
    total_photo_count: 0,
    has_kudoed: false,
    workout_type: null,
    suffer_score: null,
    ...overrides,
  }
}

/** 측정 장비를 전부 갖춘 활동 */
function fullyInstrumented(): StravaSummaryActivity {
  return baseActivity({
    has_heartrate: true,
    average_heartrate: 158.4,
    max_heartrate: 181,
    average_watts: 243,
    weighted_average_watts: 251,
    average_cadence: 88.5,
    elev_high: 412.7,
    elev_low: 12.3,
    device_watts: true,
  })
}

describe('normalizeActivity — ① 값이 있으면 저장한다', () => {
  it('확장 9필드가 전부 정규화 객체에 실린다', () => {
    const n = normalizeActivity(fullyInstrumented())
    expect(n.avgHeartrateBpm).toBe(158.4)
    expect(n.avgWatts).toBe(243)
    expect(n.avgCadence).toBe(88.5)
    expect(n.maxElevationM).toBe(412.7)
    expect(n.maxSpeedKmh).toBe(16.2)
    expect(n.elapsedTimeSec).toBe(3_900)
  })

  it('값이 0이어도 버리지 않는다 — «해수면 고도 0m»와 «필드 없음»은 다른 사실이다', () => {
    const n = normalizeActivity(baseActivity({ elev_high: 0, average_watts: 0 }))
    expect(n).toHaveProperty('maxElevationM', 0)
    expect(n).toHaveProperty('avgWatts', 0)
  })
})

describe('normalizeActivity — ② 값이 없으면 키 자체가 없다 (null이 아니다)', () => {
  it('심박계·파워미터가 없는 활동에는 해당 키가 생기지 않는다', () => {
    const n = normalizeActivity(baseActivity())
    // `'key' in obj`로 확인한다 — `toBeUndefined()`는 «키는 있고 값이 undefined»도 통과한다
    expect('avgHeartrateBpm' in n).toBe(false)
    expect('avgWatts' in n).toBe(false)
    expect('avgCadence' in n).toBe(false)
    expect('maxElevationM' in n).toBe(false)
  })

  it('JSON 직렬화(= jsonb 저장 형태)에도 키가 남지 않는다', () => {
    const stored = JSON.parse(JSON.stringify(normalizeActivity(baseActivity())))
    expect(Object.keys(stored)).not.toContain('avgHeartrateBpm')
    expect(Object.keys(stored)).not.toContain('avgWatts')
    // 반면 기존 관례를 따르는 weatherTempC는 null로 남는다 (의도적 차이)
    expect(stored.weatherTempC).toBeNull()
  })

  it('null·NaN이 와도 키를 만들지 않는다', () => {
    const n = normalizeActivity(
      baseActivity({
        average_heartrate: null as unknown as number,
        average_cadence: NaN,
      })
    )
    expect('avgHeartrateBpm' in n).toBe(false)
    expect('avgCadence' in n).toBe(false)
  })
})

describe('normalizeActivity — ③ 단위 변환', () => {
  it('max_speed는 m/s → km/h로 변환된다 (평균 속도와 같은 반올림)', () => {
    const n = normalizeActivity(baseActivity({ max_speed: 10 }))
    expect(n.maxSpeedKmh).toBe(36)
    const n2 = normalizeActivity(baseActivity({ max_speed: 4.5 }))
    expect(n2.maxSpeedKmh).toBe(16.2)  // 4.5 × 3.6 = 16.2
  })

  it('maxElevationM은 elev_high(도달 고도)이지 total_elevation_gain(누적 상승)이 아니다', () => {
    const n = normalizeActivity(baseActivity({ elev_high: 412.7, total_elevation_gain: 88 }))
    expect(n.maxElevationM).toBe(412.7)
    expect(n.elevationGainM).toBe(88)
  })

  it('elapsedTimeSec은 초 그대로 — movingTimeSec과 다른 값이다', () => {
    const n = normalizeActivity(baseActivity({ elapsed_time: 3_900, moving_time: 3_600 }))
    expect(n.elapsedTimeSec).toBe(3_900)
    expect(n.movingTimeSec).toBe(3_600)
    expect(n.elapsedTimeSec! - n.movingTimeSec).toBe(300) // 휴식 300초
  })

  it('심박·파워·케이던스는 변환 없이 원값 그대로다', () => {
    const n = normalizeActivity(
      baseActivity({ average_heartrate: 158.4, average_watts: 243, average_cadence: 88.5 })
    )
    expect(n.avgHeartrateBpm).toBe(158.4)
    expect(n.avgWatts).toBe(243)
    expect(n.avgCadence).toBe(88.5)
  })
})

describe('normalizeActivity — ④ 기존 10필드 무변경', () => {
  const EXISTING_KEYS = [
    'stravaId', 'name', 'distanceKm', 'movingTimeSec', 'elevationGainM',
    'jamActivityType', 'startDate', 'startDateLocal', 'averageSpeedKmh',
    'startLatLng', 'endLatLng', 'weatherTempC',
  ] as const

  it('기존 필드의 값이 확장 전과 같다', () => {
    const n = normalizeActivity(fullyInstrumented())
    expect(n.stravaId).toBe(1001)
    expect(n.name).toBe('아침 러닝')
    expect(n.distanceKm).toBe(10.12)
    expect(n.movingTimeSec).toBe(3_600)
    expect(n.elevationGainM).toBe(88)
    expect(n.jamActivityType).toBe('running')
    expect(n.startDate).toBe('2026-09-01T00:10:00Z')
    expect(n.startDateLocal).toBe('2026-09-01T09:10:00Z')
    expect(n.averageSpeedKmh).toBe(10.1) // 2.8 m/s × 3.6 = 10.08 → 10.1
    expect(n.startLatLng).toEqual([37.5, 127.0])
    expect(n.endLatLng).toEqual([37.51, 127.01])
    expect(n.weatherTempC).toBeNull()
  })

  it('빈 좌표 배열은 여전히 null로 접힌다', () => {
    const n = normalizeActivity(baseActivity({ start_latlng: [], end_latlng: [] }))
    expect(n.startLatLng).toBeNull()
    expect(n.endLatLng).toBeNull()
  })

  it('센서 값이 없는 활동에는 «항상 오는» 확장 2필드만 붙는다', () => {
    // elapsed_time·max_speed는 Strava 응답에 항상 오므로(타입도 필수) 센서가 없어도 붙는다.
    // 나머지 4종은 측정 장비가 있어야 오는 값이라 키가 생기지 않는다.
    const n = normalizeActivity(baseActivity())
    expect(Object.keys(n).sort()).toEqual(
      [...EXISTING_KEYS, 'elapsedTimeSec', 'maxSpeedKmh'].sort()
    )
  })

  it('Strava가 확장 필드를 하나도 주지 않으면 기존 키만 남는다', () => {
    const bare = { ...baseActivity() } as Partial<StravaSummaryActivity>
    delete bare.max_speed
    delete bare.elapsed_time
    const n = normalizeActivity(bare as StravaSummaryActivity)
    expect(Object.keys(n).sort()).toEqual([...EXISTING_KEYS].sort())
  })

  it('확장 필드가 기존 필드를 덮어쓰지 않는다', () => {
    const plain = normalizeActivity(baseActivity())
    const rich = normalizeActivity(fullyInstrumented())
    for (const key of EXISTING_KEYS) {
      expect(rich[key]).toEqual(plain[key])
    }
  })
})

describe('리뷰 반영 3필드 — 재백필을 피하려고 같은 응답에서 함께 담는다 (티켓 20260905_0029)', () => {
  it('max_heartrate · weighted_average_watts · device_watts가 실린다', () => {
    const n = normalizeActivity(fullyInstrumented())
    expect(n.maxHeartrateBpm).toBe(181)
    expect(n.weightedAvgWatts).toBe(251)
    expect(n.deviceWatts).toBe(true)
  })

  it('device_watts는 false도 값이다 — 키가 생겨야 한다', () => {
    // 추정 파워인지 실측인지를 가르는 구분자다. false를 «없음»으로 접으면
    // 「실측 파워만 인정」 정책을 나중에 세울 수 없다.
    const n = normalizeActivity(baseActivity({ average_watts: 180, device_watts: false }))
    expect('deviceWatts' in n).toBe(true)
    expect(n.deviceWatts).toBe(false)
  })

  it('세 필드가 없으면 키 자체가 없다', () => {
    const bare = { ...baseActivity() } as Partial<StravaSummaryActivity>
    delete bare.max_heartrate
    delete bare.weighted_average_watts
    delete bare.device_watts
    const n = normalizeActivity(bare as StravaSummaryActivity)
    expect('maxHeartrateBpm' in n).toBe(false)
    expect('weightedAvgWatts' in n).toBe(false)
    expect('deviceWatts' in n).toBe(false)
  })
})

describe('extractExtendedActivityFields — 싱크와 백필의 공유 지점', () => {
  it('normalizeActivity의 확장 필드는 이 함수의 결과와 정확히 같다', () => {
    const activity = fullyInstrumented()
    const extracted = extractExtendedActivityFields(activity)
    const normalized = normalizeActivity(activity)
    for (const key of EXTENDED_ACTIVITY_FIELD_KEYS) {
      expect(normalized[key]).toBe(extracted[key])
    }
    // 두 경로가 갈라지면 백필된 활동과 신규 활동의 형태가 달라진다
    expect(Object.keys(extracted).sort()).toEqual([...EXTENDED_ACTIVITY_FIELD_KEYS].sort())
  })

  it('값이 없으면 빈 객체를 돌려준다 (키를 만들지 않는다)', () => {
    // max_speed·elapsed_time은 타입상 항상 오므로 명시적으로 지운 형태를 만든다
    const bare = { ...baseActivity() } as Partial<StravaSummaryActivity>
    delete bare.max_speed
    delete bare.elapsed_time
    expect(extractExtendedActivityFields(bare as StravaSummaryActivity)).toEqual({})
  })
})
