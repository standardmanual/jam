/**
 * POI·체크인 배지 발급 경로 — 섀도우밴을 읽지 않는다 (티켓 20261017_1426, 옛 티켓 20260910_1804를 대체)
 *
 * JAM 2.0의 제재는 이용 정지 하나다. `processFetchedActivities`의 POI 매칭 후 지급 블록(`type='checkin'` 반복 획득 경로)은
 * 예전에 섀도우밴 등급으로 발급을 막았지만 이제는 `getUserBanLevel`을 부르지 않는다.
 * 옛 테이블 `user_shadow_bans`에 hard 밴이 남아 있어도 발급은 평소대로다.
 * 옛 `type='activity'`+`poi_id` 경로는 티켓 20261018_1814에서 지웠다 — 연결된 activity 타입 배지는 발급하지 않는다.
 *
 * `getUserBanLevel` 모킹은 «불리지 않음»을 고정하려고 남겼다.
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
vi.mock('@/lib/drop-engine/syncIssueRun', () => ({ issueSyncItemBadges: vi.fn(async () => ({ issuedBadgeIds: [], pendingCount: 0 })) }))
vi.mock('@/lib/badge-engine/index', () => ({ evaluateBadges: vi.fn(async () => []) }))
vi.mock('@/lib/badge-engine/jamActionBadges', () => ({ evaluateJamActionBadges: vi.fn(async () => []) })) // JAM! 행동 지표 판정은 sync-jam-action-hook.test.ts가 따로 확인한다 (티켓 20261001_0633)
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
vi.mock('@/lib/points', () => ({ awardPoints: vi.fn(async () => null) })) // 처음 받을 때 포인트는 sync-checkin-earn.test.ts가 확인한다
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
import { makeRecordCheckinEarn, earnArgsToRow } from './fake-checkin-earn'

type Badge = { id: string; type: 'checkin' | 'activity'; name: string; image_url: string | null; rarity: BadgeRarity }

/** 테이블별 최소 동작을 흉내내는 페이크 supabase. */
function makeFakeSupabase(opts: {
  badges: Badge[]
  /** 이 배지로 이미 가진 방문 기록 수 — record_checkin_earn이 방문 수 계산에 쓴다 */
  priorCheckinCounts?: Record<string, number>
  inserts: { table: string; payload: Record<string, unknown> }[]
}): SupabaseClient {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
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
          // 공개 기간 없음·포인트 10 — 체크인 발급 판정이 읽는 칸의 기본값
          const rows = opts.badges.map((b) => ({ valid_from: null, valid_until: null, point_reward: 10, ...b }))
          return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected)
        }
        return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected)
      },
    }
    return builder
  }
  // 체크인 방문 기록 함수(record_checkin_earn)는 DB 규칙대로 흉내 내고 insert 자리에 기록한다
  const recordEarn = makeRecordCheckinEarn(
    (a) => opts.inserts.push({ table: 'user_checkin_badge_earns', payload: earnArgsToRow(a) }),
    opts.priorCheckinCounts
  )
  const rpc = async (name: string, args: Record<string, unknown>) =>
    name === 'record_checkin_earn' ? recordEarn(args as never) : { data: null, error: { message: `알 수 없는 rpc ${name}` } }
  return { from, rpc } as unknown as SupabaseClient
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

describe('POI 체크인 배지 발급 — 섀도우밴을 읽지 않는다', () => {
  it('hard 밴이 남아 있어도 mystic 등급 체크인 배지를 정상 획득하고 밴 조회를 하지 않는다', async () => {
    const badge: Badge = { id: 'badge-1', type: 'checkin', name: '체크인 배지', image_url: null, rarity: 'mystic' }
    matchedPoisFixture = [{ id: 'poi-1', name: '북한산', linked_badge_id: badge.id }]
    getUserBanLevelMock.mockResolvedValue('hard')
    const inserts: { table: string; payload: Record<string, unknown> }[] = []
    const supabase = makeFakeSupabase({ badges: [badge], inserts })

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(inserts.some((i) => i.table === 'user_checkin_badge_earns')).toBe(true)
    expect(result.earnedBadgeIds).toContain(badge.id)
    expect(getUserBanLevelMock).not.toHaveBeenCalled()
  })

  it('밴 없는 유저도 mystic 등급 체크인 배지를 정상 획득한다', async () => {
    const badge: Badge = { id: 'badge-2', type: 'checkin', name: '체크인 배지2', image_url: null, rarity: 'mystic' }
    matchedPoisFixture = [{ id: 'poi-2', name: '남산', linked_badge_id: badge.id }]
    const inserts: { table: string; payload: Record<string, unknown> }[] = []
    const supabase = makeFakeSupabase({ badges: [badge], inserts })

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(inserts.some((i) => i.table === 'user_checkin_badge_earns')).toBe(true)
    expect(result.earnedBadgeIds).toContain(badge.id)
  })

  it('반복 방문(2번째 체크인)도 정상 획득한다', async () => {
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

  it('rarity가 없는(레벨형) 체크인 배지도 정상 획득한다', async () => {
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

describe('장소에 연결된 액티비티 배지 — 옛 poi_match 경로가 없어 발급하지 않는다 (티켓 20261018_1814)', () => {
  it('hard 밴이 남아 있어도 연결된 activity 타입 배지는 발급하지 않고 밴 조회도 하지 않는다', async () => {
    const badge: Badge = { id: 'badge-5', type: 'activity', name: '레거시 배지', image_url: null, rarity: 'mystic' }
    matchedPoisFixture = [{ id: 'poi-5', name: '경복궁', linked_badge_id: badge.id }]
    getUserBanLevelMock.mockResolvedValue('hard')
    const inserts: { table: string; payload: Record<string, unknown> }[] = []
    const supabase = makeFakeSupabase({ badges: [badge], inserts })

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(inserts.some((i) => i.table === 'user_activity_badges')).toBe(false)
    expect(inserts.some((i) => i.table === 'user_checkin_badge_earns')).toBe(false)
    expect(result.earnedBadgeIds).not.toContain(badge.id)
    expect(getUserBanLevelMock).not.toHaveBeenCalled()
  })

  it('밴 없는 유저도 연결된 activity 타입 배지는 발급하지 않는다', async () => {
    const badge: Badge = { id: 'badge-6', type: 'activity', name: '레거시 배지2', image_url: null, rarity: 'mystic' }
    matchedPoisFixture = [{ id: 'poi-6', name: '광화문', linked_badge_id: badge.id }]
    const inserts: { table: string; payload: Record<string, unknown> }[] = []
    const supabase = makeFakeSupabase({ badges: [badge], inserts })

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(inserts.some((i) => i.table === 'user_activity_badges')).toBe(false)
    expect(result.earnedBadgeIds).not.toContain(badge.id)
  })
})
