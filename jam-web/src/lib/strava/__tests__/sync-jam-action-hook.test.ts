/**
 * strava/sync — JAM! 행동 지표(미션·컬렉션·가입 경과일·활동일·체크인 일수) 판정 훅 회귀 테스트
 * (티켓 20261001_0633, 상위 20260930_1456 ③)
 *
 * `processFetchedActivities()`가 동기화가 끝나는 자리에서 `evaluateJamActionBadges`를 부르는지 고정한다:
 *  - 새 활동이 1건 이상이면 1회, 인자는 (userId, 주 키 5개, 주입된 supabase)
 *  - 호출 순서: 활동 기록 upsert → recordDailySyncAndEvaluate → JAM! 판정 → 결산(recordActivityRecap)
 *  - 획득 id는 결산에 활동·사용량·JAM! id가 한 번에 실리고 earnedBadgeIds에 합류하며, 반환의 `badges` 수에는 없다
 *  - 판정이 던져도 동기화는 정상 완료된다, 체크인이 여러 건이어도 판정은 1회다
 *  - 새 활동이 0건이면 가입 경과일(['days_since_signup'])만 판정한다
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-jam-action-hook.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StravaSummaryActivity } from '@/types/strava'

const mocks = vi.hoisted(() => ({
  /** 호출 순서 기록 */
  order: [] as string[],
  evaluateJamActionBadges: vi.fn<
    (userId: string, triggers: readonly string[], client?: unknown) => Promise<{ id: string; name: string }[]>
  >(async () => []),
  evaluateBadges: vi.fn<(userId: string, activities: unknown[]) => Promise<string[]>>(async () => []),
  recordDailySyncAndEvaluate: vi.fn<(userId: string, client?: unknown) => Promise<{ id: string; name: string }[]>>(
    async () => []
  ),
  recordActivityRecap: vi.fn<(userId: string, payload: unknown) => Promise<void>>(async () => {}),
  matchedPois: [] as Array<{ id: string; name: string; linked_badge_id: string | null }>,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))
vi.mock('@/lib/drop-engine/index', () => ({ tryItemDrop: vi.fn(async () => []) }))
vi.mock('@/lib/badge-engine/index', () => ({
  evaluateBadges: (userId: string, activities: unknown[]) => mocks.evaluateBadges(userId, activities),
}))
vi.mock('@/lib/badge-engine/jamActionBadges', () => ({
  evaluateJamActionBadges: (userId: string, triggers: readonly string[], client?: unknown) => {
    mocks.order.push('jam')
    return mocks.evaluateJamActionBadges(userId, triggers, client)
  },
}))
vi.mock('@/lib/badge-engine/usageBadges', () => ({
  recordDailySyncAndEvaluate: (userId: string, client?: unknown) => {
    mocks.order.push('usage')
    return mocks.recordDailySyncAndEvaluate(userId, client)
  },
  evaluateCheckinUsageBadges: vi.fn(async () => []),
}))
vi.mock('@/lib/poi/matcher', () => ({ matchPoisForActivity: vi.fn(async () => mocks.matchedPois) }))
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
vi.mock('@/lib/notifications/recap', () => ({
  recordActivityRecap: (userId: string, payload: unknown) => {
    mocks.order.push('recap')
    return mocks.recordActivityRecap(userId, payload)
  },
}))
vi.mock('@/lib/notifications/batch/collections', () => ({ selectCompletableDrafts: vi.fn(() => []) }))
vi.mock('@/lib/strava/api', () => ({
  // 경로가 있어야 POI 매칭·체크인 루프가 돈다 (체크인이 여러 건인 시나리오가 쓴다)
  getActivityStreams: vi.fn(async () => ({ route: [[37.5, 127.0]], velocitySmooth: [], time: [] })),
  getActivities: vi.fn(),
  refreshStravaToken: vi.fn(),
}))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: vi.fn(async () => {}) }))
vi.mock('@/lib/abusing/shadow-ban', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/abusing/shadow-ban')>()
  return { ...actual, getUserBanLevel: vi.fn(async () => 'none' as const) }
})

import { processFetchedActivities } from '../sync'
import { JAM_EMPTY_SYNC_TRIGGERS, JAM_SYNC_TRIGGERS } from '@/lib/badge-engine/jamActionProgressTriggers'

/**
 * 최소 페이크 supabase — `strava_activities.upsert`는 호출 순서를 기록하고, `badges` 조회는 요청한 id마다
 * 행을 돌려준다(결산이 id로 배지 이름을 되읽는다). 그 외 테이블은 빈 결과로 폴백해도 안전하다.
 */
function makeFakeSupabase(): SupabaseClient {
  const from = (table: string) => {
    let inValues: string[] | null = null
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: (_col: string, vals: string[]) => {
        inValues = vals
        return builder
      },
      is: () => builder,
      not: () => builder,
      limit: () => builder,
      order: () => builder,
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      upsert: async () => {
        if (table === 'strava_activities') mocks.order.push('upsert')
        return { error: null }
      },
      insert: async () => ({ error: null }),
      then(onFulfilled: (v: { data: unknown; error: unknown }) => unknown, onRejected?: (e: unknown) => unknown) {
        if (table === 'badges' && inValues) {
          // id가 `checkin-`으로 시작하면 체크인 배지(POI 체크인 루프가 이 타입만 처리한다)
          const rows = inValues.map((id) => ({
            id,
            name: `배지 ${id}`,
            rarity: 'common',
            type: id.startsWith('checkin-') ? 'checkin' : 'activity',
            image_url: null,
          }))
          return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected)
        }
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

/** 결산(recordActivityRecap)에 실린 배지 id 목록 */
function recapBadgeIds(): string[][] {
  return mocks.recordActivityRecap.mock.calls.map(
    ([, payload]) => (payload as { activity_badges: { id: string }[] }).activity_badges.map((b) => b.id)
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.order.length = 0
  mocks.matchedPois = []
  mocks.evaluateJamActionBadges.mockReset()
  mocks.evaluateJamActionBadges.mockResolvedValue([])
  mocks.evaluateBadges.mockReset()
  mocks.evaluateBadges.mockResolvedValue([])
  mocks.recordDailySyncAndEvaluate.mockReset()
  mocks.recordDailySyncAndEvaluate.mockResolvedValue([])
  mocks.recordActivityRecap.mockReset()
  mocks.recordActivityRecap.mockResolvedValue(undefined)
})

describe('processFetchedActivities — 새 활동이 있는 동기화가 끝날 때 JAM! 행동 지표를 판정한다', () => {
  it('새 활동이 1건 이상이면 evaluateJamActionBadges를 1회 부른다 — 인자는 (userId, 주 키 5개, 주입된 supabase)', async () => {
    const injected = makeFakeSupabase()
    await processFetchedActivities(injected, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(mocks.evaluateJamActionBadges).toHaveBeenCalledTimes(1)
    const [userId, triggers, client] = mocks.evaluateJamActionBadges.mock.calls[0]
    expect(userId).toBe('user-1')
    expect([...triggers].sort()).toEqual(
      [
        'collection_complete_count',
        'days_since_signup',
        'mission_complete_count',
        'same_spot_checkin_days',
        'weekly_active_days',
      ].sort()
    )
    expect(triggers).toEqual(JAM_SYNC_TRIGGERS)
    // 주입된 클라이언트를 그대로 넘긴다 — 새 service_role 클라이언트를 만들지 않는다
    expect(client).toBe(injected)
  })

  it('호출 순서: 활동 기록 upsert → recordDailySyncAndEvaluate → JAM! 판정 → 결산', async () => {
    mocks.evaluateJamActionBadges.mockResolvedValueOnce([{ id: 'jam-1', name: 'JAM! 배지' }])

    await processFetchedActivities(makeFakeSupabase(), 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    const relevant = mocks.order.filter((step) => ['upsert', 'usage', 'jam', 'recap'].includes(step))
    expect(relevant).toEqual(['upsert', 'usage', 'jam', 'recap'])
  })

  it('획득 id가 합류한다 — 결산에는 활동·사용량·JAM! id가 한 번에 실리고 earnedBadgeIds에도 들어가며, badges 수에는 넣지 않는다', async () => {
    mocks.evaluateBadges.mockResolvedValueOnce(['activity-1'])
    mocks.recordDailySyncAndEvaluate.mockResolvedValueOnce([{ id: 'usage-1', name: '사용량 배지' }])
    mocks.evaluateJamActionBadges.mockResolvedValueOnce([
      { id: 'jam-1', name: '가입 100일' },
      { id: 'jam-2', name: '주 3일' },
    ])

    const result = await processFetchedActivities(makeFakeSupabase(), 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    // 결산은 한 행이다 — 세 종류의 배지가 한 호출에 함께 실린다
    expect(mocks.recordActivityRecap).toHaveBeenCalledTimes(1)
    expect(recapBadgeIds()).toEqual([['activity-1', 'usage-1', 'jam-1', 'jam-2']])
    expect(result.earnedBadgeIds).toEqual(['activity-1', 'usage-1', 'jam-1', 'jam-2'])
    // 반환의 badges 수는 활동 배지만 센다 — 사용량 배지와 같다
    expect(result.badges).toBe(1)
  })

  it('판정이 예외를 던져도 동기화는 정상 완료된다 — 다른 배지의 획득과 결산은 그대로다', async () => {
    mocks.evaluateBadges.mockResolvedValueOnce(['activity-1'])
    mocks.evaluateJamActionBadges.mockRejectedValueOnce(new Error('DB 장애'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await processFetchedActivities(makeFakeSupabase(), 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(result.earnedBadgeIds).toEqual(['activity-1'])
    expect(recapBadgeIds()).toEqual([['activity-1']])
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('체크인이 여러 건이어도 JAM! 판정은 1회다 — 체크인 루프 안에서 따로 부르지 않는다', async () => {
    mocks.matchedPois = [
      { id: 'poi-1', name: '성수역', linked_badge_id: 'checkin-badge-1' },
      { id: 'poi-2', name: '뚝섬', linked_badge_id: 'checkin-badge-2' },
    ]

    const result = await processFetchedActivities(
      makeFakeSupabase(),
      'user-1',
      'token',
      [makeRawActivity(1), makeRawActivity(2), makeRawActivity(3)],
      false,
      'sync'
    )

    // 체크인 루프가 실제로 돌았다 — 활동 3건 × POI 2곳이 체크인 배지로 기록됐다
    expect(result.earnedBadgeIds.filter((id) => id.startsWith('checkin-')).length).toBeGreaterThanOrEqual(2)
    expect(mocks.evaluateJamActionBadges).toHaveBeenCalledTimes(1)
  })
})

describe('processFetchedActivities — 새 활동이 없는 동기화(빈 배치)는 가입 경과일만 판정한다', () => {
  it("evaluateJamActionBadges를 ['days_since_signup']로 1회 부른다 — 주 키 나머지는 다시 보지 않는다", async () => {
    const injected = makeFakeSupabase()
    await processFetchedActivities(injected, 'user-1', 'token', [], false, 'sync')

    expect(mocks.evaluateJamActionBadges).toHaveBeenCalledTimes(1)
    const [userId, triggers, client] = mocks.evaluateJamActionBadges.mock.calls[0]
    expect(userId).toBe('user-1')
    expect(triggers).toEqual(['days_since_signup'])
    expect(triggers).toEqual(JAM_EMPTY_SYNC_TRIGGERS)
    expect(client).toBe(injected)
  })

  it('획득 id가 결산과 earnedBadgeIds에 합류하고 badges 수에는 없다', async () => {
    mocks.evaluateBadges.mockResolvedValueOnce(['activity-1'])
    mocks.evaluateJamActionBadges.mockResolvedValueOnce([{ id: 'jam-1', name: '가입 100일' }])

    const result = await processFetchedActivities(makeFakeSupabase(), 'user-1', 'token', [], false, 'sync')

    expect(recapBadgeIds()).toEqual([['activity-1', 'jam-1']])
    expect(result.earnedBadgeIds).toEqual(['activity-1', 'jam-1'])
    expect(result.badges).toBe(1)
  })

  it('JAM! 판정이 던져도 빈 배치 동기화는 정상 완료된다', async () => {
    mocks.evaluateBadges.mockResolvedValueOnce(['activity-1'])
    mocks.evaluateJamActionBadges.mockRejectedValueOnce(new Error('DB 장애'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await processFetchedActivities(makeFakeSupabase(), 'user-1', 'token', [], false, 'sync')

    expect(result.earnedBadgeIds).toEqual(['activity-1'])
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('사용량 배지(recordDailySyncAndEvaluate)는 빈 배치에서 여전히 부르지 않는다', async () => {
    await processFetchedActivities(makeFakeSupabase(), 'user-1', 'token', [], false, 'sync')
    expect(mocks.recordDailySyncAndEvaluate).not.toHaveBeenCalled()
  })
})
