/**
 * 기존 유저 재평가 배치의 사용량 지표 6종 확장 테스트 (티켓 20261001_1022, 상위 20260930_1456)
 *
 * 검증 대상:
 *  ① dry-run: 대상 유저 수·사용량 영향 유저 수·사용량 포인트 합계를 돌려주고, insert·포인트·피드를 한 번도 쓰지 않는다
 *     (섀도우밴 차단은 dry-run에도 반영된다)
 *  ② 실제 실행: 조건을 채운 유저에게만 한 번씩 발급하고 포인트는 지급하며 피드는 만들지 않는다. `triggered_by`에
 *     `catalog_reevaluation:` 접두가 붙는다
 *  ③ 다시 실행: 이미 보유한 배지는 다시 발급하지 않는다
 *  ④ 동기화 2종은 과거 기록 기준: 오늘 동기화하지 않아도 지난 기록의 최대 하루 횟수·가장 긴 연속으로 판정한다
 *  ⑤ 후보 배지가 없는 지표는 값 조회를 하지 않는다
 *  ⑥ 같은 배지를 한 번만 센다(지표 키 둘·JAM! 키와 사용량 키 겹침)
 *  ⑦ 오류는 삼키지 않고 `error`에 남기며, 던지기 전에 발급한 배지는 결과에 남는다
 *
 * 메인 엔진(`evaluateBadgesDetailed`)은 모킹하고 JAM!·사용량 경로(`evaluateJamActionBadges`·
 * `reevaluateUsageMetricBadges` → `issueQualifyingBadges`)는 실제 코드를 탄다. 테이블 모킹은
 * `reevaluate-catalog-jam.test.ts`와 같은 방식(메모리 테이블에 `eq`·`in` 적용)이다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/reevaluate-catalog-usage.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BadgeRow } from '@/types/database'

function makeBadge(overrides: Partial<BadgeRow>): BadgeRow {
  return {
    id: `badge-${Math.random()}`,
    name: 'Test Badge',
    description: '',
    type: 'activity',
    rarity: 'common',
    level: null,
    family_key: null,
    sort_order: 0,
    image_url: null,
    condition_json: {},
    activity_types: [],
    patch_available: false,
    patch_price_krw: null,
    tribe_id: null,
    item_book_id: null,
    category: null,
    admin_category: null,
    show_on_map: true,
    drop_weight: 0,
    drop_excluded: false,
    drop_condition_json: null,
    valid_from: null,
    valid_until: null,
    point_reward: 0,
    deleted_at: null,
    created_at: '2026-01-01T00:00:00Z',
    background_color: null,
    background_shader_id: null,
    background_image_url: null,
    background_video_url: null,
    background_animation: null,
    image_gen_params: null,
    image_source: null,
    ...overrides,
  }
}

// ── 모킹 ─────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  /** 메모리 테이블 — `eq`·`in` 필터를 실제로 적용한다 */
  tables: {} as Record<string, Row[]>,
  /** 테이블별 n번째(1부터) 조회를 «거부(reject)»로 만든다 — 예기치 못한 예외 주입용 */
  rejects: {} as Record<string, (nth: number) => Error | undefined>,
  /** 테이블 조회가 `{ error }`를 돌려주게 한다 — supabase-js가 던지지 않고 오류를 돌려주는 경우 */
  errors: {} as Record<string, string>,
  /** 조회 실행 횟수 기록 */
  queried: [] as string[],
  /** `user_activity_badges.insert` 페이로드 기록 */
  inserts: [] as { user_id: string; badge_id: string; triggered_by: string }[],
}))

const getUserBanLevelMock = vi.hoisted(() =>
  vi.fn<(userId: string) => Promise<'none' | 'soft' | 'hard'>>(async () => 'none')
)
const evaluateBadgesDetailedMock = vi.hoisted(() => vi.fn())
const awardPointsMock = vi.hoisted(() => vi.fn(async () => null))
const recordFeedEventMock = vi.hoisted(() => vi.fn(async () => {}))

function resetState() {
  state.tables = {
    badges: [],
    user_activity_badges: [],
    user_follows: [],
    user_daily_sync_counts: [],
    user_checkin_badge_earns: [],
    poi: [],
    user_combine_success_logs: [],
    user_combine_fail_logs: [],
  }
  state.rejects = {}
  state.errors = {}
  state.queried = []
  state.inserts = []
}

function mockSupabase(): SupabaseClient {
  const from = (table: string) => {
    const eqs: [string, unknown][] = []
    const ins: [string, unknown[]][] = []
    let head = false
    const builder: Record<string, unknown> = {}
    builder.select = (_cols: string, opts?: { head?: boolean }) => {
      head = Boolean(opts?.head)
      return builder
    }
    builder.eq = (col: string, val: unknown) => {
      eqs.push([col, val])
      return builder
    }
    builder.in = (col: string, vals: unknown[]) => {
      ins.push([col, vals])
      return builder
    }
    builder.is = () => builder
    builder.or = () => builder
    builder.order = () => builder
    builder.limit = () => builder
    builder.insert = (payload: { user_id: string; badge_id: string; triggered_by: string }) => {
      if (table !== 'user_activity_badges') return Promise.resolve({ data: null, error: null })
      const owned = state.tables.user_activity_badges
      // UNIQUE(user_id, badge_id) — 이미 보유한 배지의 INSERT는 23505로 떨어진다
      if (owned.some((r) => r.user_id === payload.user_id && r.badge_id === payload.badge_id)) {
        return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } })
      }
      owned.push({ user_id: payload.user_id, badge_id: payload.badge_id })
      state.inserts.push(payload)
      return Promise.resolve({ data: null, error: null })
    }
    builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
      state.queried.push(table)
      const nth = state.queried.filter((t) => t === table).length
      const rejection = state.rejects[table]?.(nth)
      if (rejection) return Promise.reject(rejection).then(resolve, reject)
      if (state.errors[table]) {
        return Promise.resolve({ data: null, count: null, error: { message: state.errors[table] } }).then(resolve, reject)
      }
      const rows = (state.tables[table] ?? []).filter(
        (r) => eqs.every(([c, v]) => r[c] === v) && ins.every(([c, v]) => v.includes(r[c]))
      )
      return Promise.resolve(
        head ? { data: null, count: rows.length, error: null } : { data: rows, error: null }
      ).then(resolve, reject)
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => mockSupabase() }))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: recordFeedEventMock }))
vi.mock('@/lib/points', () => ({ awardPoints: awardPointsMock }))
vi.mock('../index', () => ({ evaluateBadgesDetailed: evaluateBadgesDetailedMock }))
vi.mock('@/lib/abusing/shadow-ban', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/abusing/shadow-ban')>()
  return { ...actual, getUserBanLevel: (userId: string) => getUserBanLevelMock(userId) }
})
vi.mock('@/lib/abusing/policy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/abusing/policy')>()
  return { ...actual, getAbusingPolicy: vi.fn(async () => actual.DEFAULT_POLICY) }
})

import { reevaluateUsersForCatalog } from '../reevaluateCatalog'
import { calcCurrentSyncStreakDays } from '../dailySyncStreak'

const U_ALL = 'user-all' // 사용량 지표 6종을 모두 채운 유저
const U_NONE = 'user-none' // 어느 지표도 못 채운 유저
const U_OWNER = 'user-owner' // 팔로워 조건을 채웠지만 그 배지를 이미 보유한 유저

const FOLLOWERS = makeBadge({ id: 'u-followers', name: '인기쟁이', point_reward: 30, condition_json: { follower_count: 3 } })
const FOLLOWING = makeBadge({ id: 'u-following', name: '팔로잉러', point_reward: 20, condition_json: { following_count: 2 } })
const SYNC_COUNT = makeBadge({ id: 'u-sync-count', name: '부지런한 동기화', point_reward: 10, condition_json: { daily_sync_count: 5 } })
const STREAK = makeBadge({ id: 'u-streak', name: '이레 연속', point_reward: 70, condition_json: { daily_sync_streak_days: 7 } })
const CHECKIN_CAT = makeBadge({
  id: 'u-checkin-cat',
  name: '카페 순례',
  point_reward: 100,
  condition_json: { checkin_category_count: { category: 'cafe', count: 2 } },
})
const CHECKIN_LIST = makeBadge({
  id: 'u-checkin-list',
  name: '카페 두 곳',
  point_reward: 200,
  condition_json: { checkin_badge_count: { checkin_badge_names: ['카페A', '카페B'], count: 2 } },
})
const ALL_USAGE_BADGES = [FOLLOWERS, FOLLOWING, SYNC_COUNT, STREAK, CHECKIN_CAT, CHECKIN_LIST]
/** 위 6개 배지 포인트 합계 — 30 + 20 + 10 + 70 + 100 + 200 */
const ALL_USAGE_POINTS = 430

const MAIN_BADGE = makeBadge({ id: 'main-badge', name: '러너', point_reward: 10, condition_json: {} })

const day = (n: number) => `2026-01-${String(n).padStart(2, '0')}`
function addSyncRow(userId: string, syncDate: string, count: number) {
  state.tables.user_daily_sync_counts.push({ user_id: userId, sync_date: syncDate, count })
}
function addFollowers(targetUserId: string, count: number) {
  for (let i = 0; i < count; i++) state.tables.user_follows.push({ follower_id: `fan-${i}`, following_id: targetUserId })
}
function addFollowing(userId: string, count: number) {
  for (let i = 0; i < count; i++) state.tables.user_follows.push({ follower_id: userId, following_id: `idol-${i}` })
}

/** 사용량 지표 6종 카탈로그와 유저 3명(U_ALL·U_NONE·U_OWNER)을 심는다 */
function seedCatalogAndUsers() {
  state.tables.badges = [
    ...ALL_USAGE_BADGES,
    MAIN_BADGE,
    makeBadge({ id: 'ck-a', name: '카페A', type: 'checkin', rarity: null, category: 'cafe' }),
    makeBadge({ id: 'ck-b', name: '카페B', type: 'checkin', rarity: null, category: 'cafe' }),
  ] as unknown as Row[]

  // U_ALL — 팔로워 3·팔로잉 2, 지난 1월 7일 연속 동기화(3일에 5회), 체크인 카페 2곳
  addFollowers(U_ALL, 3)
  addFollowing(U_ALL, 2)
  for (let d = 1; d <= 7; d++) addSyncRow(U_ALL, day(d), d === 3 ? 5 : 1)
  state.tables.user_checkin_badge_earns.push({ user_id: U_ALL, badge_id: 'ck-a' }, { user_id: U_ALL, badge_id: 'ck-b' })

  // U_NONE — 팔로워 1, 이틀 동기화(하루 최대 1회), 체크인 없음
  addFollowers(U_NONE, 1)
  addSyncRow(U_NONE, day(1), 1)
  addSyncRow(U_NONE, day(2), 1)

  // U_OWNER — 팔로워 3, 그 배지를 이미 보유
  addFollowers(U_OWNER, 3)
  state.tables.user_activity_badges.push({ user_id: U_OWNER, badge_id: FOLLOWERS.id })
}

/** 메인 엔진 모킹 — 대상 유저 중 `grantMainTo`에게만 메인 배지 1개를 «받게 한다» */
function mockMainEngine(grantMainTo: string[] = []) {
  evaluateBadgesDetailedMock.mockImplementation(async (userId: string) => ({
    earned: grantMainTo.includes(userId) ? [{ id: MAIN_BADGE.id, name: MAIN_BADGE.name }] : [],
    counted: [],
  }))
}

const ALL_USERS = [U_ALL, U_NONE, U_OWNER]

beforeEach(() => {
  resetState()
  vi.clearAllMocks()
  getUserBanLevelMock.mockResolvedValue('none')
  seedCatalogAndUsers()
  mockMainEngine()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ═══════════════════════════════════════════════════════════════════════
// ① dry-run
// ═══════════════════════════════════════════════════════════════════════

describe('재평가 dry-run — 사용량 지표', () => {
  it('대상 유저 수·사용량 영향 유저 수·사용량 포인트 합계를 돌려주고 아무것도 쓰지 않는다', async () => {
    const result = await reevaluateUsersForCatalog(mockSupabase(), { dryRun: true, userIds: ALL_USERS })

    expect(result.dryRun).toBe(true)
    expect(result.targetUserCount).toBe(3)
    // 사용량 몫 — 6종을 모두 채우고 아직 보유하지 않은 U_ALL 한 명뿐이다(U_OWNER는 이미 보유, U_NONE은 미충족)
    expect(result.usageMetricAffectedUserCount).toBe(1)
    expect(result.totalUsageMetricBadgesIssued).toBe(6)
    expect(result.totalUsageMetricPointsAwarded).toBe(ALL_USAGE_POINTS)
    // JAM! 몫은 따로 센다 — 사용량 배지는 거기 들어가지 않는다
    expect(result.totalJamActionBadgesIssued).toBe(0)
    // 전체 합계에는 사용량 몫이 이미 들어 있다
    expect(result.affectedUserCount).toBe(1)
    expect(result.totalBadgesIssued).toBe(6)
    expect(result.totalPointsAwarded).toBe(ALL_USAGE_POINTS)

    const all = result.users.find((u) => u.userId === U_ALL)!
    expect(all.earnedBadgeIds).toEqual(ALL_USAGE_BADGES.map((b) => b.id))
    expect(all.usageMetricEarnedCount).toBe(6)
    expect(all.usageMetricPointsAwarded).toBe(ALL_USAGE_POINTS)
    expect(all.pointsAwarded).toBe(ALL_USAGE_POINTS)
    expect(result.users.find((u) => u.userId === U_NONE)!.usageMetricEarnedCount).toBe(0)
    expect(result.users.find((u) => u.userId === U_OWNER)!.usageMetricEarnedCount).toBe(0)

    // 쓰기는 하나도 없다
    expect(state.inserts).toEqual([])
    expect(state.tables.user_activity_badges).toEqual([{ user_id: U_OWNER, badge_id: FOLLOWERS.id }])
    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(recordFeedEventMock).not.toHaveBeenCalled()
  })

  it('섀도우밴 차단은 dry-run 숫자에도 반영된다', async () => {
    getUserBanLevelMock.mockResolvedValue('hard')
    state.tables.badges = [
      makeBadge({ id: 'u-mystic', name: '신화 인기쟁이', rarity: 'mystic', point_reward: 500, condition_json: { follower_count: 1 } }),
      FOLLOWERS,
    ] as unknown as Row[]

    const result = await reevaluateUsersForCatalog(mockSupabase(), { dryRun: true, userIds: [U_ALL] })

    // mystic 등급형은 hard 밴에서 차단되므로 «받게 될 배지»에 들어가지 않는다 — common FOLLOWERS만 남는다
    const user = result.users[0]
    expect(user.earnedBadgeIds).toEqual([FOLLOWERS.id])
    expect(result.totalUsageMetricPointsAwarded).toBe(30)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ② 실제 실행
// ═══════════════════════════════════════════════════════════════════════

describe('재평가 실제 실행 — 사용량 지표', () => {
  it('조건을 채운 유저에게만 한 번씩 발급하고 포인트는 지급하며 피드는 만들지 않는다', async () => {
    const result = await reevaluateUsersForCatalog(mockSupabase(), { dryRun: false, userIds: ALL_USERS })

    expect(result.dryRun).toBe(false)
    expect(result.usageMetricAffectedUserCount).toBe(1)
    expect(result.totalUsageMetricBadgesIssued).toBe(6)
    expect(result.totalUsageMetricPointsAwarded).toBe(ALL_USAGE_POINTS)

    // U_ALL에게만 6건 — `triggered_by`에 재평가 접두가 붙는다(자연 발급과 구분)
    expect(state.inserts).toEqual([
      { user_id: U_ALL, badge_id: FOLLOWERS.id, triggered_by: 'catalog_reevaluation:usage_metric:follower_count' },
      { user_id: U_ALL, badge_id: FOLLOWING.id, triggered_by: 'catalog_reevaluation:usage_metric:following_count' },
      { user_id: U_ALL, badge_id: SYNC_COUNT.id, triggered_by: 'catalog_reevaluation:usage_metric:daily_sync_count' },
      { user_id: U_ALL, badge_id: STREAK.id, triggered_by: 'catalog_reevaluation:usage_metric:daily_sync_streak_days' },
      { user_id: U_ALL, badge_id: CHECKIN_CAT.id, triggered_by: 'catalog_reevaluation:checkin_category_count:cafe' },
      { user_id: U_ALL, badge_id: CHECKIN_LIST.id, triggered_by: 'catalog_reevaluation:checkin_badge_count' },
    ])
    // 포인트는 정상 지급한다
    expect(awardPointsMock).toHaveBeenCalledTimes(6)
    expect(awardPointsMock).toHaveBeenCalledWith(U_ALL, 30, 'badge_point_reward', { sourceBadgeId: FOLLOWERS.id })
    expect(awardPointsMock).toHaveBeenCalledWith(U_ALL, 200, 'badge_point_reward', { sourceBadgeId: CHECKIN_LIST.id })
    // 피드는 만들지 않는다
    expect(recordFeedEventMock).not.toHaveBeenCalled()
  })

  it('메인 엔진 → JAM! → 사용량 순서로 돌린다(메인 엔진 결과는 그대로 합산된다)', async () => {
    mockMainEngine([U_ALL])
    const order: string[] = []
    evaluateBadgesDetailedMock.mockImplementation(async (userId: string) => {
      order.push(`main:${userId}`)
      return { earned: [{ id: MAIN_BADGE.id, name: MAIN_BADGE.name }], counted: [] }
    })
    awardPointsMock.mockImplementation(async () => {
      order.push('usage:points')
      return null
    })
    state.tables.badges = [MAIN_BADGE, FOLLOWERS] as unknown as Row[]

    const result = await reevaluateUsersForCatalog(mockSupabase(), { dryRun: false, userIds: [U_ALL] })

    expect(order).toEqual([`main:${U_ALL}`, 'usage:points'])
    expect(result.users[0].earnedBadgeIds).toEqual([MAIN_BADGE.id, FOLLOWERS.id])
    expect(result.users[0].pointsAwarded).toBe(40)
    expect(result.users[0].usageMetricPointsAwarded).toBe(30)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ③ 다시 실행(멱등)
// ═══════════════════════════════════════════════════════════════════════

describe('재평가 다시 실행 — 중복 발급 없음', () => {
  it('이미 보유한 배지는 다시 발급하지 않는다(발급 0건, 포인트 0)', async () => {
    await reevaluateUsersForCatalog(mockSupabase(), { dryRun: false, userIds: ALL_USERS })
    expect(state.inserts).toHaveLength(6)

    vi.clearAllMocks()
    mockMainEngine()
    const second = await reevaluateUsersForCatalog(mockSupabase(), { dryRun: false, userIds: ALL_USERS })

    expect(state.inserts).toHaveLength(6) // 첫 실행의 6건 그대로
    expect(second.usageMetricAffectedUserCount).toBe(0)
    expect(second.totalUsageMetricBadgesIssued).toBe(0)
    expect(second.totalUsageMetricPointsAwarded).toBe(0)
    expect(second.totalBadgesIssued).toBe(0)
    expect(second.totalPointsAwarded).toBe(0)
    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(recordFeedEventMock).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ④ 동기화 2종 — 과거 기록 기준
// ═══════════════════════════════════════════════════════════════════════

describe('재평가 — 동기화 2종은 과거 기록 기준', () => {
  const U_PAST = 'user-past' // 지난 1월에 7일 연속·하루 최대 5회, 이후 기록 없음
  const U_SHORT = 'user-short' // 6일 연속·하루 최대 4회 — 둘 다 모자란다
  const U_BROKEN = 'user-broken' // 4일 + 4일(중간에 하루 끊김) — 연속은 4일
  const U_SPREAD = 'user-spread' // 하루 3회씩 두 날 — 합쳐 6회지만 «하루 최대»는 3회

  beforeEach(() => {
    state.tables.badges = [SYNC_COUNT, STREAK] as unknown as Row[]
    state.tables.user_daily_sync_counts = []
    for (let d = 1; d <= 7; d++) addSyncRow(U_PAST, day(d), d === 4 ? 5 : 1)
    for (let d = 1; d <= 6; d++) addSyncRow(U_SHORT, day(d), d === 2 ? 4 : 1)
    for (const d of [1, 2, 3, 4, 6, 7, 8, 9]) addSyncRow(U_BROKEN, day(d), 1)
    addSyncRow(U_SPREAD, day(1), 3)
    addSyncRow(U_SPREAD, day(2), 3)
  })

  it('오늘 동기화하지 않은 유저도 지난 기록으로 받는다(오늘 기준이면 0인 유저)', async () => {
    // 자연 발급 기준(오늘까지 이어진 현재 연속)이면 이 유저의 연속일수는 0이다 — 그래도 과거 기록으로 받는다
    const pastDates = state.tables.user_daily_sync_counts.filter((r) => r.user_id === U_PAST).map((r) => r.sync_date as string)
    expect(calcCurrentSyncStreakDays(pastDates)).toBe(0)

    const result = await reevaluateUsersForCatalog(mockSupabase(), { dryRun: false, userIds: [U_PAST] })

    expect(state.inserts).toEqual([
      { user_id: U_PAST, badge_id: SYNC_COUNT.id, triggered_by: 'catalog_reevaluation:usage_metric:daily_sync_count' },
      { user_id: U_PAST, badge_id: STREAK.id, triggered_by: 'catalog_reevaluation:usage_metric:daily_sync_streak_days' },
    ])
    expect(result.totalUsageMetricPointsAwarded).toBe(80)
  })

  it('기록이 모자라거나 연속이 끊기면 받지 못하고, 하루 횟수는 합산이 아니라 하루 최대로 본다', async () => {
    const result = await reevaluateUsersForCatalog(mockSupabase(), {
      dryRun: true,
      userIds: [U_SHORT, U_BROKEN, U_SPREAD],
    })

    expect(result.totalUsageMetricBadgesIssued).toBe(0)
    expect(result.users.map((u) => u.earnedBadgeIds)).toEqual([[], [], []])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ⑤ 후보 없는 지표는 값 조회를 하지 않는다
// ═══════════════════════════════════════════════════════════════════════

describe('재평가 — 후보 배지가 없는 지표는 값 조회를 하지 않는다', () => {
  it('팔로워 배지만 있으면 팔로우 수 조회 1회뿐, 동기화·체크인 값은 조회하지 않는다', async () => {
    state.tables.badges = [FOLLOWERS] as unknown as Row[]

    await reevaluateUsersForCatalog(mockSupabase(), { dryRun: true, userIds: [U_ALL] })

    expect(state.queried.filter((t) => t === 'user_follows')).toHaveLength(1)
    expect(state.queried).not.toContain('user_daily_sync_counts')
    expect(state.queried).not.toContain('user_checkin_badge_earns')
    expect(state.queried).not.toContain('poi')
  })

  it('동기화 2종 배지가 둘 다 있어도 기록 조회는 유저당 1회다', async () => {
    state.tables.badges = [SYNC_COUNT, STREAK] as unknown as Row[]

    await reevaluateUsersForCatalog(mockSupabase(), { dryRun: true, userIds: [U_ALL] })

    expect(state.queried.filter((t) => t === 'user_daily_sync_counts')).toHaveLength(1)
    expect(state.queried).not.toContain('user_follows')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ⑥ 같은 배지는 한 번만 센다
// ═══════════════════════════════════════════════════════════════════════

describe('재평가 — 같은 배지는 한 번만 센다', () => {
  it('사용량 지표 키를 둘 가진 배지는 dry-run에서도 한 번만 센다(실제 실행과 같은 숫자)', async () => {
    state.tables.badges = [
      makeBadge({ id: 'u-two-keys', name: '두 지표', point_reward: 80, condition_json: { follower_count: 1, following_count: 1 } }),
    ] as unknown as Row[]

    const dry = await reevaluateUsersForCatalog(mockSupabase(), { dryRun: true, userIds: [U_ALL] })
    expect(dry.totalUsageMetricBadgesIssued).toBe(1)
    expect(dry.totalUsageMetricPointsAwarded).toBe(80)

    const real = await reevaluateUsersForCatalog(mockSupabase(), { dryRun: false, userIds: [U_ALL] })
    expect(real.totalUsageMetricBadgesIssued).toBe(1)
    expect(state.inserts).toHaveLength(1)
  })

  it('JAM! 키와 사용량 키를 함께 가진 배지는 JAM! 몫으로만 센다', async () => {
    state.tables.badges = [
      makeBadge({
        id: 'u-mixed',
        name: '믹스와 인기',
        point_reward: 60,
        condition_json: { combine_success_count: 1, follower_count: 1 },
      }),
    ] as unknown as Row[]
    state.tables.user_combine_success_logs.push({ user_id: U_ALL, recipe_id: 'r-1', is_recipe_first: false })

    const result = await reevaluateUsersForCatalog(mockSupabase(), { dryRun: true, userIds: [U_ALL] })

    expect(result.totalJamActionBadgesIssued).toBe(1)
    expect(result.totalUsageMetricBadgesIssued).toBe(0)
    expect(result.totalBadgesIssued).toBe(1)
    expect(result.totalPointsAwarded).toBe(60)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ⑦ 오류는 삼키지 않는다
// ═══════════════════════════════════════════════════════════════════════

describe('재평가 — 사용량 판정 실패 격리', () => {
  it('값 조회가 던지면 error에 「사용량 지표:」가 남고, 메인 엔진 결과와 그 전에 발급한 배지는 결과에 남는다', async () => {
    mockMainEngine([U_ALL])
    state.rejects.user_daily_sync_counts = () => new Error('sync down')

    const result = await reevaluateUsersForCatalog(mockSupabase(), { dryRun: false, userIds: [U_ALL, U_NONE] })

    const user = result.users.find((u) => u.userId === U_ALL)!
    expect(user.error).toBe('사용량 지표: sync down')
    // 메인 엔진 결과 + 동기화 조회 전에 이미 발급한 팔로워·팔로잉 배지(포인트까지 지급됨)
    expect(user.earnedBadgeIds).toEqual([MAIN_BADGE.id, FOLLOWERS.id, FOLLOWING.id])
    expect(user.pointsAwarded).toBe(60)
    expect(user.usageMetricEarnedCount).toBe(2)
    expect(user.usageMetricPointsAwarded).toBe(50)
    expect(state.inserts.map((i) => i.badge_id)).toEqual([FOLLOWERS.id, FOLLOWING.id])

    // 다음 유저 처리도 계속된다
    expect(result.targetUserCount).toBe(2)
    expect(result.users.find((u) => u.userId === U_NONE)!.error).toBe('사용량 지표: sync down')
  })

  it('조회가 error를 돌려줘도 0으로 폴백하지 않고 error에 남긴다', async () => {
    state.tables.badges = [FOLLOWERS] as unknown as Row[]
    state.errors.user_follows = 'boom'

    const result = await reevaluateUsersForCatalog(mockSupabase(), { dryRun: false, userIds: [U_ALL] })

    expect(result.users[0].error).toBe('사용량 지표: 팔로우 수 조회 오류: boom')
    expect(result.totalUsageMetricBadgesIssued).toBe(0)
    expect(state.inserts).toEqual([])
  })

  it('JAM!과 사용량이 모두 실패하면 error를 「 / 」로 잇는다', async () => {
    // 첫 `badges` 조회는 재평가 배치의 point_reward 조회 — 둘째부터가 유저별 JAM!·사용량 후보 조회다
    state.rejects.badges = (nth) => (nth >= 2 ? new Error('connection reset') : undefined)

    const result = await reevaluateUsersForCatalog(mockSupabase(), { dryRun: false, userIds: [U_ALL] })

    expect(result.users[0].error).toBe('JAM! 지표: connection reset / 사용량 지표: connection reset')
    expect(result.totalBadgesIssued).toBe(0)
    expect(state.inserts).toEqual([])
  })
})
