/**
 * JAM! 행동 지표 배지(믹스 시도·성공·실패·레시피 최초 성공) 판정·발급 테스트
 * (티켓 20261001_0631, 상위 20260930_1456 ①)
 *
 * 검증 대상:
 *  ① 시도·성공·실패 임계 발급/미발급. 시도 = 성공 기록 수 + `no_recipe_match` 수(재료 소각 전 실패는 제외)
 *  ② 등급형·레벨형 순차 발급, 섀도우밴을 읽지 않음, 포인트·피드(`usageBadges.ts`의 발급 정책을 그대로 쓴다)
 *  ③ `recipe_first_success`: 최초 행 보유자만, 멱등, 동시 최초 성공에서 1명만
 *  ④ 호출 규칙: 후보가 없으면 계산 0회, 요청한 지표만 계산, 계산 예외는 그 지표만 건너뜀, 배지 조회 오류는 `[]`
 *  ⑤ 계약: `USAGE_METRIC_CONDITION_KEYS`의 모든 키는 기존 6지표이거나 `JAM_ACTION_CONDITION_KEYS`에 있다
 *
 * 테이블 모킹은 메모리 테이블에 `eq`·`in` 필터를 실제로 적용한다 — 횟수 계산이 «무엇을 세는가»를
 * 고정하려는 테스트라 행을 세는 쪽이 실제 조회와 같은 모양이어야 한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/jam-action-badges.test.ts
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
  /** 테이블별 조회 오류 주입 — 함수면 그 테이블의 n번째(1부터) 조회에서만 오류를 돌려줄 수 있다 */
  errors: {} as Record<string, { message: string } | ((nth: number) => { message: string } | undefined)>,
  /** `.then`(조회 실행)이 일어난 테이블 이름 기록 — 「계산 0회」 검증용 */
  queried: [] as string[],
  /** `user_activity_badges.insert` 페이로드 기록 */
  inserts: [] as { user_id: string; badge_id: string; triggered_by: string }[],
}))

const getUserBanLevelMock = vi.hoisted(() =>
  vi.fn<(userId: string) => Promise<'none' | 'soft' | 'hard'>>(async () => 'none')
)

function resetState() {
  state.tables = { badges: [], user_activity_badges: [], user_combine_success_logs: [], user_combine_fail_logs: [] }
  state.errors = {}
  state.queried = []
  state.inserts = []
  getUserBanLevelMock.mockReset()
  getUserBanLevelMock.mockResolvedValue('none')
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
    builder.then = (resolve: (v: unknown) => void) => {
      state.queried.push(table)
      const injected = state.errors[table]
      const nth = state.queried.filter((t) => t === table).length
      const error = typeof injected === 'function' ? injected(nth) : injected
      if (error) return Promise.resolve({ data: null, count: null, error }).then(resolve)
      const rows = (state.tables[table] ?? []).filter(
        (r) => eqs.every(([c, v]) => r[c] === v) && ins.every(([c, v]) => v.includes(r[c]))
      )
      return Promise.resolve(
        head ? { data: null, count: rows.length, error: null } : { data: rows, error: null }
      ).then(resolve)
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => mockSupabase() }))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/points', () => ({ awardPoints: vi.fn(async () => null) }))
vi.mock('@/lib/abusing/shadow-ban', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/abusing/shadow-ban')>()
  return { ...actual, getUserBanLevel: (userId: string) => getUserBanLevelMock(userId) }
})
vi.mock('@/lib/abusing/policy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/abusing/policy')>()
  return { ...actual, getAbusingPolicy: vi.fn(async () => actual.DEFAULT_POLICY) }
})

import { evaluateJamActionBadges, JAM_ACTION_CONDITION_KEYS } from '../jamActionBadges'
import { USAGE_METRIC_CONDITION_KEYS, ALL_CONDITION_KEYS } from '../conditionRegistry'

const RECIPE_A = '3f2a1c7e-8b4d-4e6f-9a10-2b3c4d5e6f70'
const RECIPE_B = '9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e'

function addSuccess(userId: string, recipeId: string, isFirst = false) {
  state.tables.user_combine_success_logs.push({ user_id: userId, recipe_id: recipeId, is_recipe_first: isFirst })
}
function addFail(userId: string, reason: string) {
  state.tables.user_combine_fail_logs.push({ user_id: userId, fail_reason: reason })
}
function setBadges(...badges: BadgeRow[]) {
  state.tables.badges = badges as unknown as Row[]
}
function own(userId: string, badgeId: string) {
  state.tables.user_activity_badges.push({ user_id: userId, badge_id: badgeId })
}

const LOG_TABLES = ['user_combine_success_logs', 'user_combine_fail_logs']

beforeEach(() => {
  resetState()
  vi.clearAllMocks()
  getUserBanLevelMock.mockResolvedValue('none')
})

// ═══════════════════════════════════════════════════════════════════════
// ① 시도·성공·실패 임계
// ═══════════════════════════════════════════════════════════════════════

describe('믹스 성공 횟수(combine_success_count)', () => {
  it('임계에 못 미치면 발급하지 않고, 채우면 발급한다', async () => {
    setBadges(makeBadge({ id: 'success-3', condition_json: { combine_success_count: 3 } }))
    addSuccess('user-1', RECIPE_A)
    addSuccess('user-1', RECIPE_A)

    expect(await evaluateJamActionBadges('user-1', ['combine_success_count'])).toEqual([])
    expect(state.inserts).toEqual([])

    addSuccess('user-1', RECIPE_B)
    const earned = await evaluateJamActionBadges('user-1', ['combine_success_count'])
    expect(earned).toEqual([{ id: 'success-3', name: 'Test Badge' }])
    expect(state.inserts).toEqual([
      { user_id: 'user-1', badge_id: 'success-3', triggered_by: 'jam_action:combine_success_count' },
    ])
  })

  it('다른 유저의 성공 기록은 세지 않는다', async () => {
    setBadges(makeBadge({ id: 'success-2', condition_json: { combine_success_count: 2 } }))
    addSuccess('user-1', RECIPE_A)
    addSuccess('user-2', RECIPE_A)
    addSuccess('user-2', RECIPE_B)
    expect(await evaluateJamActionBadges('user-1', ['combine_success_count'])).toEqual([])
  })

  it('빈손 성공도 성공 기록 1건이라 센다 — 기록 행이 곧 성공이다', async () => {
    // 빈손 성공은 result_badge_ids가 비고 points_awarded가 0인 행이다(combine-engine 테스트가 기록을 고정한다)
    setBadges(makeBadge({ id: 'success-1', condition_json: { combine_success_count: 1 } }))
    state.tables.user_combine_success_logs.push({
      user_id: 'user-1',
      recipe_id: RECIPE_A,
      is_recipe_first: false,
      result_badge_ids: [],
      points_awarded: 0,
    })
    expect((await evaluateJamActionBadges('user-1', ['combine_success_count'])).map((b) => b.id)).toEqual(['success-1'])
  })
})

describe('믹스 실패 횟수(combine_fail_count) — 재료가 소각된 실패만 센다', () => {
  it('no_recipe_match만 세고 소각 전 실패(invalid_count·items_not_found·recipe_not_found)는 세지 않는다', async () => {
    setBadges(makeBadge({ id: 'fail-2', condition_json: { combine_fail_count: 2 } }))
    addFail('user-1', 'no_recipe_match')
    addFail('user-1', 'invalid_count')
    addFail('user-1', 'items_not_found')
    addFail('user-1', 'recipe_not_found')

    expect(await evaluateJamActionBadges('user-1', ['combine_fail_count'])).toEqual([])

    addFail('user-1', 'no_recipe_match')
    expect((await evaluateJamActionBadges('user-1', ['combine_fail_count'])).map((b) => b.id)).toEqual(['fail-2'])
    expect(state.inserts[0].triggered_by).toBe('jam_action:combine_fail_count')
  })
})

describe('믹스 시도 횟수(combine_attempt_count) = 성공 기록 수 + no_recipe_match 수', () => {
  it('성공과 no_recipe_match를 합치고, 소각 전 실패는 제외한다', async () => {
    setBadges(makeBadge({ id: 'attempt-4', condition_json: { combine_attempt_count: 4 } }))
    addSuccess('user-1', RECIPE_A)
    addSuccess('user-1', RECIPE_B)
    addFail('user-1', 'no_recipe_match')
    // 소각 전에 끝난 실패는 시도가 아니다
    addFail('user-1', 'invalid_count')
    addFail('user-1', 'items_not_found')
    addFail('user-1', 'recipe_not_found')
    // 다른 유저의 기록
    addSuccess('user-2', RECIPE_A)
    addFail('user-2', 'no_recipe_match')

    // 성공 2 + no_recipe_match 1 = 3 < 4
    expect(await evaluateJamActionBadges('user-1', ['combine_attempt_count'])).toEqual([])

    addFail('user-1', 'no_recipe_match')
    // 성공 2 + no_recipe_match 2 = 4
    const earned = await evaluateJamActionBadges('user-1', ['combine_attempt_count'])
    expect(earned.map((b) => b.id)).toEqual(['attempt-4'])
    expect(state.inserts[0].triggered_by).toBe('jam_action:combine_attempt_count')
  })

  it('성공만으로도, 실패만으로도 시도가 쌓인다', async () => {
    setBadges(makeBadge({ id: 'attempt-2', condition_json: { combine_attempt_count: 2 } }))
    addSuccess('user-1', RECIPE_A)
    addSuccess('user-1', RECIPE_A)
    addFail('user-2', 'no_recipe_match')
    addFail('user-2', 'no_recipe_match')
    expect((await evaluateJamActionBadges('user-1', ['combine_attempt_count'])).map((b) => b.id)).toEqual(['attempt-2'])
    expect((await evaluateJamActionBadges('user-2', ['combine_attempt_count'])).map((b) => b.id)).toEqual(['attempt-2'])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ② 발급 정책 — 등급형·레벨형·섀도우밴을 읽지 않음·포인트
// ═══════════════════════════════════════════════════════════════════════

describe('발급 정책은 usageBadges의 것을 그대로 쓴다', () => {
  it('등급형: 여러 등급을 한 번에 넘겨도 최상위 tier 1개만 발급된다', async () => {
    setBadges(
      makeBadge({ id: 'g-common', name: '믹스러', rarity: 'common', condition_json: { combine_success_count: 1 } }),
      makeBadge({ id: 'g-rare', name: '믹스러', rarity: 'rare', condition_json: { combine_success_count: 5 } }),
      makeBadge({ id: 'g-epic', name: '믹스러', rarity: 'epic', condition_json: { combine_success_count: 50 } })
    )
    for (let i = 0; i < 6; i++) addSuccess('user-1', RECIPE_A)
    expect((await evaluateJamActionBadges('user-1', ['combine_success_count'])).map((b) => b.id)).toEqual(['g-rare'])
  })

  it('레벨형: 보유 레벨 + 1부터 조건을 채우는 동안 연속 발급된다', async () => {
    const fam = 'combine-family'
    setBadges(
      makeBadge({ id: 'lv1', rarity: null, level: 1, family_key: fam, condition_json: { combine_attempt_count: 1 } }),
      makeBadge({ id: 'lv2', rarity: null, level: 2, family_key: fam, condition_json: { combine_attempt_count: 5 } }),
      makeBadge({ id: 'lv3', rarity: null, level: 3, family_key: fam, condition_json: { combine_attempt_count: 10 } })
    )
    for (let i = 0; i < 6; i++) addSuccess('user-1', RECIPE_A)
    expect((await evaluateJamActionBadges('user-1', ['combine_attempt_count'])).map((b) => b.id)).toEqual(['lv1', 'lv2'])
  })

  it('이미 보유한 배지는 다시 발급하지 않는다 — 멱등', async () => {
    setBadges(makeBadge({ id: 'success-1', condition_json: { combine_success_count: 1 } }))
    addSuccess('user-1', RECIPE_A)
    own('user-1', 'success-1')
    expect(await evaluateJamActionBadges('user-1', ['combine_success_count'])).toEqual([])
    expect(state.inserts).toEqual([])
  })

  it('섀도우밴을 읽지 않는다: hard 밴이 남아 있어도 mystic 등급형과 레벨형이 모두 발급된다 (티켓 20261017_1426)', async () => {
    getUserBanLevelMock.mockResolvedValue('hard')
    setBadges(
      makeBadge({ id: 'g-mystic', rarity: 'mystic', condition_json: { combine_success_count: 1 } }),
      makeBadge({ id: 'lv1', rarity: null, level: 1, family_key: 'fam', condition_json: { combine_success_count: 1 } })
    )
    addSuccess('user-1', RECIPE_A)
    expect((await evaluateJamActionBadges('user-1', ['combine_success_count'])).map((b) => b.id).sort()).toEqual(['g-mystic', 'lv1'])
    expect(getUserBanLevelMock).not.toHaveBeenCalled()
  })

  it('point_reward가 있으면 발급 직후 포인트를 지급하고 피드 이벤트를 남긴다', async () => {
    setBadges(makeBadge({ id: 'success-1', rarity: 'rare', point_reward: 50, condition_json: { combine_success_count: 1 } }))
    addSuccess('user-1', RECIPE_A)
    const { awardPoints } = await import('@/lib/points')
    const { recordFeedEvent } = await import('@/lib/activity-feed')

    await evaluateJamActionBadges('user-1', ['combine_success_count'])

    expect(vi.mocked(awardPoints)).toHaveBeenCalledWith('user-1', 50, 'badge_point_reward', { sourceBadgeId: 'success-1' })
    expect(vi.mocked(recordFeedEvent)).toHaveBeenCalledWith(
      'user-1',
      'badge_earned',
      expect.objectContaining({ badge_id: 'success-1', rarity: 'rare', point_reward: 50 })
    )
  })

  it('한 호출에서 요청한 여러 지표의 배지를 함께 발급한다', async () => {
    setBadges(
      makeBadge({ id: 'attempt-1', name: '시도', condition_json: { combine_attempt_count: 1 } }),
      makeBadge({ id: 'success-1', name: '성공', condition_json: { combine_success_count: 1 } }),
      makeBadge({ id: 'fail-1', name: '실패', condition_json: { combine_fail_count: 1 } })
    )
    addSuccess('user-1', RECIPE_A)
    const earned = await evaluateJamActionBadges('user-1', ['combine_attempt_count', 'combine_success_count', 'combine_fail_count'])
    expect(earned.map((b) => b.id).sort()).toEqual(['attempt-1', 'success-1'])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ③ recipe_first_success
// ═══════════════════════════════════════════════════════════════════════

describe('레시피 최초 성공(recipe_first_success)', () => {
  const badgeFor = (id: string, recipeId: string) =>
    makeBadge({ id, name: `최초-${id}`, condition_json: { recipe_first_success: { recipe_id: recipeId } } })

  it('최초 행을 가진 유저만 발급받고, triggered_by에 레시피 id가 남는다', async () => {
    setBadges(badgeFor('first-a', RECIPE_A))
    addSuccess('user-1', RECIPE_A, true)
    addSuccess('user-2', RECIPE_A, false)

    expect((await evaluateJamActionBadges('user-1', ['recipe_first_success'])).map((b) => b.id)).toEqual(['first-a'])
    expect(await evaluateJamActionBadges('user-2', ['recipe_first_success'])).toEqual([])
    expect(state.inserts).toEqual([
      { user_id: 'user-1', badge_id: 'first-a', triggered_by: `recipe_first_success:${RECIPE_A}` },
    ])
  })

  it('다른 레시피의 최초 성공자는 이 레시피 배지를 받지 않는다', async () => {
    setBadges(badgeFor('first-a', RECIPE_A), badgeFor('first-b', RECIPE_B))
    addSuccess('user-1', RECIPE_B, true)
    expect((await evaluateJamActionBadges('user-1', ['recipe_first_success'])).map((b) => b.id)).toEqual(['first-b'])
  })

  it('성공한 적 없는 유저는 발급받지 않는다', async () => {
    setBadges(badgeFor('first-a', RECIPE_A))
    expect(await evaluateJamActionBadges('user-1', ['recipe_first_success'])).toEqual([])
  })

  it('다시 평가해도 한 번만 발급된다 — 멱등', async () => {
    setBadges(badgeFor('first-a', RECIPE_A))
    addSuccess('user-1', RECIPE_A, true)
    expect((await evaluateJamActionBadges('user-1', ['recipe_first_success'])).map((b) => b.id)).toEqual(['first-a'])
    expect(await evaluateJamActionBadges('user-1', ['recipe_first_success'])).toEqual([])
    expect(state.inserts).toHaveLength(1)
  })

  it('같은 레시피에 동시에 성공해도 최초 표시를 가진 1명만 받는다', async () => {
    // DB가 (recipe_id) WHERE is_recipe_first 부분 유니크로 최초 표시를 1행만 허용한다 — 그 결과 상태를 그대로 재현한다
    setBadges(badgeFor('first-a', RECIPE_A))
    addSuccess('user-1', RECIPE_A, true)
    addSuccess('user-2', RECIPE_A, false)
    const [first, second] = await Promise.all([
      evaluateJamActionBadges('user-1', ['recipe_first_success']),
      evaluateJamActionBadges('user-2', ['recipe_first_success']),
    ])
    expect(first.map((b) => b.id)).toEqual(['first-a'])
    expect(second).toEqual([])
    expect(state.tables.user_activity_badges.filter((r) => r.badge_id === 'first-a')).toHaveLength(1)
  })

  it('형태가 깨진 recipe_first_success 값을 가진 배지는 후보에서 빠진다', async () => {
    setBadges(
      makeBadge({ id: 'broken-1', condition_json: { recipe_first_success: 'x' } as never }),
      makeBadge({ id: 'broken-2', condition_json: { recipe_first_success: { recipe_id: 7 } } as never }),
      makeBadge({ id: 'broken-3', condition_json: { recipe_first_success: null } as never })
    )
    addSuccess('user-1', RECIPE_A, true)
    expect(await evaluateJamActionBadges('user-1', ['recipe_first_success'])).toEqual([])
    // 후보가 없으니 성공 기록도 조회하지 않는다
    expect(state.queried).not.toContain('user_combine_success_logs')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ④ 호출 규칙
// ═══════════════════════════════════════════════════════════════════════

describe('호출 규칙', () => {
  it('요청한 지표를 조건으로 가진 후보가 없으면 지표를 계산하지 않는다', async () => {
    // 다른 지표(팔로워)만 가진 배지 — 이 호출과 무관하다
    setBadges(makeBadge({ id: 'follower', condition_json: { follower_count: 10 } }))
    addSuccess('user-1', RECIPE_A)
    expect(await evaluateJamActionBadges('user-1', ['combine_attempt_count', 'combine_success_count'])).toEqual([])
    expect(state.queried.filter((t) => LOG_TABLES.includes(t))).toEqual([])
  })

  it('요청하지 않은 지표는 계산하지 않는다', async () => {
    setBadges(
      makeBadge({ id: 'success-1', condition_json: { combine_success_count: 1 } }),
      makeBadge({ id: 'fail-1', condition_json: { combine_fail_count: 1 } })
    )
    addSuccess('user-1', RECIPE_A)
    await evaluateJamActionBadges('user-1', ['combine_success_count'])
    expect(state.queried).toContain('user_combine_success_logs')
    expect(state.queried).not.toContain('user_combine_fail_logs')
  })

  it('요청이 비어 있으면 배지 조회도 하지 않는다', async () => {
    expect(await evaluateJamActionBadges('user-1', [])).toEqual([])
    expect(state.queried).toEqual([])
  })

  it('같은 지표를 여러 번 넘겨도 한 번만 계산한다', async () => {
    setBadges(makeBadge({ id: 'success-1', condition_json: { combine_success_count: 1 } }))
    addSuccess('user-1', RECIPE_A)
    await evaluateJamActionBadges('user-1', ['combine_success_count', 'combine_success_count'])
    expect(state.queried.filter((t) => t === 'user_combine_success_logs')).toHaveLength(1)
  })

  it('한 지표의 계산이 던져도 그 지표만 건너뛰고 나머지는 발급한다 (fail-closed)', async () => {
    setBadges(
      makeBadge({ id: 'success-1', name: '성공', condition_json: { combine_success_count: 1 } }),
      makeBadge({ id: 'fail-1', name: '실패', condition_json: { combine_fail_count: 1 } }),
      makeBadge({ id: 'attempt-1', name: '시도', condition_json: { combine_attempt_count: 1 } })
    )
    addSuccess('user-1', RECIPE_A)
    addFail('user-1', 'no_recipe_match')
    state.errors.user_combine_fail_logs = { message: 'DB 장애' }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const earned = await evaluateJamActionBadges('user-1', ['combine_success_count', 'combine_fail_count', 'combine_attempt_count'])

    // 실패 로그를 못 읽으면 실패·시도 지표는 건너뛴다. 0으로 바꿔 «센 값이 0»처럼 굴지 않는다
    expect(earned.map((b) => b.id)).toEqual(['success-1'])
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('recipe_first_success 계산이 던져도 수치형 지표는 그대로 발급한다', async () => {
    setBadges(
      makeBadge({ id: 'success-1', condition_json: { combine_success_count: 1 } }),
      makeBadge({ id: 'first-a', name: '최초', condition_json: { recipe_first_success: { recipe_id: RECIPE_A } } })
    )
    addSuccess('user-1', RECIPE_A, true)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    // 수치형 성공 횟수 계산(1번째 조회)은 통과시키고, recipe_first_success 차례(2번째 조회)에서만 실패시킨다
    state.errors.user_combine_success_logs = (nth) => (nth >= 2 ? { message: 'DB 장애' } : undefined)

    const earned = await evaluateJamActionBadges('user-1', ['combine_success_count', 'recipe_first_success'])

    expect(earned.map((b) => b.id)).toEqual(['success-1'])
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('배지 조회가 실패하면 예외 없이 빈 배열을 돌려준다', async () => {
    state.errors.badges = { message: 'DB 장애' }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await evaluateJamActionBadges('user-1', ['combine_success_count'])).toEqual([])
    expect(state.queried.filter((t) => LOG_TABLES.includes(t))).toEqual([])
    consoleError.mockRestore()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ⑤ 계약 — 레지스트리의 사용량 지표에는 판정기가 있다
// ═══════════════════════════════════════════════════════════════════════

describe('계약: 등록된 사용량 지표에는 판정기가 있다', () => {
  /** `usageBadges.ts`(`evaluateUsageBadges`·`evaluateCheckinUsageBadges`)가 판정하는 기존 6지표 */
  const USAGE_BADGES_KEYS = [
    'follower_count',
    'following_count',
    'daily_sync_count',
    'daily_sync_streak_days',
    'checkin_category_count',
    'checkin_badge_count',
  ]

  it('USAGE_METRIC_CONDITION_KEYS의 모든 키는 기존 6지표이거나 JAM_ACTION_CONDITION_KEYS에 있다', () => {
    const judged = new Set<string>([...USAGE_BADGES_KEYS, ...JAM_ACTION_CONDITION_KEYS])
    const unjudged = USAGE_METRIC_CONDITION_KEYS.filter((k) => !judged.has(k))
    // 여기서 깨지면 「어드민 폼에는 보이는데 아무도 발급하지 않는 조건」이 생긴 것이다
    expect(unjudged).toEqual([])
  })

  it('JAM_ACTION_CONDITION_KEYS의 모든 키는 레지스트리에 등록돼 있고 사용량 지표다', () => {
    for (const key of JAM_ACTION_CONDITION_KEYS) {
      expect(ALL_CONDITION_KEYS, `${key}가 레지스트리에 없다`).toContain(key)
      expect(USAGE_METRIC_CONDITION_KEYS, `${key}가 사용량 지표가 아니다`).toContain(key)
    }
  })

  it('사용량 지표는 mission_reward를 포함하지 않는다', () => {
    expect(USAGE_METRIC_CONDITION_KEYS).not.toContain('mission_reward')
  })
})
