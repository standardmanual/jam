/**
 * strava/sync — 교통수단 구간 감지·재산정이 배지/드랍/미션 판정에 반영되는지 (티켓 20260909_1012)
 *
 * 배경: `sihyunrr@gmail.com` 계정 실사례(2026-09-08 "Morning Walk", distanceKm 2.5,
 * maxSpeedKmh 119.5, averageSpeedKmh 7.0 — 집→지하철역 도보, 지하철 탑승, 하차 후 회사까지
 * 도보)처럼, 걷기 활동 중간에 지하철·버스 구간이 섞여도 기존 필터(averageSpeedKmh만 검사)는
 * 이를 걸러내지 못한다. `processFetchedActivities`가 `getActivityStreams`로 받은
 * velocity_smooth·time 스트림에서 임계값을 30초 이상 연속 초과하는 구간을 찾아 거리·시간을
 * 제외한 뒤, 그 재산정된 값이 `normalizeActivity()` 이후·배지/드랍/미션 판정 이전에 반영되는지
 * 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-transit-segment.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StravaSummaryActivity, NormalizedActivity } from '@/types/strava'
import type { ActivityStreams } from '@/lib/strava/api'

const stub = vi.hoisted(() => ({
  /** getActivityStreams가 이번 테스트에서 돌려줄 값 */
  streams: null as ActivityStreams | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
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
  getActivityStreams: vi.fn(async () => stub.streams),
  getActivities: vi.fn(),
  refreshStravaToken: vi.fn(),
}))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: vi.fn(async () => {}) }))

import { processFetchedActivities } from '../sync'
import { evaluateBadges } from '@/lib/badge-engine/index'

/** 마이그레이션 148 적용 후의 `abusing_policy` 행 — 티켓 기본값 그대로 */
const POLICY_ROW: Record<string, unknown> = {
  id: 1,
  soft_common_rate: 1.0,
  soft_rare_rate: 1.0,
  soft_epic_rate: 1.0,
  soft_mystic_rate: 0.0,
  hard_common_rate: 1.0,
  hard_rare_rate: 0.0,
  hard_epic_rate: 1.0,
  hard_mystic_rate: 0.0,
  gps_max_speed_kmh: 300,
  poi_block_hours: 72,
  vehicle_speed_filter_kmh: 60,
  gps_daily_distance_cap_km: 3000,
  transit_walk_max_speed_kmh: 20,
  transit_run_max_speed_kmh: 27,
  transit_cycling_max_speed_kmh: 55,
  transit_segment_min_duration_sec: 30,
  updated_at: '2026-09-09T00:00:00+00:00',
}

/** km/h → m/s */
const kmhToMps = (kmh: number) => kmh / 3.6

/** distanceKm 2.5, movingTime 1800s(30분), maxSpeed 119.5km/h — 실사례와 동일 자릿수 */
function makeWalkActivity(): StravaSummaryActivity {
  return {
    id: 9001,
    resource_state: 2,
    name: 'Morning Walk',
    distance: 2500, // 2.5km
    moving_time: 1800,
    elapsed_time: 1800,
    total_elevation_gain: 5,
    type: 'Walk',
    sport_type: 'Walk',
    start_date: '2026-09-08T00:00:00Z',
    start_date_local: '2026-09-08T09:00:00',
    timezone: '(GMT+09:00) Asia/Seoul',
    utc_offset: 32400,
    location_city: null,
    location_state: null,
    location_country: null,
    achievement_count: 0,
    kudos_count: 0,
    comment_count: 0,
    athlete_count: 1,
    photo_count: 0,
    map: { id: 'm9001', summary_polyline: null, resource_state: 2 },
    trainer: false,
    commute: false,
    manual: false,
    private: false,
    visibility: 'everyone',
    flagged: false,
    gear_id: null,
    start_latlng: [],
    end_latlng: [],
    average_speed: 2500 / 1800, // m/s — distance/moving_time과 일치
    max_speed: kmhToMps(119.5),
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
  }
}

/**
 * 지하철 구간(90초, 40km/h)이 섞인 velocity_smooth·time 스트림 — 도보(4km/h) → 정차(0km/h,
 * 승차 대기) → 지하철(40km/h, 90초 지속) → 정차(0km/h, 하차) → 도보(4km/h).
 *
 * 경계 구간(0↔40km/h 평균 20km/h)은 임계값(20km/h)과 **정확히 같아** `>` 비교에서 제외되도록
 * 설계했다 — 순수하게 40km/h 두 구간(각 45초)만 초과 판정되어 거리·시간 계산이 깔끔하다.
 *   초과 구간 거리 = 11.111m/s × 90s = 1,000m = 1.0km, 지속시간 = 90초
 */
function makeTransitStreams(): ActivityStreams {
  return {
    route: null,
    velocitySmooth: [kmhToMps(4), kmhToMps(0), kmhToMps(40), kmhToMps(40), kmhToMps(40), kmhToMps(0), kmhToMps(4)],
    time: [0, 10, 40, 85, 130, 160, 1800],
  }
}

function makeFakeSupabase(): SupabaseClient {
  const from = () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      is: () => builder,
      limit: () => builder,
      single: async () => ({ data: POLICY_ROW, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      upsert: async () => ({ error: null }),
      insert: async () => ({ error: null }),
      then: undefined,
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

function evaluatedActivity(): NormalizedActivity | undefined {
  const call = vi.mocked(evaluateBadges).mock.calls[0]
  if (!call) return undefined
  return (call[1] as NormalizedActivity[])[0]
}

beforeEach(() => {
  stub.streams = null
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('processFetchedActivities — 교통수단 구간 재산정 반영', () => {
  it('velocity_smooth·time 스트림에서 임계값 30초 이상 초과 구간을 제외해 거리·시간을 재산정한다', async () => {
    stub.streams = makeTransitStreams()
    const raw = makeWalkActivity()

    await processFetchedActivities(makeFakeSupabase(), 'user-1', 'token', [raw], false, 'sync')

    const activity = evaluatedActivity()
    expect(activity).toBeDefined()
    expect(activity!.distanceKm).toBeCloseTo(1.5, 3) // 2.5km - 1.0km(지하철 구간)
    expect(activity!.movingTimeSec).toBe(1710) // 1800s - 90s(지하철 구간)
  })

  it('스트림 조회 실패(null) 시 fail-open — 기존 averageSpeedKmh 기준 값 그대로 배지 판정에 넘어간다', async () => {
    stub.streams = null
    const raw = makeWalkActivity()

    await processFetchedActivities(makeFakeSupabase(), 'user-1', 'token', [raw], false, 'sync')

    const activity = evaluatedActivity()
    expect(activity).toBeDefined()
    expect(activity!.distanceKm).toBe(2.5)
    expect(activity!.movingTimeSec).toBe(1800)
  })
})
