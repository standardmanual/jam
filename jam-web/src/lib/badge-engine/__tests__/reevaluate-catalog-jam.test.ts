/**
 * 기존 유저 재평가 배치의 JAM! 행동 지표 확장 테스트 (티켓 20261001_0634, 상위 20260930_1456 ④)
 *
 * 검증 대상:
 *  ① dry-run: 대상 유저 수·JAM! 영향 유저 수·JAM! 포인트 합계를 돌려주고, insert·포인트·피드를 한 번도 쓰지 않는다
 *     (섀도우밴 차단은 dry-run에도 반영된다)
 *  ② 실제 실행: 조건을 채운 유저에게만 발급하고 포인트는 지급하며 피드는 만들지 않는다. `triggered_by`에
 *     `catalog_reevaluation:` 접두가 붙는다
 *  ③ 다시 실행: 이미 보유한 배지는 다시 발급하지 않는다(발급 0건, 포인트 0)
 *  ④ JAM! 판정이 던져도 메인 엔진 결과는 남고 `error`에 `JAM! 지표:`가 남는다
 *  ⑤ 기존 동작 고정: `issueQualifyingBadges`를 옵션 없이 부르면 insert·포인트·피드를 모두 한다
 *
 * 메인 엔진(`evaluateBadgesDetailed`)은 모킹하고 JAM! 경로(`evaluateJamActionBadges` → `issueQualifyingBadges`)는
 * 실제 코드를 탄다. 테이블 모킹은 `jam-action-badges.test.ts`와 같은 방식(메모리 테이블에 `eq`·`in` 적용)이다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/reevaluate-catalog-jam.test.ts
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
  state.tables = { badges: [], user_activity_badges: [], user_combine_success_logs: [], user_combine_fail_logs: [] }
  state.rejects = {}
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

import { reevaluateUsersForCatalog, CATALOG_REEVALUATION_TRIGGER } from '../reevaluateCatalog'
import { issueQualifyingBadges } from '../usageBadges'

const U_QUALIFIED = 'user-qualified' // 믹스 성공 3회 — JAM_MIXER 조건 충족
const U_SHORT = 'user-short' // 믹스 성공 1회 — 조건 미충족
const U_OWNER = 'user-owner' // 믹스 성공 3회 + JAM_MIXER 이미 보유

const JAM_MIXER = makeBadge({
  id: 'jam-mixer',
  name: '믹스러',
  point_reward: 50,
  condition_json: { combine_success_count: 3 },
})
const MAIN_BADGE = makeBadge({ id: 'main-badge', name: '러너', point_reward: 10, condition_json: {} })

function addSuccess(userId: string, count: number) {
  for (let i = 0; i < count; i++) {
    state.tables.user_combine_success_logs.push({ user_id: userId, recipe_id: 'r-1', is_recipe_first: false })
  }
}

function seedCatalogAndUsers() {
  state.tables.badges = [JAM_MIXER, MAIN_BADGE] as unknown as Row[]
  addSuccess(U_QUALIFIED, 3)
  addSuccess(U_SHORT, 1)
  addSuccess(U_OWNER, 3)
  state.tables.user_activity_badges.push({ user_id: U_OWNER, badge_id: JAM_MIXER.id })
}

/** 메인 엔진 모킹 — 대상 유저 중 `U_QUALIFIED`에게만 메인 배지 1개를 «받게 한다» */
function mockMainEngine(grantMainTo: string[] = [U_QUALIFIED]) {
  evaluateBadgesDetailedMock.mockImplementation(async (userId: string) => ({
    earned: grantMainTo.includes(userId) ? [{ id: MAIN_BADGE.id, name: MAIN_BADGE.name }] : [],
    counted: [],
  }))
}

const ALL_USERS = [U_QUALIFIED, U_SHORT, U_OWNER]

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

describe('재평가 dry-run — JAM! 지표', () => {
  it('대상 유저 수·JAM! 영향 유저 수·JAM! 포인트 합계를 돌려주고 아무것도 쓰지 않는다', async () => {
    const result = await reevaluateUsersForCatalog(mockSupabase(), { dryRun: true, userIds: ALL_USERS })

    expect(result.dryRun).toBe(true)
    expect(result.targetUserCount).toBe(3)
    // JAM! 몫 — 조건을 채우고 아직 보유하지 않은 U_QUALIFIED 한 명뿐이다
    expect(result.jamActionAffectedUserCount).toBe(1)
    expect(result.totalJamActionBadgesIssued).toBe(1)
    expect(result.totalJamActionPointsAwarded).toBe(50)
    // 전체 합계에는 메인 엔진 몫(배지 1개·포인트 10)이 함께 들어 있다
    expect(result.affectedUserCount).toBe(1)
    expect(result.totalBadgesIssued).toBe(2)
    expect(result.totalPointsAwarded).toBe(60)

    const qualified = result.users.find((u) => u.userId === U_QUALIFIED)!
    expect(qualified.earnedBadgeIds).toEqual([MAIN_BADGE.id, JAM_MIXER.id])
    expect(qualified.jamActionEarnedCount).toBe(1)
    expect(qualified.jamActionPointsAwarded).toBe(50)
    expect(qualified.pointsAwarded).toBe(60)

    // 쓰기는 하나도 없다
    expect(state.inserts).toEqual([])
    expect(state.tables.user_activity_badges).toEqual([{ user_id: U_OWNER, badge_id: JAM_MIXER.id }])
    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(recordFeedEventMock).not.toHaveBeenCalled()
  })

  it('메인 엔진에도 dryRun·silent·재평가 트리거를 그대로 넘긴다', async () => {
    await reevaluateUsersForCatalog(mockSupabase(), { dryRun: true, userIds: [U_SHORT] })

    expect(evaluateBadgesDetailedMock).toHaveBeenCalledWith(
      U_SHORT,
      [],
      expect.objectContaining({ dryRun: true, silent: true, triggeredBy: CATALOG_REEVALUATION_TRIGGER })
    )
  })

  it('섀도우밴 차단은 dry-run 숫자에도 반영된다', async () => {
    getUserBanLevelMock.mockResolvedValue('hard')
    state.tables.badges = [
      makeBadge({ id: 'jam-mystic', name: '신화 믹서', rarity: 'mystic', point_reward: 500, condition_json: { combine_success_count: 1 } }),
      JAM_MIXER,
    ] as unknown as Row[]

    const result = await reevaluateUsersForCatalog(mockSupabase(), { dryRun: true, userIds: [U_QUALIFIED] })

    // mystic 등급형은 hard 밴에서 차단되므로 «받게 될 배지»에 들어가지 않는다 — common JAM_MIXER만 남는다
    const qualified = result.users[0]
    expect(qualified.earnedBadgeIds).toContain(JAM_MIXER.id)
    expect(qualified.earnedBadgeIds).not.toContain('jam-mystic')
    expect(result.totalJamActionPointsAwarded).toBe(50)
  })

  it('JAM! 지표 키를 둘 가진 배지는 dry-run에서도 한 번만 센다(실제 실행과 같은 숫자)', async () => {
    state.tables.badges = [
      makeBadge({
        id: 'jam-two-keys',
        name: '두 지표',
        point_reward: 70,
        condition_json: { combine_success_count: 1, combine_attempt_count: 1 },
      }),
    ] as unknown as Row[]

    const result = await reevaluateUsersForCatalog(mockSupabase(), { dryRun: true, userIds: [U_QUALIFIED] })

    expect(result.totalJamActionBadgesIssued).toBe(1)
    expect(result.totalJamActionPointsAwarded).toBe(70)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ② 실제 실행
// ═══════════════════════════════════════════════════════════════════════

describe('재평가 실제 실행 — JAM! 지표', () => {
  it('조건을 채운 유저에게만 발급하고 포인트는 지급하며 피드는 만들지 않는다', async () => {
    const result = await reevaluateUsersForCatalog(mockSupabase(), { dryRun: false, userIds: ALL_USERS })

    expect(result.dryRun).toBe(false)
    expect(result.jamActionAffectedUserCount).toBe(1)
    expect(result.totalJamActionBadgesIssued).toBe(1)
    expect(result.totalJamActionPointsAwarded).toBe(50)

    // 조건을 채운 U_QUALIFIED에게만 한 번 — `triggered_by`에 재평가 접두가 붙는다
    expect(state.inserts).toEqual([
      {
        user_id: U_QUALIFIED,
        badge_id: JAM_MIXER.id,
        triggered_by: 'catalog_reevaluation:jam_action:combine_success_count',
      },
    ])
    // 포인트는 정상 지급한다
    expect(awardPointsMock).toHaveBeenCalledTimes(1)
    expect(awardPointsMock).toHaveBeenCalledWith(U_QUALIFIED, 50, 'badge_point_reward', { sourceBadgeId: JAM_MIXER.id })
    // 피드는 만들지 않는다
    expect(recordFeedEventMock).not.toHaveBeenCalled()
  })

  it('메인 엔진 다음에 JAM! 지표를 돌린다(동기화와 같은 순서)', async () => {
    const order: string[] = []
    evaluateBadgesDetailedMock.mockImplementation(async (userId: string) => {
      order.push(`main:${userId}`)
      return { earned: [], counted: [] }
    })
    awardPointsMock.mockImplementation(async () => {
      order.push('jam:points')
      return null
    })

    await reevaluateUsersForCatalog(mockSupabase(), { dryRun: false, userIds: [U_QUALIFIED] })

    expect(order).toEqual([`main:${U_QUALIFIED}`, 'jam:points'])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ③ 다시 실행(멱등)
// ═══════════════════════════════════════════════════════════════════════

describe('재평가 다시 실행 — 중복 발급 없음', () => {
  it('이미 보유한 배지는 다시 발급하지 않는다(발급 0건, 포인트 0)', async () => {
    await reevaluateUsersForCatalog(mockSupabase(), { dryRun: false, userIds: ALL_USERS })
    expect(state.inserts).toHaveLength(1)

    // 두 번째 실행 — 메인 엔진도 더 줄 것이 없다
    vi.clearAllMocks()
    mockMainEngine([])
    const second = await reevaluateUsersForCatalog(mockSupabase(), { dryRun: false, userIds: ALL_USERS })

    expect(state.inserts).toHaveLength(1) // 첫 실행의 1건 그대로
    expect(second.jamActionAffectedUserCount).toBe(0)
    expect(second.totalJamActionBadgesIssued).toBe(0)
    expect(second.totalJamActionPointsAwarded).toBe(0)
    expect(second.totalBadgesIssued).toBe(0)
    expect(second.totalPointsAwarded).toBe(0)
    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(recordFeedEventMock).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ④ JAM! 판정 실패 격리
// ═══════════════════════════════════════════════════════════════════════

describe('재평가 — JAM! 판정 실패 격리', () => {
  it('JAM! 판정이 던져도 메인 엔진 결과는 남고 error에 「JAM! 지표:」가 남는다', async () => {
    // 첫 `badges` 조회는 재평가 배치의 point_reward 조회 — 둘째부터가 유저별 JAM! 후보 조회다
    state.rejects.badges = (nth) => (nth >= 2 ? new Error('connection reset') : undefined)

    const result = await reevaluateUsersForCatalog(mockSupabase(), { dryRun: false, userIds: [U_QUALIFIED, U_SHORT] })

    const qualified = result.users.find((u) => u.userId === U_QUALIFIED)!
    expect(qualified.earnedBadgeIds).toEqual([MAIN_BADGE.id]) // 메인 엔진 결과는 유지
    expect(qualified.earnedCount).toBe(1)
    expect(qualified.pointsAwarded).toBe(10)
    expect(qualified.jamActionEarnedCount).toBe(0)
    expect(qualified.error).toBe('JAM! 지표: connection reset')

    // 다음 유저 처리도 계속된다
    expect(result.targetUserCount).toBe(2)
    expect(result.users.find((u) => u.userId === U_SHORT)!.error).toBe('JAM! 지표: connection reset')
    expect(result.totalJamActionBadgesIssued).toBe(0)
    expect(state.inserts).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ⑤ 기존 동작 고정
// ═══════════════════════════════════════════════════════════════════════

describe('issueQualifyingBadges — 옵션 없이 부르면 지금처럼 동작', () => {
  const badge = makeBadge({ id: 'plain', name: '평범', point_reward: 40, condition_json: { combine_success_count: 1 } })
  const call = (options?: Parameters<typeof issueQualifyingBadges>[7]) =>
    issueQualifyingBadges(
      mockSupabase(),
      U_QUALIFIED,
      [badge],
      () => 1,
      () => 1,
      () => 'jam_action:combine_success_count',
      'test',
      options
    )

  it('옵션이 없으면 insert·포인트·피드를 모두 하고 triggered_by에 접두가 없다', async () => {
    const earned = await call()

    expect(earned).toEqual([{ id: 'plain', name: '평범' }])
    expect(state.inserts).toEqual([
      { user_id: U_QUALIFIED, badge_id: 'plain', triggered_by: 'jam_action:combine_success_count' },
    ])
    expect(awardPointsMock).toHaveBeenCalledWith(U_QUALIFIED, 40, 'badge_point_reward', { sourceBadgeId: 'plain' })
    expect(recordFeedEventMock).toHaveBeenCalledTimes(1)
  })

  it('silent는 피드만 건너뛴다', async () => {
    await call({ silent: true })

    expect(state.inserts).toHaveLength(1)
    expect(awardPointsMock).toHaveBeenCalledTimes(1)
    expect(recordFeedEventMock).not.toHaveBeenCalled()
  })

  it('dryRun은 쓰기를 하나도 하지 않고 받게 될 배지만 돌려준다', async () => {
    const earned = await call({ dryRun: true })

    expect(earned).toEqual([{ id: 'plain', name: '평범' }])
    expect(state.inserts).toEqual([])
    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(recordFeedEventMock).not.toHaveBeenCalled()
  })
})
