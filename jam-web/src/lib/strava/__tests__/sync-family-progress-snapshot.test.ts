/**
 * strava/sync — 계열 진행 스냅샷 write-hook 회귀 테스트 (티켓 20260904_1156)
 *
 * `processFetchedActivities()`가 `recordProcessedActivities()` 직후 호출하는
 * `updateFamilyProgressSnapshots()`(비공개 함수라 이 공개 진입점을 통해서만 검증 가능)의
 * 계약을 고정한다. 이 훅은 이번 티켓에서 처음으로 실제 유저 싱크 흐름에 새 쓰기
 * 부작용(`user_family_progress` upsert)을 추가하므로, 아래 네 가지를 명시적으로 검증한다.
 *
 * 1. 훅이 던져도(예: 예상 못한 쿼리 실패) `processFetchedActivities` 자체는 정상 완료된다
 *    (C절 "이 훅이 실패해도 싱크 자체는 죽지 않아야 한다").
 * 2. 계열의 프런티어(첫 미획득 등급)만 진행을 계산해 upsert한다 — 계열을 이미 전부
 *    획득했으면 upsert하지 않는다.
 * 3. upsert 행의 `progress`/`current`는 기존 `computeUserPeriodMetrics`/`computeBadgeProgress`
 *    결과를 그대로 담는다(새 계산 없음).
 * 4. `prev`는 직전에 저장돼 있던 `current`를 그대로 옮긴 값이다(최초 1회는 null).
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
    map: { id: `m${id}`, summary_polyline: null, resource_state: 2 },
    trainer: false,
    commute: false,
    manual: false,
    private: false,
    visibility: 'everyone',
    flagged: false,
    gear_id: null,
    start_latlng: [],
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

type FamilyProgressRow = {
  user_id: string
  activity_type: string
  family_name: string
  progress: number
  current: unknown
  prev: unknown
  last_activity_id: string | null
}

interface FakeConfig {
  /** badges 테이블 응답 — 계열 그룹핑 대상 */
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
  /** user_family_progress 테이블의 기존 행(직전 스냅샷) */
  existingFamilyProgress?: { activity_type: string; family_name: string; current: unknown }[]
  /** badges 조회에 .not()이 없는 등 의도적으로 불완전한 스텁을 만들 때 사용 */
  breakBadgesQuery?: boolean
}

/** upsert 호출을 테이블별로 수집 */
type UpsertCall = { table: string; rows: unknown[] }

function makeFakeSupabase(config: FakeConfig, upsertCalls: UpsertCall[]): SupabaseClient {
  const {
    badges = [],
    earnedBadgeIds = [],
    history = [],
    existingFamilyProgress = [],
    breakBadgesQuery = false,
  } = config

  const from = (table: string) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      is: () => builder,
      // badges 조회 회귀 테스트용 — 의도적으로 .not()이 없는 스텁을 재현할 때만 undefined
      // (실제 구현이 badges 조회에서 던지는지 검증하는 용도, breakBadgesQuery 케이스 전용)
      not: breakBadgesQuery && table === 'badges' ? undefined : () => builder,
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
      upsert: async (rows: unknown[]) => {
        upsertCalls.push({ table, rows })
        return { error: null }
      },
      insert: async () => ({ error: null }),
      // 직접 await되는 경로(.maybeSingle()/.single()/.upsert()를 거치지 않는 조회) —
      // getActivityHistory·badges·user_activity_badges·user_family_progress(SELECT)가 여기로 온다.
      then(
        onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
        onRejected?: (e: unknown) => unknown
      ) {
        let payload: { data: unknown; error: unknown }
        switch (table) {
          case 'badges':
            // breakBadgesQuery면 위 not:undefined가 이 지점 도달 전에 이미 TypeError를 던진다
            payload = { data: badges, error: null }
            break
          case 'user_activity_badges':
            payload = { data: earnedBadgeIds.map((id) => ({ badge_id: id })), error: null }
            break
          case 'user_family_progress':
            payload = { data: existingFamilyProgress, error: null }
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

beforeEach(() => {
  vi.clearAllMocks()
})

describe('processFetchedActivities — 계열 진행 스냅샷 write-hook', () => {
  it('훅 내부 쿼리가 실패해도 processFetchedActivities는 정상 완료된다', async () => {
    const upsertCalls: UpsertCall[] = []
    const supabase = makeFakeSupabase({ breakBadgesQuery: true }, upsertCalls)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await processFetchedActivities(
      supabase,
      'user-1',
      'token',
      [makeRawActivity(1)],
      false,
      'sync'
    )

    expect(result).toBeDefined()
    expect(result.badges).toBe(0)
    // user_family_progress에는 아무것도 upsert되지 않는다(훅이 badges 조회에서 실패)
    expect(upsertCalls.filter((c) => c.table === 'user_family_progress')).toHaveLength(0)
    errorSpy.mockRestore()
  })

  it('프런티어(미획득 첫 등급)의 진행값을 계열 1건으로 upsert한다', async () => {
    const upsertCalls: UpsertCall[] = []
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
        earnedBadgeIds: [], // 아직 미획득 — 프런티어
        history: [
          makeHistoryActivity(101, '2026-08-01T00:00:00Z'),
          makeHistoryActivity(102, '2026-08-05T00:00:00Z'),
        ], // total_count 2/5
        existingFamilyProgress: [], // 최초 1회 — prev는 null
      },
      upsertCalls
    )

    await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    const familyUpserts = upsertCalls.filter((c) => c.table === 'user_family_progress')
    expect(familyUpserts).toHaveLength(1)
    const rows = familyUpserts[0].rows as FamilyProgressRow[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      user_id: 'user-1',
      activity_type: 'running',
      family_name: '테스트계열',
      progress: 0.4, // 2/5
      prev: null,
      last_activity_id: 'sa-latest-id',
    })
    expect(Array.isArray(rows[0].current)).toBe(true)
  })

  it('계열을 이미 전부 획득했으면 upsert하지 않는다', async () => {
    const upsertCalls: UpsertCall[] = []
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
        earnedBadgeIds: ['badge-common-1'], // 이미 획득 — 프런티어 없음
        history: [makeHistoryActivity(101, '2026-08-01T00:00:00Z')],
      },
      upsertCalls
    )

    await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(upsertCalls.filter((c) => c.table === 'user_family_progress')).toHaveLength(0)
  })

  it('직전 스냅샷의 current를 이번 prev로 그대로 옮긴다', async () => {
    const upsertCalls: UpsertCall[] = []
    const previousCurrent = [{ key: 'total_count', current: 1, target: 5, met: false, fraction: 0.2 }]
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
        earnedBadgeIds: [],
        history: [
          makeHistoryActivity(101, '2026-08-01T00:00:00Z'),
          makeHistoryActivity(102, '2026-08-05T00:00:00Z'),
        ],
        existingFamilyProgress: [
          { activity_type: 'running', family_name: '테스트계열', current: previousCurrent },
        ],
      },
      upsertCalls
    )

    await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    const rows = upsertCalls.find((c) => c.table === 'user_family_progress')!.rows as FamilyProgressRow[]
    expect(rows[0].prev).toEqual(previousCurrent)
    // prev는 옮겨졌을 뿐 이번 current(재계산값)와는 다른 객체다(새로 계산됐으므로 값 자체가 다름)
    expect(rows[0].current).not.toEqual(previousCurrent)
  })
})
