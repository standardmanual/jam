/**
 * POI·체크인 배지 발급 경로 — 섀도우밴을 읽지 않는다 (티켓 20261017_1426, 옛 티켓 20260910_1804를 대체)
 *
 * JAM 2.0의 제재는 이용 정지 하나다. `processFetchedActivities`의 POI 매칭 후 지급 블록(`type='checkin'` 반복 획득 경로)은
 * 예전에 섀도우밴 등급으로 발급을 막았지만 이제는 옛 밴을 읽지 않는다.
 * 옛 테이블 `user_shadow_bans`에 hard 밴이 남아 있어도 발급은 평소대로다.
 * 옛 `type='activity'`+`poi_id` 경로는 티켓 20261018_1814에서 지웠다 — 연결된 activity 타입 배지는 발급하지 않는다.
 *
 * 티켓 20261021_1250(6-4 2회)에서 `getUserBanLevel`과 밴 모듈을 지웠다. «옛 밴을 읽지 않는다»는 이제 모킹이 아니라 페이크 supabase가
 * `from()`으로 연 표 이름을 기록해 `user_shadow_bans`가 한 번도 열리지 않았는지로 고정한다(모든 시험이 끝난 뒤 확인). 옛 표에 hard 밴 행이
 * 있는 것처럼 흉내 내므로 코드가 다시 읽으면 열린 표에 남는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-poi-checkin-shadow-ban.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StravaSummaryActivity } from '@/types/strava'
import type { BadgeRarity } from '@/types/database'

/** 페이크 supabase가 `from()`으로 연 표 이름 — 옛 밴 표를 열지 않았는지 확인하는 데 쓴다 */
const opened: string[] = []

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
    opened.push(table)
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      is: () => builder,
      order: () => builder,
      limit: () => builder,
      upsert: async () => ({ error: null }),
      single: async () => ({ data: null, error: null }),
      // 옛 표에 hard 밴 행이 남아 있는 것처럼 흉내 낸다 — 코드가 읽으면 열린 표에 남는다
      maybeSingle: async () =>
        table === 'user_shadow_bans' ? { data: { ban_level: 'hard', expires_at: null }, error: null } : { data: null, error: null },
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
  opened.length = 0
  matchedPoisFixture = []
})

afterEach(() => {
  // 어느 시험이든 발급 경로가 옛 밴 표를 열었다면 여기서 실패한다
  expect(opened).not.toContain('user_shadow_bans')
})

describe('POI 체크인 배지 발급 — 섀도우밴을 읽지 않는다', () => {
  it('옛 표에 hard 밴이 남아 있어도 mystic 등급 체크인 배지를 정상 획득하고 옛 밴 표를 열지 않는다', async () => {
    const badge: Badge = { id: 'badge-1', type: 'checkin', name: '체크인 배지', image_url: null, rarity: 'mystic' }
    matchedPoisFixture = [{ id: 'poi-1', name: '북한산', linked_badge_id: badge.id }]
    const inserts: { table: string; payload: Record<string, unknown> }[] = []
    const supabase = makeFakeSupabase({ badges: [badge], inserts })

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(inserts.some((i) => i.table === 'user_checkin_badge_earns')).toBe(true)
    expect(result.earnedBadgeIds).toContain(badge.id)
    expect(opened).not.toContain('user_shadow_bans')
  })

  it('mystic 등급 체크인 배지를 정상 획득한다', async () => {
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
    const inserts: { table: string; payload: Record<string, unknown> }[] = []
    const supabase = makeFakeSupabase({ badges: [badge], inserts })

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(inserts.some((i) => i.table === 'user_checkin_badge_earns')).toBe(true)
    expect(result.earnedBadgeIds).toContain(badge.id)
  })
})

describe('장소에 연결된 액티비티 배지 — 옛 poi_match 경로가 없어 발급하지 않는다 (티켓 20261018_1814)', () => {
  it('옛 표에 hard 밴이 남아 있어도 연결된 activity 타입 배지는 발급하지 않고 옛 밴 표도 열지 않는다', async () => {
    const badge: Badge = { id: 'badge-5', type: 'activity', name: '레거시 배지', image_url: null, rarity: 'mystic' }
    matchedPoisFixture = [{ id: 'poi-5', name: '경복궁', linked_badge_id: badge.id }]
    const inserts: { table: string; payload: Record<string, unknown> }[] = []
    const supabase = makeFakeSupabase({ badges: [badge], inserts })

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(inserts.some((i) => i.table === 'user_activity_badges')).toBe(false)
    expect(inserts.some((i) => i.table === 'user_checkin_badge_earns')).toBe(false)
    expect(result.earnedBadgeIds).not.toContain(badge.id)
    expect(opened).not.toContain('user_shadow_bans')
  })

  it('연결된 activity 타입 배지는 발급하지 않는다', async () => {
    const badge: Badge = { id: 'badge-6', type: 'activity', name: '레거시 배지2', image_url: null, rarity: 'mystic' }
    matchedPoisFixture = [{ id: 'poi-6', name: '광화문', linked_badge_id: badge.id }]
    const inserts: { table: string; payload: Record<string, unknown> }[] = []
    const supabase = makeFakeSupabase({ badges: [badge], inserts })

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(inserts.some((i) => i.table === 'user_activity_badges')).toBe(false)
    expect(result.earnedBadgeIds).not.toContain(badge.id)
  })
})
