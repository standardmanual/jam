/**
 * POI·체크인 배지 발급 경로 — 섀도우밴 게이트 회귀 테스트 (티켓 20260910_1804)
 *
 * `processFetchedActivities`의 POI 매칭 후 지급 블록(`type='checkin'` 반복 획득 경로,
 * 레거시 `type='activity'`+`poi_id` 경로) 양쪽에 섀도우밴 게이트가 전혀 연결돼 있지
 * 않았다 — 참고 티켓 20260910_1719(액티비티 배지 경로)와 동일한 패턴(rarity 있는 배지만
 * 대상, 강등 없이 미발급)으로 연결한다.
 *
 * 체크인 반복 획득(2번째 이후 방문)은 카운터 증가와 동등해 게이트 대상에서 제외하고,
 * 최초 획득에만 적용한다는 정책 결정도 함께 고정한다.
 *
 * 모킹은 shadow-ban-gate.test.ts(getUserBanLevel만 모킹, shouldAllowDrop·DEFAULT_POLICY는
 * 실제 구현 사용)의 관례를 그대로 따른다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-poi-checkin-shadow-ban.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StravaSummaryActivity } from '@/types/strava'
import type { BadgeRarity } from '@/types/database'

const getUserBanLevelMock = vi.hoisted(() =>
  vi.fn<(userId: string) => Promise<'none' | 'soft' | 'hard'>>(async () => 'none')
)

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))
vi.mock('@/lib/drop-engine/index', () => ({ tryItemDrop: vi.fn(async () => []) }))
vi.mock('@/lib/badge-engine/index', () => ({ evaluateBadges: vi.fn(async () => []) }))
vi.mock('@/lib/badge-engine/usageBadges', () => ({
  recordDailySyncAndEvaluate: vi.fn(async () => []),
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
// getUserBanLevel만 모킹하고 shouldAllowDrop·DEFAULT_POLICY는 실제 구현을 쓴다 — rate
// 테이블이 결정론적이라(hard_mystic_rate=0.0) Math.random()에 기대지 않고도 고정할 수 있다.
vi.mock('@/lib/abusing/shadow-ban', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/abusing/shadow-ban')>()
  return { ...actual, getUserBanLevel: (userId: string) => getUserBanLevelMock(userId) }
})

// POI 매칭 결과 — 테스트별로 override
let matchedPoisFixture: Array<{ id: string; name: string; linked_badge_id: string | null }> = []
vi.mock('@/lib/poi/matcher', () => ({
  matchPoisForActivity: vi.fn(async () => matchedPoisFixture),
}))

import { processFetchedActivities } from '../sync'

type Badge = { id: string; type: 'checkin' | 'activity'; name: string; image_url: string | null; rarity: BadgeRarity }

/** 테이블별 최소 동작을 흉내내는 페이크 supabase. */
function makeFakeSupabase(opts: {
  badges: Badge[]
  /** user_checkin_badge_earns 이전 획득 수(count) — 배지 id별 */
  priorCheckinCounts?: Record<string, number>
  /** user_activity_badges 기존 보유 여부 — 배지 id별 */
  existingActivityBadges?: Record<string, boolean>
  inserts: { table: string; payload: Record<string, unknown> }[]
}): SupabaseClient {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {
      select: (_cols?: string, selectOpts?: { count?: string; head?: boolean }) => {
        if (table === 'user_checkin_badge_earns' && selectOpts?.head) {
          // eq().eq()로 이어지는 count 조회 체인
          let badgeId: string | undefined
          const chain = {
            eq: (col: string, val: string) => {
              if (col === 'badge_id') badgeId = val
              return chain
            },
            then: (onFulfilled: (v: { count: number; error: null }) => unknown) =>
              Promise.resolve({
                count: opts.priorCheckinCounts?.[badgeId ?? ''] ?? 0,
                error: null,
              }).then(onFulfilled),
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
      maybeSingle: async () => {
        if (table === 'user_activity_badges') {
          // 마지막에 걸린 badge_id는 추적하지 않으므로 existingActivityBadges의 값들 중 하나라도
          // true면 그 배지로 간주 — 테스트에서는 배지 1개씩만 다루므로 충분하다.
          const anyExisting = Object.values(opts.existingActivityBadges ?? {}).some(Boolean)
          return { data: anyExisting ? { id: 'existing-row' } : null, error: null }
        }
        return { data: null, error: null }
      },
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
  getUserBanLevelMock.mockResolvedValue('none')
  matchedPoisFixture = []
})

describe('POI 체크인 배지 발급 — 섀도우밴 게이트(최초 획득)', () => {
  it('hard 밴 유저는 mystic 등급 체크인 배지를 받지 못한다', async () => {
    const badge: Badge = { id: 'badge-1', type: 'checkin', name: '체크인 배지', image_url: null, rarity: 'mystic' }
    matchedPoisFixture = [{ id: 'poi-1', name: '북한산', linked_badge_id: badge.id }]
    getUserBanLevelMock.mockResolvedValue('hard')
    const inserts: { table: string; payload: Record<string, unknown> }[] = []
    const supabase = makeFakeSupabase({ badges: [badge], inserts })

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(inserts.some((i) => i.table === 'user_checkin_badge_earns')).toBe(false)
    expect(result.earnedBadgeIds).not.toContain(badge.id)
  })

  it('밴 없는 정상 유저는 mystic 등급 체크인 배지를 정상 획득한다', async () => {
    const badge: Badge = { id: 'badge-2', type: 'checkin', name: '체크인 배지2', image_url: null, rarity: 'mystic' }
    matchedPoisFixture = [{ id: 'poi-2', name: '남산', linked_badge_id: badge.id }]
    const inserts: { table: string; payload: Record<string, unknown> }[] = []
    const supabase = makeFakeSupabase({ badges: [badge], inserts })

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(inserts.some((i) => i.table === 'user_checkin_badge_earns')).toBe(true)
    expect(result.earnedBadgeIds).toContain(badge.id)
  })

  it('hard 밴 유저라도 반복 방문(2번째 체크인)은 카운터 증가로 취급해 차단하지 않는다', async () => {
    const badge: Badge = { id: 'badge-3', type: 'checkin', name: '체크인 배지3', image_url: null, rarity: 'mystic' }
    matchedPoisFixture = [{ id: 'poi-3', name: '한강', linked_badge_id: badge.id }]
    getUserBanLevelMock.mockResolvedValue('hard')
    const inserts: { table: string; payload: Record<string, unknown> }[] = []
    const supabase = makeFakeSupabase({
      badges: [badge],
      priorCheckinCounts: { 'badge-3': 1 }, // 이미 1회 획득 — 이번이 2번째 방문
      inserts,
    })

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(inserts.some((i) => i.table === 'user_checkin_badge_earns')).toBe(true)
    expect(result.earnedBadgeIds).toContain(badge.id)
  })

  it('rarity가 없는(레벨형) 체크인 배지는 밴과 무관하게 게이트 대상이 아니다', async () => {
    // DB CHECK 제약상 실사용에서는 rarity가 항상 존재하지만, 방어적으로 null 케이스도 통과 확인
    const badge = { id: 'badge-4', type: 'checkin' as const, name: '레벨형', image_url: null, rarity: null as unknown as BadgeRarity }
    matchedPoisFixture = [{ id: 'poi-4', name: '올림픽공원', linked_badge_id: badge.id }]
    getUserBanLevelMock.mockResolvedValue('hard')
    const inserts: { table: string; payload: Record<string, unknown> }[] = []
    const supabase = makeFakeSupabase({ badges: [badge], inserts })

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(inserts.some((i) => i.table === 'user_checkin_badge_earns')).toBe(true)
    expect(result.earnedBadgeIds).toContain(badge.id)
  })
})

describe('레거시 activity+poi_id 배지 발급 — 섀도우밴 게이트', () => {
  it('hard 밴 유저는 mystic 등급 레거시 POI 배지를 받지 못한다', async () => {
    const badge: Badge = { id: 'badge-5', type: 'activity', name: '레거시 배지', image_url: null, rarity: 'mystic' }
    matchedPoisFixture = [{ id: 'poi-5', name: '경복궁', linked_badge_id: badge.id }]
    getUserBanLevelMock.mockResolvedValue('hard')
    const inserts: { table: string; payload: Record<string, unknown> }[] = []
    const supabase = makeFakeSupabase({ badges: [badge], inserts })

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(inserts.some((i) => i.table === 'user_activity_badges')).toBe(false)
    expect(result.earnedBadgeIds).not.toContain(badge.id)
  })

  it('밴 없는 정상 유저는 레거시 POI 배지를 정상 획득한다', async () => {
    const badge: Badge = { id: 'badge-6', type: 'activity', name: '레거시 배지2', image_url: null, rarity: 'mystic' }
    matchedPoisFixture = [{ id: 'poi-6', name: '광화문', linked_badge_id: badge.id }]
    const inserts: { table: string; payload: Record<string, unknown> }[] = []
    const supabase = makeFakeSupabase({ badges: [badge], inserts })

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(inserts.some((i) => i.table === 'user_activity_badges')).toBe(true)
    expect(result.earnedBadgeIds).toContain(badge.id)
  })
})
