/**
 * 체크인 배지 발급 — 처음 받을 때 포인트·공개 기간·방문 기록 중복 (티켓 20261018_1814, 운영 로직 11장)
 *
 * `processFetchedActivities`의 체크인 구간이
 *  - 공개 기간(활동 시작 시각 기준) 밖이면 방문 기록·포인트·피드를 모두 남기지 않고,
 *  - 방문 기록과 «처음인지» 판정을 `record_checkin_earn` 한 번으로 하며,
 *  - 처음 받을 때만 `badge.point_reward`를 `awardPoints`로 주고(다시 지나가면 방문 기록만),
 *  - 같은 활동을 다시 동기화해도(`duplicate`) 방문 기록·포인트·피드가 늘지 않고,
 *  - 포인트 지급이 실패해도 방문 기록·피드는 그대로 진행하는지 고정한다.
 * `record_checkin_earn` 자체의 규칙(잠금·중복)은 마이그레이션 241의 롤백 실측이 확인했다 — 여기서는 앱이 응답을 어떻게 쓰는지만 본다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-checkin-earn.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StravaSummaryActivity } from '@/types/strava'
import type { BadgeRarity } from '@/types/database'

const mocks = vi.hoisted(() => ({
  awardPoints: vi.fn<(userId: string, amount: number, reason: string, options?: unknown) => Promise<unknown>>(
    async () => ({ id: 'tx-1' })
  ),
  recordFeedEvent: vi.fn<(userId: string, type: string, metadata: Record<string, unknown>, at: string, activityId: number) => Promise<void>>(
    async () => {}
  ),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))
vi.mock('@/lib/drop-engine/syncIssueRun', () => ({ issueSyncItemBadges: vi.fn(async () => ({ issuedBadgeIds: [], pendingCount: 0 })) }))
vi.mock('@/lib/badge-engine/index', () => ({ evaluateBadges: vi.fn(async () => []) }))
vi.mock('@/lib/badge-engine/jamActionBadges', () => ({ evaluateJamActionBadges: vi.fn(async () => []) }))
vi.mock('@/lib/badge-engine/usageBadges', () => ({
  recordDailySyncAndEvaluate: vi.fn(async () => []),
  evaluateCheckinUsageBadges: vi.fn(async () => []),
}))
vi.mock('@/lib/itembook/checker', () => ({
  checkItemBookCompletion: vi.fn(async () => ({ completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] })),
}))
vi.mock('@/lib/itembook/completable', () => ({ findCompletableItemBooks: vi.fn(async () => []) }))
vi.mock('@/lib/missions/checker', () => ({
  checkMissions: vi.fn(async () => ({ completedMissionIds: [], awardedBadgeIds: [] })),
}))
vi.mock('@/lib/activity-feed', () => ({
  recordFeedEvent: (userId: string, type: string, metadata: Record<string, unknown>, at: string, activityId: number) =>
    mocks.recordFeedEvent(userId, type, metadata, at, activityId),
}))
vi.mock('@/lib/points', () => ({
  awardPoints: (userId: string, amount: number, reason: string, options?: unknown) =>
    mocks.awardPoints(userId, amount, reason, options),
}))
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

let matchedPoisFixture: Array<{ id: string; name: string; linked_badge_id: string | null }> = []
vi.mock('@/lib/poi/matcher', () => ({
  matchPoisForActivity: vi.fn(async () => matchedPoisFixture),
}))

import { processFetchedActivities } from '../sync'
import { makeRecordCheckinEarn, earnArgsToRow } from './fake-checkin-earn'

interface Badge {
  id: string
  type: 'checkin' | 'activity'
  name: string
  image_url: string | null
  rarity: BadgeRarity
  category: string | null
  valid_from: string | null
  valid_until: string | null
  point_reward: number
}

function makeBadge(overrides: Partial<Badge> = {}): Badge {
  return {
    id: 'badge-1',
    type: 'checkin',
    name: '북한산 체크인',
    image_url: null,
    rarity: 'rare',
    category: null,
    valid_from: null,
    valid_until: null,
    point_reward: 20,
    ...overrides,
  }
}

function makeFakeSupabase(opts: {
  badges: Badge[]
  /** 이 배지로 이미 가진 방문 기록 수 */
  priorCounts?: Record<string, number>
  inserts: { table: string; payload: Record<string, unknown> }[]
  rpcCalls?: Record<string, unknown>[]
}): SupabaseClient {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      is: () => builder,
      not: () => builder,
      order: () => builder,
      limit: () => builder,
      upsert: async () => ({ error: null }),
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      insert: async (payload: Record<string, unknown>) => {
        opts.inserts.push({ table, payload })
        return { error: null }
      },
      then(onFulfilled: (v: { data: unknown; error: unknown }) => unknown, onRejected?: (e: unknown) => unknown) {
        if (table === 'badges') return Promise.resolve({ data: opts.badges, error: null }).then(onFulfilled, onRejected)
        return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected)
      },
    }
    return builder
  }
  const recordEarn = makeRecordCheckinEarn(
    (a) => opts.inserts.push({ table: 'user_checkin_badge_earns', payload: earnArgsToRow(a) }),
    opts.priorCounts
  )
  const rpc = async (name: string, args: Record<string, unknown>) => {
    if (name !== 'record_checkin_earn') return { data: null, error: { message: `알 수 없는 rpc ${name}` } }
    opts.rpcCalls?.push(args)
    return recordEarn(args as never)
  }
  return { from, rpc } as unknown as SupabaseClient
}

function makeRawActivity(id: number, startDate = '2026-09-10T00:00:00Z'): StravaSummaryActivity {
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
    start_date: startDate,
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

type Inserts = { table: string; payload: Record<string, unknown> }[]
const earnRows = (inserts: Inserts) => inserts.filter((i) => i.table === 'user_checkin_badge_earns')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.awardPoints.mockResolvedValue({ id: 'tx-1' })
  matchedPoisFixture = [{ id: 'poi-1', name: '북한산', linked_badge_id: 'badge-1' }]
})

describe('체크인 — 처음 받을 때만 배지 등급 포인트', () => {
  it('처음 받으면 badge.point_reward를 배지 보상으로 한 번 준다', async () => {
    const inserts: Inserts = []
    const supabase = makeFakeSupabase({ badges: [makeBadge({ point_reward: 50 })], inserts })

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(earnRows(inserts)).toHaveLength(1)
    expect(mocks.awardPoints).toHaveBeenCalledTimes(1)
    expect(mocks.awardPoints).toHaveBeenCalledWith('user-1', 50, 'badge_point_reward', { sourceBadgeId: 'badge-1' })
    expect(result.earnedBadgeIds).toContain('badge-1')
    expect(mocks.recordFeedEvent.mock.calls[0]?.[2]).toMatchObject({ badge_id: 'badge-1', visit_count: 1 })
  })

  it('다시 지나가면 방문 기록과 피드만 남기고 포인트는 주지 않는다', async () => {
    const inserts: Inserts = []
    const supabase = makeFakeSupabase({ badges: [makeBadge()], priorCounts: { 'badge-1': 1 }, inserts })

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(earnRows(inserts)).toHaveLength(1)
    expect(mocks.awardPoints).not.toHaveBeenCalled()
    expect(result.earnedBadgeIds).toContain('badge-1')
    expect(mocks.recordFeedEvent.mock.calls[0]?.[2]).toMatchObject({ visit_count: 2 })
  })

  it('같은 동기화의 두 번째 활동은 방문 기록만 늘고 포인트는 첫 활동에서만 나간다', async () => {
    const inserts: Inserts = []
    const supabase = makeFakeSupabase({ badges: [makeBadge()], inserts })

    await processFetchedActivities(
      supabase,
      'user-1',
      'token',
      [makeRawActivity(1, '2026-09-10T00:00:00Z'), makeRawActivity(2, '2026-09-11T00:00:00Z')],
      false,
      'sync'
    )

    expect(earnRows(inserts)).toHaveLength(2)
    expect(mocks.awardPoints).toHaveBeenCalledTimes(1)
  })

  it('같은 활동을 다시 동기화(duplicate)해도 방문 기록·포인트·피드가 늘지 않는다', async () => {
    const inserts: Inserts = []
    const supabase = makeFakeSupabase({ badges: [makeBadge()], inserts })

    await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')
    const second = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(earnRows(inserts)).toHaveLength(1)
    expect(mocks.awardPoints).toHaveBeenCalledTimes(1)
    expect(mocks.recordFeedEvent).toHaveBeenCalledTimes(1)
    expect(second.earnedBadgeIds).not.toContain('badge-1')
  })

  it('포인트 지급이 실패(null)해도 방문 기록·피드는 그대로 진행한다', async () => {
    mocks.awardPoints.mockResolvedValue(null)
    const inserts: Inserts = []
    const supabase = makeFakeSupabase({ badges: [makeBadge()], inserts })

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(earnRows(inserts)).toHaveLength(1)
    expect(result.earnedBadgeIds).toContain('badge-1')
    expect(mocks.recordFeedEvent).toHaveBeenCalledTimes(1)
  })

  it('방문 기록 함수가 오류를 돌려주면 포인트·피드 없이 넘어간다', async () => {
    const inserts: Inserts = []
    const base = makeFakeSupabase({ badges: [makeBadge()], inserts })
    const supabase = {
      from: (t: string) => (base as unknown as { from: (t: string) => unknown }).from(t),
      rpc: async () => ({ data: null, error: { message: 'db down' } }),
    } as unknown as SupabaseClient

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(mocks.awardPoints).not.toHaveBeenCalled()
    expect(mocks.recordFeedEvent).not.toHaveBeenCalled()
    expect(result.earnedBadgeIds).not.toContain('badge-1')
  })
})

describe('체크인 — 공개 기간은 활동 시작 시각 기준이고 기간 밖은 없던 일이다', () => {
  it('활동이 공개 시작 전에 달렸으면 방문 기록·포인트·피드가 모두 없다', async () => {
    const inserts: Inserts = []
    const rpcCalls: Record<string, unknown>[] = []
    const supabase = makeFakeSupabase({ badges: [makeBadge({ valid_from: '2026-10-01T00:00:00Z' })], inserts, rpcCalls })

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(rpcCalls).toEqual([])
    expect(earnRows(inserts)).toEqual([])
    expect(mocks.awardPoints).not.toHaveBeenCalled()
    expect(mocks.recordFeedEvent).not.toHaveBeenCalled()
    expect(result.earnedBadgeIds).not.toContain('badge-1')
  })

  it('공개 기간이 끝난 뒤 동기화돼도 기간 안에 달린 활동은 인정된다', async () => {
    const inserts: Inserts = []
    // 활동은 2026-09-10, 기간은 9월 한 달 — 지금(2026-10-18)은 기간이 끝났다
    const badge = makeBadge({ valid_from: '2026-09-01T00:00:00Z', valid_until: '2026-09-30T23:59:59Z' })
    const supabase = makeFakeSupabase({ badges: [badge], inserts })

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(earnRows(inserts)).toHaveLength(1)
    expect(mocks.awardPoints).toHaveBeenCalledTimes(1)
    expect(result.earnedBadgeIds).toContain('badge-1')
  })

  it('기간 안 활동과 기간 밖 활동이 섞이면 기간 안 활동만 기록한다', async () => {
    const inserts: Inserts = []
    const badge = makeBadge({ valid_until: '2026-09-10T12:00:00Z' })
    const supabase = makeFakeSupabase({ badges: [badge], inserts })

    await processFetchedActivities(
      supabase,
      'user-1',
      'token',
      [makeRawActivity(1, '2026-09-10T00:00:00Z'), makeRawActivity(2, '2026-09-11T00:00:00Z')],
      false,
      'sync'
    )

    expect(earnRows(inserts).map((i) => i.payload.triggered_by_strava_id)).toEqual([1])
  })
})
