/**
 * strava/sync — `user_family_progress` 쓰기 중단 회귀 테스트 (티켓 20261022_0938)
 *
 * 예전에는 `processFetchedActivities()`가 `recordProcessedActivities()` 직후 계열별 진행
 * 스냅샷을 `user_family_progress`에 upsert했다(티켓 20260904_1156). 이 표는 읽는 곳이 없어서
 * 훅을 지웠다. 이 시험은 «동기화가 이 표를 읽지도 쓰지도 않는다»를 고정한다 — 표와 열은 공용
 * DB에 남아 있고(옛 프로덕션 코드가 아직 쓴다), 정리는 티켓 20261022_0938 2회에서 한다.
 *
 * 1. 계열 진행 스냅샷을 만들 수 있는 입력(미획득 프런티어 배지 + 활동 이력)을 줘도
 *    `user_family_progress`에는 어떤 호출도 일어나지 않는다.
 * 2. 계열을 전부 획득한 유저도 이 표를 열지 않는다(예전 훅의 «기존값 조회»가 없다).
 * 3. 그래도 `processFetchedActivities`는 정상 완료된다(훅을 지운 것이 동기화 흐름을 깨지 않는다).
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-family-progress-snapshot.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StravaSummaryActivity, NormalizedActivity } from '@/types/strava'

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
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

/** `abusing_policy` 행 — sync-vehicle-speed-filter.test.ts와 동일 값 */
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
  updated_at: '2026-08-31T03:48:29+00:00',
}

function makeRawActivity(id: number): StravaSummaryActivity {
  return {
    id,
    resource_state: 2,
    name: `Run ${id}`,
    distance: 5000,
    moving_time: 1800,
    elapsed_time: 1800,
    total_elevation_gain: 20,
    type: 'Run',
    sport_type: 'Run',
    start_date: '2026-09-01T00:00:00Z',
    start_date_local: '2026-09-01T09:00:00',
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
    average_speed: 2.7, // ≈ 9.7km/h — 차량 속도 필터(기본 60km/h) 통과
    max_speed: 3.5,
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

function makeHistoryActivity(stravaId: number, startDate: string): NormalizedActivity {
  return {
    stravaId,
    name: `History ${stravaId}`,
    distanceKm: 5,
    movingTimeSec: 1800,
    elevationGainM: 20,
    jamActivityType: 'running',
    startDate,
    startDateLocal: startDate.replace('Z', ''),
    averageSpeedKmh: 9.7,
    startLatLng: null,
    endLatLng: null,
    weatherTempC: null,
  } as NormalizedActivity
}

interface FakeConfig {
  /** badges 테이블 응답 — 예전 훅이 계열 그룹핑에 쓰던 입력 */
  badges?: {
    id: string
    name: string
    rarity: string
    activity_types: string[]
    condition_json: Record<string, unknown> | null
  }[]
  /** user_activity_badges 테이블 응답 — 이 유저가 이미 획득한 badge_id 목록 */
  earnedBadgeIds?: string[]
  /** strava_activities(getActivityHistory) 테이블 응답 — 전체 활동 이력 */
  history?: NormalizedActivity[]
}

/** 가짜 클라이언트가 받은 호출 기록 — `from(table)`을 연 테이블과, 쓰기 호출을 테이블별로 모은다 */
interface CallLog {
  fromTables: string[]
  writes: { table: string; method: 'upsert' | 'insert' | 'update' | 'delete' }[]
}

function makeFakeSupabase(config: FakeConfig, log: CallLog): SupabaseClient {
  const { badges = [], earnedBadgeIds = [], history = [] } = config

  const from = (table: string) => {
    log.fromTables.push(table)
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      is: () => builder,
      not: () => builder,
      limit: () => builder,
      order: () => builder,
      single: async () => {
        if (table === 'abusing_policy') return { data: { ...POLICY_ROW }, error: null }
        return { data: null, error: null }
      },
      maybeSingle: async () => {
        if (table === 'strava_activities') return { data: { id: 'sa-latest-id' }, error: null }
        return { data: null, error: null } // user_drop_state 등
      },
      upsert: async () => {
        log.writes.push({ table, method: 'upsert' })
        return { error: null }
      },
      insert: async () => {
        log.writes.push({ table, method: 'insert' })
        return { error: null }
      },
      update: () => {
        log.writes.push({ table, method: 'update' })
        return builder
      },
      delete: () => {
        log.writes.push({ table, method: 'delete' })
        return builder
      },
      // 직접 await되는 경로(.maybeSingle()/.single()/.upsert()를 거치지 않는 조회)
      then(
        onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
        onRejected?: (e: unknown) => unknown
      ) {
        let payload: { data: unknown; error: unknown }
        switch (table) {
          case 'badges':
            payload = { data: badges, error: null }
            break
          case 'user_activity_badges':
            payload = { data: earnedBadgeIds.map((id) => ({ badge_id: id })), error: null }
            break
          case 'strava_activities':
            payload = { data: history.map((a) => ({ normalized: a, start_date: a.startDate })), error: null }
            break
          default:
            payload = { data: null, error: null }
        }
        return Promise.resolve(payload).then(onFulfilled, onRejected)
      },
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

function newLog(): CallLog {
  return { fromTables: [], writes: [] }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('processFetchedActivities — user_family_progress를 쓰지 않는다 (티켓 20261022_0938)', () => {
  it('미획득 프런티어와 활동 이력이 있어도 user_family_progress를 열지도 쓰지도 않는다', async () => {
    const log = newLog()
    const supabase = makeFakeSupabase(
      {
        badges: [
          {
            id: 'badge-common-1',
            name: '테스트계열',
            rarity: 'common',
            activity_types: ['running'],
            condition_json: { total_count: 5 },
          },
        ],
        earnedBadgeIds: [], // 예전 훅이라면 프런티어로 잡아 upsert했을 입력
        history: [
          makeHistoryActivity(101, '2026-08-01T00:00:00Z'),
          makeHistoryActivity(102, '2026-08-05T00:00:00Z'),
        ],
      },
      log
    )

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(result).toBeDefined()
    expect(log.fromTables).not.toContain('user_family_progress')
    expect(log.writes.filter((w) => w.table === 'user_family_progress')).toHaveLength(0)
  })

  it('계열을 전부 획득한 유저도 user_family_progress를 열지 않고, 동기화는 그대로 끝난다', async () => {
    const log = newLog()
    const supabase = makeFakeSupabase(
      {
        badges: [
          {
            id: 'badge-common-1',
            name: '테스트계열',
            rarity: 'common',
            activity_types: ['running'],
            condition_json: { total_count: 5 },
          },
        ],
        earnedBadgeIds: ['badge-common-1'],
        history: [makeHistoryActivity(101, '2026-08-01T00:00:00Z')],
      },
      log
    )

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(result.badges).toBe(0)
    expect(log.fromTables).not.toContain('user_family_progress')
  })

  it('다른 쓰기(strava_activities 기록)는 그대로 일어난다 — 훅만 빠졌다', async () => {
    const log = newLog()
    const supabase = makeFakeSupabase({}, log)

    await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(log.writes.some((w) => w.table === 'strava_activities' && w.method === 'upsert')).toBe(true)
    expect(log.fromTables).not.toContain('user_family_progress')
  })
})
