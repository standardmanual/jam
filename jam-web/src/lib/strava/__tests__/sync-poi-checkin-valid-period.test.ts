/**
 * POI 매칭 배지 발급 경로 — 유효기간(`badges.valid_from`/`valid_until`) 회귀 테스트 (티켓 20260930_0015)
 *
 * 체크인 배지는 배지 엔진이 아니라 `processFetchedActivities`의 POI 매칭 블록이 발급하는데,
 * 그 연결 배지 조회가 `deleted_at`만 거르고 유효기간을 보지 않아 기간 밖에도 발급됐다
 * (지도 마커만 기간을 걸러 "마커는 없는데 발급은 되는" 상태였다).
 * 체크인 최초 획득·반복 획득, 레거시 activity+`poi_id` 경로 모두 기간 밖이면 발급하지 않는다.
 *
 * 하네스는 sync-poi-checkin-shadow-ban.test.ts를 따른다. 그 파일은 usageBadges 모킹에
 * `evaluateCheckinUsageBadges`가 빠져 있어 오류 로그가 찍히므로, 여기서는 함께 모킹한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-poi-checkin-valid-period.test.ts
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

// POI 매칭 결과 — 테스트별로 override
let matchedPoisFixture: Array<{ id: string; name: string; linked_badge_id: string | null }> = []
vi.mock('@/lib/poi/matcher', () => ({
  matchPoisForActivity: vi.fn(async () => matchedPoisFixture),
}))

import { processFetchedActivities } from '../sync'

type Badge = {
  id: string
  type: 'checkin' | 'activity'
  name: string
  image_url: string | null
  rarity: BadgeRarity
  valid_from: string | null
  valid_until: string | null
}

type Insert = { table: string; payload: Record<string, unknown> }

// DB는 timestamptz를 `+00:00` 표기로 돌려준다 — 시각 값 비교(문자열 비교 아님)도 함께 고정한다.
const FUTURE = '2099-01-01T00:00:00+00:00'
const PAST = '2000-01-01T00:00:00+00:00'

function makeBadge(overrides: Partial<Badge> & Pick<Badge, 'id'>): Badge {
  return {
    type: 'checkin',
    name: '체크인 배지',
    image_url: null,
    rarity: 'rare',
    valid_from: null,
    valid_until: null,
    ...overrides,
  }
}

/** 테이블별 최소 동작을 흉내내는 페이크 supabase. */
function makeFakeSupabase(opts: {
  badges: Badge[]
  /** user_checkin_badge_earns 이전 획득 수(count) — 배지 id별 */
  priorCheckinCounts?: Record<string, number>
  inserts: Insert[]
}): SupabaseClient {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {
      select: (_cols?: string, selectOpts?: { count?: string; head?: boolean }) => {
        if (table === 'user_checkin_badge_earns' && selectOpts?.head) {
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

async function runSync(badge: Badge, opts: { priorCheckinCount?: number } = {}) {
  matchedPoisFixture = [{ id: `poi-${badge.id}`, name: '테스트 지점', linked_badge_id: badge.id }]
  const inserts: Insert[] = []
  const supabase = makeFakeSupabase({
    badges: [badge],
    priorCheckinCounts: opts.priorCheckinCount === undefined ? undefined : { [badge.id]: opts.priorCheckinCount },
    inserts,
  })
  const result = await processFetchedActivities(supabase, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')
  return { inserts, earnedBadgeIds: result.earnedBadgeIds }
}

beforeEach(() => {
  vi.clearAllMocks()
  matchedPoisFixture = []
})

describe('체크인 배지 발급 — 유효기간(최초 획득)', () => {
  it('valid_from이 지금보다 뒤(시작 전)면 발급하지 않는다', async () => {
    const badge = makeBadge({ id: 'ci-future', valid_from: FUTURE })
    const { inserts, earnedBadgeIds } = await runSync(badge)

    expect(inserts.some((i) => i.table === 'user_checkin_badge_earns')).toBe(false)
    expect(earnedBadgeIds).not.toContain(badge.id)
  })

  it('valid_until이 지금보다 앞(종료 후)이면 발급하지 않는다', async () => {
    const badge = makeBadge({ id: 'ci-expired', valid_until: PAST })
    const { inserts, earnedBadgeIds } = await runSync(badge)

    expect(inserts.some((i) => i.table === 'user_checkin_badge_earns')).toBe(false)
    expect(earnedBadgeIds).not.toContain(badge.id)
  })

  it('기간이 둘 다 NULL이면 종전대로 발급한다', async () => {
    const badge = makeBadge({ id: 'ci-open' })
    const { inserts, earnedBadgeIds } = await runSync(badge)

    expect(inserts.some((i) => i.table === 'user_checkin_badge_earns')).toBe(true)
    expect(earnedBadgeIds).toContain(badge.id)
  })

  it('기간 안(시작 후·종료 전)이면 발급한다', async () => {
    const badge = makeBadge({ id: 'ci-in-period', valid_from: PAST, valid_until: FUTURE })
    const { inserts, earnedBadgeIds } = await runSync(badge)

    expect(inserts.some((i) => i.table === 'user_checkin_badge_earns')).toBe(true)
    expect(earnedBadgeIds).toContain(badge.id)
  })
})

describe('체크인 배지 발급 — 유효기간(반복 획득)', () => {
  it('종료 후에는 이미 획득한 배지의 반복 방문도 막는다', async () => {
    const badge = makeBadge({ id: 'ci-expired-repeat', valid_until: PAST })
    const { inserts, earnedBadgeIds } = await runSync(badge, { priorCheckinCount: 3 })

    expect(inserts.some((i) => i.table === 'user_checkin_badge_earns')).toBe(false)
    expect(earnedBadgeIds).not.toContain(badge.id)
  })

  it('시작 전이면 반복 방문도 막는다', async () => {
    const badge = makeBadge({ id: 'ci-future-repeat', valid_from: FUTURE })
    const { inserts, earnedBadgeIds } = await runSync(badge, { priorCheckinCount: 1 })

    expect(inserts.some((i) => i.table === 'user_checkin_badge_earns')).toBe(false)
    expect(earnedBadgeIds).not.toContain(badge.id)
  })

  it('기간 안이면 반복 방문은 종전대로 발급한다', async () => {
    const badge = makeBadge({ id: 'ci-in-period-repeat', valid_from: PAST, valid_until: FUTURE })
    const { inserts, earnedBadgeIds } = await runSync(badge, { priorCheckinCount: 2 })

    expect(inserts.some((i) => i.table === 'user_checkin_badge_earns')).toBe(true)
    expect(earnedBadgeIds).toContain(badge.id)
  })
})

describe('레거시 activity+poi_id 배지 발급 — 유효기간', () => {
  it('valid_from이 지금보다 뒤면 user_activity_badges에 기록하지 않는다', async () => {
    const badge = makeBadge({ id: 'legacy-future', type: 'activity', valid_from: FUTURE })
    const { inserts, earnedBadgeIds } = await runSync(badge)

    expect(inserts.some((i) => i.table === 'user_activity_badges')).toBe(false)
    expect(earnedBadgeIds).not.toContain(badge.id)
  })

  it('valid_until이 지금보다 앞이면 user_activity_badges에 기록하지 않는다', async () => {
    const badge = makeBadge({ id: 'legacy-expired', type: 'activity', valid_until: PAST })
    const { inserts, earnedBadgeIds } = await runSync(badge)

    expect(inserts.some((i) => i.table === 'user_activity_badges')).toBe(false)
    expect(earnedBadgeIds).not.toContain(badge.id)
  })

  it('기간이 둘 다 NULL이면 종전대로 기록한다', async () => {
    const badge = makeBadge({ id: 'legacy-open', type: 'activity' })
    const { inserts, earnedBadgeIds } = await runSync(badge)

    expect(inserts.some((i) => i.table === 'user_activity_badges')).toBe(true)
    expect(earnedBadgeIds).toContain(badge.id)
  })
})
