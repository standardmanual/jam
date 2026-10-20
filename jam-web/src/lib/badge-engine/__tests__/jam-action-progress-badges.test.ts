/**
 * JAM! 행동 지표 배지(미션·컬렉션·가입 경과일·주간 활동일·같은 지점 체크인 일수) 판정·발급 테스트 —
 * `evaluateJamActionBadges`를 끝까지 태운다 (티켓 20261001_0633, 상위 20260930_1456 ③)
 *
 * 검증 대상:
 *  ① 5지표 임계 발급/미발급(`triggered_by` = `jam_action:<키>`)
 *  ② 완료 조건 시나리오: 월·수·금 활동 + 일요일 동기화 → 활동일 3(동기화만 한 날은 세지 않는다), 같은 날 같은 지점 여러 번 → 1
 *  ③ 가입 경과일 전용 분기: 보조 키(최근 30일 활동일) — 3이면 미발급·4면 발급, 보조 키 없는 배지는 가입 일수만,
 *     보조 키가 있는 후보가 없으면 최근 활동일을 계산하지 않는다, 계산이 던지면 분기 전체를 건너뛴다
 *  ④ 호출 규칙: 요청한 지표만 조회, 후보가 없으면 조회 0회, 한 지표의 오류는 그 지표만 건너뜀(fail-closed)
 *  ⑤ 등급형·레벨형(가입 30·100) 발급 정책, 보조 키의 레지스트리 계약
 *
 * 테이블 모킹은 메모리 테이블에 `eq`·`in`·`not`·`gte`·`order`·`range`·`maybeSingle`과 head count를 실제로 적용한다.
 * 앞선 티켓의 테스트 파일(`jam-action-badges.test.ts`·`jam-action-drop-badges.test.ts`)은 이 연산을 모두 지원하지
 * 않아 이 파일에 따로 둔다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/jam-action-progress-badges.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
  tables: {} as Record<string, Record<string, unknown>[]>,
  /** 테이블별 조회 오류 주입 — 함수면 그 테이블의 n번째(1부터) 조회에서만 오류를 돌려줄 수 있다 */
  errors: {} as Record<string, { message: string } | ((nth: number) => { message: string } | undefined)>,
  /** 조회 실행 기록 */
  queried: [] as { table: string }[],
  inserts: [] as { user_id: string; badge_id: string; triggered_by: string }[],
}))

const getUserBanLevelMock = vi.hoisted(() =>
  vi.fn<(userId: string) => Promise<'none' | 'soft' | 'hard'>>(async () => 'none')
)

function resetState() {
  state.tables = {
    badges: [],
    user_activity_badges: [],
    users: [],
    user_mission_completions: [],
    user_item_book_completions: [],
    strava_activities: [],
    user_checkin_badge_earns: [],
    user_daily_sync_counts: [],
  }
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
    const notNulls: string[] = []
    const gtes: [string, unknown][] = []
    let ordered: string | null = null
    let range: [number, number] | null = null
    let cols = '*'
    let head = false
    const builder: Record<string, unknown> = {}
    const run = (single: boolean) => {
      state.queried.push({ table })
      const injected = state.errors[table]
      const nth = state.queried.filter((q) => q.table === table).length
      const error = typeof injected === 'function' ? injected(nth) : injected
      if (error) return { data: null, count: null, error }
      let rows = (state.tables[table] ?? []).filter(
        (r) =>
          eqs.every(([c, v]) => r[c] === v) &&
          ins.every(([c, v]) => v.includes(r[c])) &&
          notNulls.every((c) => r[c] !== null && r[c] !== undefined) &&
          gtes.every(([c, v]) => Date.parse(String(r[c])) >= Date.parse(String(v)))
      )
      if (head) return { data: null, count: rows.length, error: null }
      if (ordered) {
        const key = ordered
        rows = [...rows].sort((x, y) => (String(x[key]) < String(y[key]) ? -1 : 1))
      }
      if (range) rows = rows.slice(range[0], range[1] + 1)
      if (cols !== '*') {
        const wanted = cols.split(',').map((c) => c.trim())
        rows = rows.map((r) => Object.fromEntries(wanted.map((c) => [c, r[c]])))
      }
      return single ? { data: rows[0] ?? null, error: null } : { data: rows, error: null }
    }
    builder.select = (c: string, opts?: { head?: boolean }) => {
      cols = c
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
    builder.not = (col: string, op: string, val: unknown) => {
      if (op === 'is' && val === null) notNulls.push(col)
      return builder
    }
    builder.gte = (col: string, val: unknown) => {
      gtes.push([col, val])
      return builder
    }
    builder.order = (col: string) => {
      ordered = col
      return builder
    }
    builder.range = (from: number, to: number) => {
      range = [from, to]
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
    builder.maybeSingle = () => Promise.resolve(run(true))
    builder.then = (resolve: (v: unknown) => void) => Promise.resolve(run(false)).then(resolve)
    return builder
  }
  return { from } as unknown as SupabaseClient
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => mockSupabase() }))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/points', () => ({ awardPoints: vi.fn(async () => null) }))
// «배지 받기» 챕터 점수(티켓 20261019_1315)는 badge-receive-score-*.test.ts가 고정한다. 이 파일은 «지표마다 어느 표를 읽는가»를 고정하므로
// 점수 함수의 이용 정지 조회(`user_suspensions`)가 읽기 목록에 섞이지 않게 막는다
vi.mock('@/lib/chapter/badgeReceive', () => ({ awardBadgeReceiveScore: vi.fn(async () => ({ status: 'skipped', reason: 'origin' })) }))
vi.mock('@/lib/abusing/shadow-ban', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/abusing/shadow-ban')>()
  return { ...actual, getUserBanLevel: (userId: string) => getUserBanLevelMock(userId) }
})
vi.mock('@/lib/abusing/policy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/abusing/policy')>()
  return { ...actual, getAbusingPolicy: vi.fn(async () => actual.DEFAULT_POLICY) }
})

import {
  evaluateJamActionBadges,
  JAM_ACTION_CONDITION_KEYS,
  JAM_ACTION_MODIFIER_KEYS,
} from '../jamActionBadges'
import { ALL_CONDITION_KEYS, USAGE_METRIC_CONDITION_KEYS, getConditionField } from '../conditionRegistry'
import { daysBetweenKstDays } from '../jamActionDayMetrics'

const ME = 'user-me'
const OTHER = 'user-other'

/** KST 벽시계 시각 → ISO(오프셋 포함) */
const kst = (date: string, time = '12:00:00') => `${date}T${time}+09:00`
const RUN = { jamActivityType: 'running', distanceKm: 5, movingTimeSec: 1800, averageSpeedKmh: 10 }

/** 판정 시각 — 2026-10-01(목) 12:00 KST */
const NOW = new Date(kst('2026-10-01'))
/** 가입일 — NOW 기준 정확히 100일 전 */
const SIGNUP_100D = kst('2026-06-23', '10:00:00')

let nextId = 0
const idOf = () => String(nextId++).padStart(7, '0')

function setBadges(...badges: BadgeRow[]) {
  state.tables.badges = badges as unknown as Row[]
}
function setSignup(createdAt: string, userId = ME) {
  state.tables.users = state.tables.users.filter((r) => r.id !== userId)
  state.tables.users.push({ id: userId, created_at: createdAt })
}
function addActivity(startDate: string, normalized: unknown = RUN, userId = ME) {
  state.tables.strava_activities.push({ id: idOf(), user_id: userId, start_date: startDate, normalized })
}
function addCheckin(poiId: string, activityDate: string | null, userId = ME) {
  state.tables.user_checkin_badge_earns.push({
    id: idOf(),
    user_id: userId,
    poi_id: poiId,
    triggered_by_activity_date: activityDate,
    earned_at: '2026-09-30T00:00:00Z',
  })
}
const queriedTables = () => [...new Set(state.queried.map((q) => q.table))]
const idsOf = (earned: { id: string }[]) => earned.map((b) => b.id)

beforeEach(() => {
  resetState()
  vi.clearAllMocks()
  getUserBanLevelMock.mockResolvedValue('none')
  nextId = 0
  // 가입 시각은 시각에 의존하는 시나리오(가입 경과일)가 쓴다. 판정 시각은 NOW로 고정한다
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  setSignup(kst('2026-08-01', '10:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

// ═══════════════════════════════════════════════════════════════════════
// ① 5지표 임계
// ═══════════════════════════════════════════════════════════════════════

describe('완료한 미션 수(mission_complete_count)', () => {
  it('임계에 못 미치면 발급하지 않고, 채우면 발급한다', async () => {
    setBadges(makeBadge({ id: 'mission-2', condition_json: { mission_complete_count: 2 } }))
    state.tables.user_mission_completions.push({ id: '1', user_id: ME, mission_id: 'm1' })
    state.tables.user_mission_completions.push({ id: '2', user_id: OTHER, mission_id: 'm1' })
    state.tables.user_mission_completions.push({ id: '3', user_id: OTHER, mission_id: 'm2' })
    expect(await evaluateJamActionBadges(ME, ['mission_complete_count'])).toEqual([])
    expect(state.inserts).toEqual([])

    state.tables.user_mission_completions.push({ id: '4', user_id: ME, mission_id: 'm2' })
    expect(idsOf(await evaluateJamActionBadges(ME, ['mission_complete_count']))).toEqual(['mission-2'])
    expect(state.inserts).toEqual([{ user_id: ME, badge_id: 'mission-2', triggered_by: 'jam_action:mission_complete_count' }])
  })
})

describe('완성한 컬렉션 수(collection_complete_count)', () => {
  it('임계에 못 미치면 발급하지 않고, 채우면 발급한다', async () => {
    setBadges(makeBadge({ id: 'collection-2', condition_json: { collection_complete_count: 2 } }))
    state.tables.user_item_book_completions.push({ user_id: ME, item_book_id: 'b1' })
    state.tables.user_item_book_completions.push({ user_id: OTHER, item_book_id: 'b1' })
    expect(await evaluateJamActionBadges(ME, ['collection_complete_count'])).toEqual([])

    state.tables.user_item_book_completions.push({ user_id: ME, item_book_id: 'b2' })
    expect(idsOf(await evaluateJamActionBadges(ME, ['collection_complete_count']))).toEqual(['collection-2'])
    expect(state.inserts).toEqual([
      { user_id: ME, badge_id: 'collection-2', triggered_by: 'jam_action:collection_complete_count' },
    ])
  })
})

describe('가입 경과일(days_since_signup)', () => {
  it('가입 후 100일이 안 됐으면 발급하지 않고, 100일이 되면 발급한다', async () => {
    setBadges(makeBadge({ id: 'signup-100', condition_json: { days_since_signup: 100 } }))
    setSignup(kst('2026-06-24', '10:00:00')) // 99일 전
    expect(await evaluateJamActionBadges(ME, ['days_since_signup'])).toEqual([])
    expect(state.inserts).toEqual([])

    setSignup(SIGNUP_100D) // 정확히 100일 전
    expect(idsOf(await evaluateJamActionBadges(ME, ['days_since_signup']))).toEqual(['signup-100'])
    expect(state.inserts).toEqual([{ user_id: ME, badge_id: 'signup-100', triggered_by: 'jam_action:days_since_signup' }])
  })

  it('시나리오 기준일은 정확히 100일 전이다', () => {
    expect(daysBetweenKstDays('2026-06-23', '2026-10-01')).toBe(100)
  })

  it('가입 시각을 못 읽으면 이 지표만 건너뛴다 — 발급하지 않고 예외도 던지지 않는다', async () => {
    setBadges(makeBadge({ id: 'signup-1', condition_json: { days_since_signup: 1 } }))
    state.tables.users = []
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await evaluateJamActionBadges(ME, ['days_since_signup'])).toEqual([])
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

describe('주간 활동일(weekly_active_days)', () => {
  it('월·수·금에 활동하고 일요일에 한 번 동기화한 유저의 그 주 활동일은 3이다 — 임계 3은 발급, 임계 4는 미발급', async () => {
    setBadges(
      makeBadge({ id: 'week-3', name: '주 3일', condition_json: { weekly_active_days: 3 } }),
      makeBadge({ id: 'week-4', name: '주 4일', condition_json: { weekly_active_days: 4 } })
    )
    addActivity(kst('2026-09-14')) // 월
    addActivity(kst('2026-09-16')) // 수
    addActivity(kst('2026-09-18')) // 금
    // 일요일 동기화 — 동기화한 날은 활동한 날이 아니다
    state.tables.user_daily_sync_counts.push({ user_id: ME, sync_date: '2026-09-20', count: 1 })

    expect(idsOf(await evaluateJamActionBadges(ME, ['weekly_active_days']))).toEqual(['week-3'])
    expect(state.inserts).toEqual([{ user_id: ME, badge_id: 'week-3', triggered_by: 'jam_action:weekly_active_days' }])
    expect(queriedTables()).not.toContain('user_daily_sync_counts')
  })

  it('활동이 없는 날의 체크인도 센다', async () => {
    setBadges(makeBadge({ id: 'week-3', condition_json: { weekly_active_days: 3 } }))
    addActivity(kst('2026-09-14'))
    addCheckin('p1', kst('2026-09-16'))
    addCheckin('p2', kst('2026-09-18'))
    expect(idsOf(await evaluateJamActionBadges(ME, ['weekly_active_days']))).toEqual(['week-3'])
  })
})

describe('같은 지점 체크인 일수(same_spot_checkin_days)', () => {
  it('같은 날 같은 지점을 여러 번 찾아도 1일이다 — 임계 1은 발급, 임계 2는 미발급', async () => {
    setBadges(
      makeBadge({ id: 'spot-1', name: '단골 1', condition_json: { same_spot_checkin_days: 1 } }),
      makeBadge({ id: 'spot-2', name: '단골 2', condition_json: { same_spot_checkin_days: 2 } })
    )
    addCheckin('p1', kst('2026-09-14', '07:00:00'))
    addCheckin('p1', kst('2026-09-14', '13:00:00'))
    addCheckin('p1', kst('2026-09-14', '21:00:00'))

    expect(idsOf(await evaluateJamActionBadges(ME, ['same_spot_checkin_days']))).toEqual(['spot-1'])
    expect(state.inserts).toEqual([{ user_id: ME, badge_id: 'spot-1', triggered_by: 'jam_action:same_spot_checkin_days' }])
  })

  it('지점마다 따로 세서 최댓값을 쓴다 — 서로 다른 지점의 일수는 합치지 않는다', async () => {
    setBadges(makeBadge({ id: 'spot-3', condition_json: { same_spot_checkin_days: 3 } }))
    addCheckin('p1', kst('2026-09-14'))
    addCheckin('p1', kst('2026-09-15'))
    addCheckin('p2', kst('2026-09-16'))
    addCheckin('p2', kst('2026-09-17'))
    expect(await evaluateJamActionBadges(ME, ['same_spot_checkin_days'])).toEqual([])

    addCheckin('p1', kst('2026-09-18'))
    expect(idsOf(await evaluateJamActionBadges(ME, ['same_spot_checkin_days']))).toEqual(['spot-3'])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ③ 가입 경과일 전용 분기 — 보조 키
// ═══════════════════════════════════════════════════════════════════════

describe('가입 경과일 + 보조 키(signup_recent_active_days)', () => {
  /** 최근 30일 안의 서로 다른 날 n일에 활동한다 */
  function addRecentActiveDays(n: number) {
    for (let i = 0; i < n; i++) addActivity(kst(`2026-09-${String(20 + i).padStart(2, '0')}`))
  }

  beforeEach(() => {
    setSignup(SIGNUP_100D)
  })

  it('가입 100일 · 최근 30일 4일 조건: 최근 활동일이 3이면 미발급, 4면 발급한다', async () => {
    setBadges(makeBadge({ id: 'steady-100', condition_json: { days_since_signup: 100, signup_recent_active_days: 4 } }))
    addRecentActiveDays(3)
    expect(await evaluateJamActionBadges(ME, ['days_since_signup'])).toEqual([])
    expect(state.inserts).toEqual([])

    addRecentActiveDays(4)
    expect(idsOf(await evaluateJamActionBadges(ME, ['days_since_signup']))).toEqual(['steady-100'])
    expect(state.inserts).toEqual([{ user_id: ME, badge_id: 'steady-100', triggered_by: 'jam_action:days_since_signup' }])
  })

  it('보조 키가 없는 배지는 가입 일수만 본다 — 최근 활동이 0이어도 발급한다', async () => {
    setBadges(makeBadge({ id: 'plain-100', condition_json: { days_since_signup: 100 } }))
    expect(idsOf(await evaluateJamActionBadges(ME, ['days_since_signup']))).toEqual(['plain-100'])
  })

  it('같은 가입 일수라도 보조 키 있는 배지와 없는 배지를 따로 판정한다', async () => {
    setBadges(
      makeBadge({ id: 'plain', name: '그냥', condition_json: { days_since_signup: 30 } }),
      makeBadge({ id: 'steady', name: '꾸준', condition_json: { days_since_signup: 30, signup_recent_active_days: 10 } })
    )
    addRecentActiveDays(3)
    expect(idsOf(await evaluateJamActionBadges(ME, ['days_since_signup']))).toEqual(['plain'])
  })

  it('보조 키가 있는 후보가 없으면 최근 활동일을 계산하지 않는다 — 활동 기록을 읽지 않는다', async () => {
    setBadges(makeBadge({ id: 'plain-100', condition_json: { days_since_signup: 100 } }))
    addRecentActiveDays(5)
    await evaluateJamActionBadges(ME, ['days_since_signup'])
    expect(queriedTables()).not.toContain('strava_activities')
    expect(queriedTables()).not.toContain('user_checkin_badge_earns')
  })

  it('보조 키가 있는 후보가 있으면 최근 활동일을 한 번만 계산한다', async () => {
    setBadges(
      makeBadge({ id: 'steady-a', name: 'A', condition_json: { days_since_signup: 30, signup_recent_active_days: 2 } }),
      makeBadge({ id: 'steady-b', name: 'B', condition_json: { days_since_signup: 100, signup_recent_active_days: 4 } })
    )
    addRecentActiveDays(5)
    await evaluateJamActionBadges(ME, ['days_since_signup'])
    expect(state.queried.filter((q) => q.table === 'strava_activities')).toHaveLength(1)
  })

  it('최근 활동일 계산이 던지면 가입 경과일 분기 전체를 건너뛴다 — 보조 키 없는 배지도 이번에는 발급하지 않는다', async () => {
    setBadges(
      makeBadge({ id: 'plain', name: '그냥', condition_json: { days_since_signup: 30 } }),
      makeBadge({ id: 'steady', name: '꾸준', condition_json: { days_since_signup: 30, signup_recent_active_days: 1 } })
    )
    addRecentActiveDays(3)
    state.errors.strava_activities = { message: 'DB 장애' }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await evaluateJamActionBadges(ME, ['days_since_signup'])).toEqual([])
    expect(state.inserts).toEqual([])
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('다른 유저의 최근 활동은 세지 않는다', async () => {
    setBadges(makeBadge({ id: 'steady-100', condition_json: { days_since_signup: 100, signup_recent_active_days: 2 } }))
    addActivity(kst('2026-09-28'), RUN, OTHER)
    addActivity(kst('2026-09-29'), RUN, OTHER)
    addActivity(kst('2026-09-30'))
    expect(await evaluateJamActionBadges(ME, ['days_since_signup'])).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ④ 호출 규칙
// ═══════════════════════════════════════════════════════════════════════

describe('호출 규칙', () => {
  it('요청한 지표만 조회한다 — 미션 지표만 요청하면 미션 완료 테이블만 읽는다', async () => {
    setBadges(
      makeBadge({ id: 'mission-1', condition_json: { mission_complete_count: 1 } }),
      makeBadge({ id: 'collection-1', condition_json: { collection_complete_count: 1 } }),
      makeBadge({ id: 'week-1', condition_json: { weekly_active_days: 1 } })
    )
    state.tables.user_mission_completions.push({ id: '1', user_id: ME, mission_id: 'm1' })
    await evaluateJamActionBadges(ME, ['mission_complete_count'])
    const domainTables = queriedTables().filter((t) => !['badges', 'user_activity_badges'].includes(t))
    expect(domainTables).toEqual(['user_mission_completions'])
  })

  it('요청한 지표를 조건으로 가진 후보가 없으면 값 계산을 하지 않는다 (조회 0회)', async () => {
    setBadges(makeBadge({ id: 'follower', condition_json: { follower_count: 10 } }))
    expect(
      await evaluateJamActionBadges(ME, [
        'mission_complete_count',
        'collection_complete_count',
        'days_since_signup',
        'weekly_active_days',
        'same_spot_checkin_days',
      ])
    ).toEqual([])
    expect(queriedTables()).toEqual(['badges'])
  })

  it('한 지표의 조회가 실패해도 그 지표만 건너뛰고 나머지는 발급한다 (fail-closed)', async () => {
    setBadges(
      makeBadge({ id: 'mission-1', name: '미션', condition_json: { mission_complete_count: 1 } }),
      makeBadge({ id: 'collection-1', name: '컬렉션', condition_json: { collection_complete_count: 1 } })
    )
    state.tables.user_mission_completions.push({ id: '1', user_id: ME, mission_id: 'm1' })
    state.tables.user_item_book_completions.push({ user_id: ME, item_book_id: 'b1' })
    state.errors.user_mission_completions = { message: 'DB 장애' }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const earned = await evaluateJamActionBadges(ME, ['mission_complete_count', 'collection_complete_count'])

    expect(idsOf(earned)).toEqual(['collection-1'])
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('읽는 행이 30페이지를 넘으면 그 지표만 건너뛴다 (fail-closed)', async () => {
    setBadges(
      makeBadge({ id: 'week-1', name: '활동일', condition_json: { weekly_active_days: 1 } }),
      makeBadge({ id: 'mission-1', name: '미션', condition_json: { mission_complete_count: 1 } })
    )
    for (let i = 0; i < 30001; i++) addActivity(kst('2026-09-14'))
    state.tables.user_mission_completions.push({ id: '1', user_id: ME, mission_id: 'm1' })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const earned = await evaluateJamActionBadges(ME, ['weekly_active_days', 'mission_complete_count'])

    expect(idsOf(earned)).toEqual(['mission-1'])
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('요청이 비어 있으면 배지 조회도 하지 않는다', async () => {
    expect(await evaluateJamActionBadges(ME, [])).toEqual([])
    expect(state.queried).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ⑤ 발급 정책 — 등급형·레벨형 / 계약
// ═══════════════════════════════════════════════════════════════════════

describe('발급 정책은 usageBadges의 것을 그대로 쓴다', () => {
  it('레벨형(가입 30·100): 보유 레벨 + 1부터 조건을 채우는 동안 연속 발급된다', async () => {
    const fam = 'signup-family'
    setBadges(
      makeBadge({ id: 'lv1', rarity: null, level: 1, family_key: fam, condition_json: { days_since_signup: 30 } }),
      makeBadge({ id: 'lv2', rarity: null, level: 2, family_key: fam, condition_json: { days_since_signup: 100 } }),
      makeBadge({ id: 'lv3', rarity: null, level: 3, family_key: fam, condition_json: { days_since_signup: 365 } })
    )
    setSignup(SIGNUP_100D)
    expect(idsOf(await evaluateJamActionBadges(ME, ['days_since_signup']))).toEqual(['lv1', 'lv2'])
  })

  it('레벨형: 가입 31일째에는 1레벨만 발급되고 2레벨은 기다린다', async () => {
    const fam = 'signup-family'
    setBadges(
      makeBadge({ id: 'lv1', rarity: null, level: 1, family_key: fam, condition_json: { days_since_signup: 30 } }),
      makeBadge({ id: 'lv2', rarity: null, level: 2, family_key: fam, condition_json: { days_since_signup: 100 } })
    )
    setSignup(kst('2026-08-31', '10:00:00')) // 31일 전
    expect(idsOf(await evaluateJamActionBadges(ME, ['days_since_signup']))).toEqual(['lv1'])
  })

  it('등급형: 여러 등급을 한 번에 넘겨도 최상위 tier 1개만 발급된다', async () => {
    setBadges(
      makeBadge({ id: 'g-common', name: '꾸준', rarity: 'common', condition_json: { mission_complete_count: 1 } }),
      makeBadge({ id: 'g-rare', name: '꾸준', rarity: 'rare', condition_json: { mission_complete_count: 3 } }),
      makeBadge({ id: 'g-epic', name: '꾸준', rarity: 'epic', condition_json: { mission_complete_count: 30 } })
    )
    for (let i = 0; i < 3; i++) state.tables.user_mission_completions.push({ id: String(i), user_id: ME, mission_id: `m${i}` })
    expect(idsOf(await evaluateJamActionBadges(ME, ['mission_complete_count']))).toEqual(['g-rare'])
  })

  it('이미 보유한 배지는 다시 발급하지 않는다 — 멱등', async () => {
    setBadges(makeBadge({ id: 'mission-1', condition_json: { mission_complete_count: 1 } }))
    state.tables.user_mission_completions.push({ id: '1', user_id: ME, mission_id: 'm1' })
    expect(idsOf(await evaluateJamActionBadges(ME, ['mission_complete_count']))).toEqual(['mission-1'])
    expect(await evaluateJamActionBadges(ME, ['mission_complete_count'])).toEqual([])
    expect(state.inserts).toHaveLength(1)
  })
})

describe('계약: 지표 키와 보조 키', () => {
  it('주 키 5개가 JAM_ACTION_CONDITION_KEYS에 있고 레지스트리의 사용량 지표다', () => {
    for (const key of [
      'mission_complete_count',
      'collection_complete_count',
      'days_since_signup',
      'weekly_active_days',
      'same_spot_checkin_days',
    ] as const) {
      expect(JAM_ACTION_CONDITION_KEYS, key).toContain(key)
      expect(USAGE_METRIC_CONDITION_KEYS, key).toContain(key)
    }
  })

  it('보조 키는 레지스트리에 있지만 트리거 키·사용량 지표에는 없다', () => {
    for (const key of JAM_ACTION_MODIFIER_KEYS) {
      expect(ALL_CONDITION_KEYS, key).toContain(key)
      expect(JAM_ACTION_CONDITION_KEYS as readonly string[], key).not.toContain(key)
      expect(USAGE_METRIC_CONDITION_KEYS as readonly string[], key).not.toContain(key)
    }
  })

  it('보조 키의 짝은 판정되는 지표(JAM_ACTION_CONDITION_KEYS)다', () => {
    for (const key of JAM_ACTION_MODIFIER_KEYS) {
      const paired = getConditionField(key)?.pairedWith ?? []
      expect(paired.length, key).toBeGreaterThan(0)
      for (const pair of paired) expect(JAM_ACTION_CONDITION_KEYS as readonly string[], `${key} ← ${String(pair)}`).toContain(pair)
    }
  })
})
