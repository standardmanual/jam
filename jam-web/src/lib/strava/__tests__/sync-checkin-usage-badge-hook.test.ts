/**
 * 체크인 배지 발급 직후 JAM! 카테고리 체크인 사용량 배지 훅 — 회귀 테스트 (티켓 20260914_1725)
 *
 * `processFetchedActivities`가 `user_checkin_badge_earns` insert 성공 직후
 * `evaluateCheckinUsageBadges()`를 호출해 그 결과를 `earnedBadgeIds`에 합류시키는지,
 * 그리고 그 호출이 예외를 던져도 체크인 배지 자체의 발급·응답 흐름이 계속 성공하는지
 * (AC11 — 격리)를 고정한다. 판정 로직 자체(카테고리·목록 계산)는
 * `usageBadges.ts`의 `usage-badges.test.ts`가 담당한다 — 이 파일은 «호출 위치·격리»만 본다.
 *
 * 모킹은 `sync-poi-checkin-shadow-ban.test.ts`의 관례를 그대로 따른다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-checkin-usage-badge-hook.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StravaSummaryActivity } from '@/types/strava'
import type { BadgeRarity } from '@/types/database'

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))
vi.mock('@/lib/drop-engine/index', () => ({ tryItemDrop: vi.fn(async () => []) }))
vi.mock('@/lib/badge-engine/index', () => ({ evaluateBadges: vi.fn(async () => []) }))

const evaluateCheckinUsageBadgesMock = vi.hoisted(() =>
  vi.fn<(userId: string, client?: unknown) => Promise<{ id: string; name: string }[]>>(async () => [])
)
vi.mock('@/lib/badge-engine/usageBadges', () => ({
  recordDailySyncAndEvaluate: vi.fn(async () => []),
  evaluateCheckinUsageBadges: (userId: string, client?: unknown) => evaluateCheckinUsageBadgesMock(userId, client),
}))
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
  getActivityStreams: vi.fn(async () => ({ route: [[37.5, 127.0]], velocitySmooth: [], time: [] })),
  getActivities: vi.fn(),
  refreshStravaToken: vi.fn(),
}))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: vi.fn(async () => {}) }))
vi.mock('@/lib/abusing/shadow-ban', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/abusing/shadow-ban')>()
  return { ...actual, getUserBanLevel: vi.fn(async () => 'none' as const) }
})

let matchedPoisFixture: Array<{ id: string; name: string; linked_badge_id: string | null }> = []
vi.mock('@/lib/poi/matcher', () => ({
  matchPoisForActivity: vi.fn(async () => matchedPoisFixture),
}))

import { processFetchedActivities } from '../sync'

type Badge = { id: string; type: 'checkin' | 'activity'; name: string; image_url: string | null; rarity: BadgeRarity }

function makeFakeSupabase(opts: {
  badges: Badge[]
  inserts: { table: string; payload: Record<string, unknown> }[]
}): SupabaseClient {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {
      select: (_cols?: string, selectOpts?: { count?: string; head?: boolean }) => {
        if (table === 'user_checkin_badge_earns' && selectOpts?.head) {
          const chain = {
            eq: () => chain,
            then: (onFulfilled: (v: { count: number; error: null }) => unknown) =>
              Promise.resolve({ count: 0, error: null }).then(onFulfilled),
          }
          return chain
        }
        return builder
      },
      eq: () => builder,
      in: () => builder,
      is: () => builder,
      order: () => builder,
      limit: () => builder,
      upsert: async () => ({ error: null }),
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      insert: async (payload: Record<string, unknown>) => {
        opts.inserts.push({ table, payload })
        return { error: null }
      },
      then(
        onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
        onRejected?: (e: unknown) => unknown
      ) {
        if (table === 'badges') {
          return Promise.resolve({ data: opts.badges, error: null }).then(onFulfilled, onRejected)
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

beforeEach(() => {
  vi.clearAllMocks()
  evaluateCheckinUsageBadgesMock.mockReset()
  evaluateCheckinUsageBadgesMock.mockResolvedValue([])
  matchedPoisFixture = []
})

describe('체크인 배지 발급 직후 evaluateCheckinUsageBadges 훅', () => {
  it('체크인 배지 insert 성공 직후 evaluateCheckinUsageBadges를 호출한다', async () => {
    const badge: Badge = { id: 'badge-1', type: 'checkin', name: '체크인 배지', image_url: null, rarity: 'common' }
    matchedPoisFixture = [{ id: 'poi-1', name: '성수역', linked_badge_id: badge.id }]
    const inserts: { table: string; payload: Record<string, unknown> }[] = []
    const supabase = makeFakeSupabase({ badges: [badge], inserts })

    await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(evaluateCheckinUsageBadgesMock).toHaveBeenCalledWith('user-1', supabase)
  })

  it('평가 결과로 발급된 배지가 earnedBadgeIds에 합류한다', async () => {
    const badge: Badge = { id: 'badge-1', type: 'checkin', name: '체크인 배지', image_url: null, rarity: 'common' }
    matchedPoisFixture = [{ id: 'poi-1', name: '성수역', linked_badge_id: badge.id }]
    const inserts: { table: string; payload: Record<string, unknown> }[] = []
    const supabase = makeFakeSupabase({ badges: [badge], inserts })
    evaluateCheckinUsageBadgesMock.mockResolvedValue([{ id: 'usage-badge-1', name: '지하철 마스터' }])

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(result.earnedBadgeIds).toContain('usage-badge-1')
  })

  it('평가가 예외를 던져도 체크인 배지 자체의 발급·응답 흐름은 정상 완료된다 (AC11 — 격리)', async () => {
    const badge: Badge = { id: 'badge-1', type: 'checkin', name: '체크인 배지', image_url: null, rarity: 'common' }
    matchedPoisFixture = [{ id: 'poi-1', name: '성수역', linked_badge_id: badge.id }]
    const inserts: { table: string; payload: Record<string, unknown> }[] = []
    const supabase = makeFakeSupabase({ badges: [badge], inserts })
    evaluateCheckinUsageBadgesMock.mockRejectedValue(new Error('예상 밖 오류'))

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    // 체크인 배지 자체는 정상 발급되고(응답이 끊기지 않고) 완료된다.
    expect(inserts.some((i) => i.table === 'user_checkin_badge_earns')).toBe(true)
    expect(result.earnedBadgeIds).toContain(badge.id)
  })
})
