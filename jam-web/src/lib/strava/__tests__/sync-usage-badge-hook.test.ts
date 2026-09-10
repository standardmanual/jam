/**
 * strava/sync — JAM! 카테고리 서비스 사용량 배지(daily_sync_count) 훅 회귀 테스트
 * (티켓 20260910_1557)
 *
 * `processFetchedActivities()`가 함수 최상단의 `rawActivities.length === 0` 이른 반환을
 * 지난 뒤(= synced > 0)에만 `recordDailySyncAndEvaluate()`(usageBadges.ts)를 호출하고,
 * 그 결과를 `earnedBadgeIds`에 합류시키는지 고정한다. 실패 격리(try/catch)도 함께 본다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-usage-badge-hook.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StravaSummaryActivity } from '@/types/strava'

const { recordDailySyncAndEvaluateSpy } = vi.hoisted(() => ({
  recordDailySyncAndEvaluateSpy: vi.fn<
    (userId: string, client?: unknown) => Promise<{ id: string; name: string }[]>
  >(async () => []),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))
vi.mock('@/lib/drop-engine/index', () => ({ tryItemDrop: vi.fn(async () => []) }))
vi.mock('@/lib/badge-engine/index', () => ({ evaluateBadges: vi.fn(async () => []) }))
vi.mock('@/lib/badge-engine/usageBadges', () => ({
  recordDailySyncAndEvaluate: (userId: string, client: unknown) => recordDailySyncAndEvaluateSpy(userId, client),
}))
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

/** `badges` 조회까지 지원하는 최소 페이크 supabase — 그 외 테이블은 `{data:null}`로 폴백해도
 *  안전하다(getAbusingPolicy·updateFamilyProgressSnapshots는 모두 조회 실패 시 자체 폴백/흡수). */
function makeFakeSupabase(): SupabaseClient {
  const from = () => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      is: () => builder,
      not: () => builder,
      limit: () => builder,
      order: () => builder,
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      upsert: async () => ({ error: null }),
      insert: async () => ({ error: null }),
      then(
        onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
        onRejected?: (e: unknown) => unknown
      ) {
        return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected)
      },
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
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
    start_date: '2026-09-10T00:00:00Z',
    start_date_local: '2026-09-10T09:00:00',
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
    average_speed: 2.7,
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

beforeEach(() => {
  vi.clearAllMocks()
  recordDailySyncAndEvaluateSpy.mockResolvedValue([])
})

describe('processFetchedActivities — daily_sync_count 훅(synced>0)', () => {
  it('새 활동이 1건 이상이면 recordDailySyncAndEvaluate를 호출한다', async () => {
    await processFetchedActivities(makeFakeSupabase(), 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(recordDailySyncAndEvaluateSpy).toHaveBeenCalledTimes(1)
    expect(recordDailySyncAndEvaluateSpy.mock.calls[0][0]).toBe('user-1')
  })

  it('주입된 supabase 클라이언트를 그대로 넘긴다 — 새 service_role 클라이언트를 만들지 않는다', async () => {
    const injected = makeFakeSupabase()
    await processFetchedActivities(injected, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    // 위 최상단 vi.mock('@/lib/supabase/server')가 createServiceClient 호출 시 던지도록
    // 되어 있으므로, 여기까지 예외 없이 도달했다는 것 자체가 "새 클라이언트를 만들지
    // 않았다"는 증거다. 추가로 두 번째 인자가 주입된 그 객체와 동일한지도 확인한다.
    expect(recordDailySyncAndEvaluateSpy.mock.calls[0][1]).toBe(injected)
  })

  it('획득한 사용량 배지 id를 earnedBadgeIds에 합류시킨다', async () => {
    recordDailySyncAndEvaluateSpy.mockResolvedValueOnce([{ id: 'usage-badge-1', name: '동기화 배지' }])

    const result = await processFetchedActivities(
      makeFakeSupabase(),
      'user-1',
      'token',
      [makeRawActivity(1)],
      false,
      'sync'
    )

    expect(result.earnedBadgeIds).toContain('usage-badge-1')
  })

  it('recordDailySyncAndEvaluate가 예외를 던져도 processFetchedActivities는 정상 완료된다', async () => {
    recordDailySyncAndEvaluateSpy.mockRejectedValueOnce(new Error('DB 장애'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await processFetchedActivities(
      makeFakeSupabase(),
      'user-1',
      'token',
      [makeRawActivity(1)],
      false,
      'sync'
    )

    expect(result).toBeDefined()
    expect(result.earnedBadgeIds).toEqual([])
    errorSpy.mockRestore()
  })
})

describe('processFetchedActivities — synced=0(빈 배치)에서는 훅이 호출되지 않는다', () => {
  it('rawActivities가 빈 배열이면 recordDailySyncAndEvaluate를 호출하지 않는다', async () => {
    // 빈 배치는 함수 최상단 이른 반환으로 끝난다 — daily_sync_count 훅은 그 아래(정상 경로
    // 끝)에 있어 도달하지 않는다.
    await processFetchedActivities(makeFakeSupabase(), 'user-1', 'token', [], false, 'sync')
    expect(recordDailySyncAndEvaluateSpy).not.toHaveBeenCalled()
  })
})
