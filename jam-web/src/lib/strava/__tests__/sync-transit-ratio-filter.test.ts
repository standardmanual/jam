/**
 * strava/sync — 교통수단 비율·걷기 평균 속도 상한 규칙이 동기화에서 걸러지고 기록되는지 (티켓 20261103_1115)
 *
 * 배경: 지하철을 탄 걷기 활동이 평균 속도 필터(60km/h)를 통과해 아이템 배지가 드랍됐다. 구간 감지가 지하철 구간을 빼도
 * 남은 평균이 걷기 속도라 기존 규칙으로는 걸러지지 않는 활동(걷다 → 지하철)과, 걷기라고 부르기엔 너무 빠른 평균(17km/h)의 활동이
 * `vehicle_speed` 사유로 기록되고 배지·미션 정산에 들어가지 않는지 확인한다. 종목 불일치(러닝 → 걷기)로 바뀐 활동에도 걷기 상한이 걸리는지도 본다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-transit-ratio-filter.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StravaSummaryActivity, NormalizedActivity } from '@/types/strava'

const stub = vi.hoisted(() => ({
  /** abusing_policy 조회가 돌려줄 행 (null이면 행 없음) */
  policyRow: null as Record<string, unknown> | null,
  /** abusing_policy 조회가 돌려줄 에러 */
  policyError: null as { code: string; message: string } | null,
  /** createServiceClient 호출 횟수 — 주입 사슬이 끊겼는지 감시한다 */
  serviceClientCalls: 0,
  /** strava_activities upsert로 기록된 행 */
  recorded: [] as Record<string, unknown>[],
}))

// 주입된 클라이언트를 쓰지 않고 새 service_role 클라이언트를 만들면 즉시 드러나도록 던진다.
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    stub.serviceClientCalls++
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))

vi.mock('@/lib/drop-engine/syncIssueRun', () => ({ issueSyncItemBadges: vi.fn(async () => ({ issuedBadgeIds: [], pendingCount: 0 })) }))
vi.mock('@/lib/badge-engine/index', () => ({ evaluateBadges: vi.fn(async () => []) }))
vi.mock('@/lib/badge-engine/jamActionBadges', () => ({ evaluateJamActionBadges: vi.fn(async () => []) })) // JAM! 행동 지표 판정은 sync-jam-action-hook.test.ts가 따로 확인한다 (티켓 20261001_0633)
vi.mock('@/lib/poi/matcher', () => ({ matchPoisForActivity: vi.fn(async () => []) }))
vi.mock('@/lib/itembook/checker', () => ({
  checkItemBookCompletion: vi.fn(async () => ({ completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] })),
}))
// sync-drop-order.test.ts가 상시 red인 원인(내부에서 createServiceClient 호출)을 여기서는 모킹으로 차단한다
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

import { processFetchedActivities } from '../sync'
import { getActivityStreams } from '@/lib/strava/api'
import { evaluateBadges } from '@/lib/badge-engine/index'
import { checkMissions } from '@/lib/missions/checker'

/** 마이그레이션 115 적용 후의 `abusing_policy` 행 */
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
  mismatch_run_min_speed_kmh: 6,
  mismatch_cycling_min_speed_kmh: 10,
  transit_ratio_filter_pct: 50,
  walk_avg_max_speed_kmh: 16,
  updated_at: '2026-08-31T03:48:29+00:00',
}

/** km/h → m/s (Strava의 average_speed 단위) */
const kmhToMps = (kmh: number) => kmh / 3.6

function makeRawActivity(id: number, averageSpeedKmh: number): StravaSummaryActivity {
  return {
    id,
    resource_state: 2,
    name: `Activity ${id}`,
    distance: 5000,
    moving_time: 1800,
    elapsed_time: 1800,
    total_elevation_gain: 20,
    type: 'Ride',
    sport_type: 'Ride',
    start_date: `2026-08-0${id}T00:00:00Z`,
    start_date_local: `2026-08-0${id}T09:00:00`,
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
    map: { id: `m${id}`, summary_polyline: 'encoded-polyline', resource_state: 2 },
    trainer: false,
    commute: false,
    manual: false,
    private: false,
    visibility: 'everyone',
    flagged: false,
    gear_id: null,
    start_latlng: [37.5, 127.0],
    end_latlng: [],
    average_speed: kmhToMps(averageSpeedKmh),
    max_speed: kmhToMps(averageSpeedKmh) * 1.2,
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

/** 걷기 Walk 활동 한 건을 만든다 (거리 m·움직인 시간 초·최고 속도 km/h) */
function makeWalk(id: number, o: { distanceM: number; movingSec: number; maxSpeedKmh: number; type?: 'Walk' | 'Run' }): StravaSummaryActivity {
  const base = makeRawActivity(id, (o.distanceM / o.movingSec) * 3.6)
  const type = o.type ?? 'Walk'
  return {
    ...base,
    type,
    sport_type: type,
    distance: o.distanceM,
    moving_time: o.movingSec,
    elapsed_time: o.movingSec,
    average_speed: o.distanceM / o.movingSec,
    max_speed: kmhToMps(o.maxSpeedKmh),
  }
}

/** 구간별 (속도 km/h, 지속 초)를 1초 간격 스트림으로 편다 */
function streamOf(parts: Array<[kmh: number, sec: number]>) {
  const velocitySmooth: number[] = []
  const time: number[] = []
  let t = 0
  for (const [kmh, sec] of parts) {
    for (let i = 0; i < sec; i++) {
      velocitySmooth.push(kmhToMps(kmh))
      time.push(t++)
    }
  }
  return { route: null, velocitySmooth, time }
}

/** processFetchedActivities가 실제로 조회하는 테이블만 응답하는 최소 스텁. strava_activities upsert는 기록해 둔다 */
function makeFakeSupabase(): SupabaseClient {
  const from = (table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      is: () => builder,
      limit: () => builder,
      single: async () => {
        if (table === 'abusing_policy') return { data: stub.policyRow, error: null }
        return { data: null, error: null }
      },
      maybeSingle: async () => ({ data: null, error: null }),
      upsert: async (rows: unknown) => {
        if (table === 'strava_activities') stub.recorded.push(...(rows as Record<string, unknown>[]))
        return { error: null }
      },
      insert: async () => ({ error: null }),
      then: undefined,
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

const recordedReason = (stravaId: number) => stub.recorded.find((r) => r.strava_id === stravaId)?.filter_reason

/** evaluateBadges에 넘어간(=필터를 통과한) 활동의 strava_id 목록 */
function passedIds(): number[] {
  const call = vi.mocked(evaluateBadges).mock.calls[0]
  if (!call) return []
  return (call[1] as NormalizedActivity[]).map((a) => a.stravaId)
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  stub.policyRow = { ...POLICY_ROW }
  stub.policyError = null
  stub.serviceClientCalls = 0
  stub.recorded = []
  vi.clearAllMocks()
  vi.mocked(getActivityStreams).mockResolvedValue(null)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
})

describe('processFetchedActivities — 교통수단 비율·걷기 평균 속도 상한', () => {
  // 15분 걷기(5km/h → 1.25km) + 10분 지하철(40km/h → 6.67km). 구간 감지가 지하철을 빼면 남는 것은 900초·5km/h라 평균 속도 필터로는 통과한다
  const subwayWalk = () => makeWalk(1, { distanceM: 7917, movingSec: 1500, maxSpeedKmh: 42 })
  const subwayStream = () => streamOf([[5, 900], [40, 600]])

  it('걷다가 지하철을 탄 활동은 vehicle_speed로 기록되고 배지·미션 정산에 들어가지 않는다', async () => {
    vi.mocked(getActivityStreams).mockResolvedValue(subwayStream())
    const activity = subwayWalk()

    await processFetchedActivities(makeFakeSupabase(), 'user-1', 'token', [activity], false, 'sync')

    expect(recordedReason(activity.id)).toBe('vehicle_speed')
    expect(passedIds()).toEqual([])
    expect(vi.mocked(checkMissions).mock.calls.flatMap((c) => (c[1] as NormalizedActivity[]).map((a) => a.stravaId))).toEqual([])
  })

  it('첫 동기화도 같은 판정을 쓴다', async () => {
    vi.mocked(getActivityStreams).mockResolvedValue(subwayStream())
    const activity = subwayWalk()

    await processFetchedActivities(makeFakeSupabase(), 'user-1', 'token', [activity], true, 'sync')

    expect(recordedReason(activity.id)).toBe('vehicle_speed')
    expect(passedIds()).toEqual([])
  })

  it('교통수단 비율 기준을 90%로 올리면 같은 활동(비율 약 84%)이 통과한다', async () => {
    stub.policyRow = { ...POLICY_ROW, transit_ratio_filter_pct: 90 }
    vi.mocked(getActivityStreams).mockResolvedValue(subwayStream())
    const activity = subwayWalk()

    await processFetchedActivities(makeFakeSupabase(), 'user-1', 'token', [activity], false, 'sync')

    expect(recordedReason(activity.id)).toBeNull()
    expect(passedIds()).toEqual([activity.id])
  })

  it('걷기 평균이 17km/h면 구간이 없어도 vehicle_speed로 걸리고, 평범한 걷기(5km/h)는 통과한다', async () => {
    const tooFast = makeWalk(2, { distanceM: 8500, movingSec: 1800, maxSpeedKmh: 18 }) // 17km/h
    const normal = makeWalk(3, { distanceM: 2500, movingSec: 1800, maxSpeedKmh: 7 }) // 5km/h

    await processFetchedActivities(makeFakeSupabase(), 'user-1', 'token', [tooFast, normal], false, 'sync')

    expect(recordedReason(tooFast.id)).toBe('vehicle_speed')
    expect(recordedReason(normal.id)).toBeNull()
    expect(passedIds()).toEqual([normal.id])
  })

  it('걷기 상한은 정책 값을 따른다 (상한 20으로 올리면 17km/h 걷기가 통과한다)', async () => {
    stub.policyRow = { ...POLICY_ROW, walk_avg_max_speed_kmh: 20 }
    const activity = makeWalk(2, { distanceM: 8500, movingSec: 1800, maxSpeedKmh: 18 })

    await processFetchedActivities(makeFakeSupabase(), 'user-1', 'token', [activity], false, 'sync')

    expect(passedIds()).toEqual([activity.id])
  })

  it('종목 불일치로 걷기가 된 활동(러닝 평균 4km/h)은 걷기 상한에 걸리지 않고 통과한다 (바뀌는 조건이 느린 평균이라 상한과 겹치지 않는다)', async () => {
    // 평균 4km/h 러닝 → 종목 불일치로 걷기. 상한(16)보다 한참 느려 통과한다
    const slowRun = makeWalk(4, { distanceM: 2000, movingSec: 1800, maxSpeedKmh: 6, type: 'Run' })

    await processFetchedActivities(makeFakeSupabase(), 'user-1', 'token', [slowRun], false, 'sync')

    expect(passedIds()).toEqual([slowRun.id])
  })

  it('러닝 17km/h는 걷기 상한에 걸리지 않는다 (러닝으로 정상인 속도)', async () => {
    const run = makeWalk(5, { distanceM: 8500, movingSec: 1800, maxSpeedKmh: 18, type: 'Run' })

    await processFetchedActivities(makeFakeSupabase(), 'user-1', 'token', [run], false, 'sync')

    expect(passedIds()).toEqual([run.id])
  })
})
