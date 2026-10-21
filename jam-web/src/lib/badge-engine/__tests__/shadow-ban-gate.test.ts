/**
 * 액티비티 배지 발급 경로 — 섀도우밴을 읽지 않는다 (티켓 20261017_1426, 옛 티켓 20260910_1719의 게이트를 대신한다)
 *
 * JAM 2.0의 제재는 이용 정지 하나다. `evaluateBadgesDetailed`는 예전에 발급 후보가 있으면 `getUserBanLevel`을 읽어 고가치 등급
 * 발급을 막았지만(missed 사유 «섀도우밴 — 고가치 등급 발급 차단») 이제는 읽지 않는다. 옛 테이블에 hard 밴이 남아 있어도 발급은
 * 평소대로다. 정지 중인 유저는 동기화 입구에서 막혀 이 함수에 오지 않는다.
 *
 * 티켓 20261021_1250(6-4 2회)에서 `getUserBanLevel`과 밴 모듈을 지웠다. «옛 밴을 읽지 않는다»는 이제 모킹이 아니라 쿼리 빌더가 `from()`으로 연
 * 표 이름을 기록해 `user_shadow_bans`가 한 번도 열리지 않았는지로 고정한다(모든 시험이 끝난 뒤 한 번 더 확인한다). 옛 표에 hard 밴 행이 있는
 * 것처럼 흉내 내므로 코드가 다시 읽으면 열린 표에 남거나 발급 결과가 달라진다. 쿼리 빌더·반복형 RPC 모킹은 badge-engine-v5.test.ts의 관례를 따른다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/shadow-ban-gate.test.ts
 */
import { evaluateBadgesDetailed } from '../index'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeEarnHistoryEntry, BadgeRarity, BadgeRow } from '@/types/database'

// ── 픽스처 — badge-engine-v5.test.ts와 동일한 형태 ──────────────────────────

const USER_ID = 'user-shadow-ban'
const SIGNUP_AT = '2026-03-01T00:00:00Z'

function makeRun(startDate: string, overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return {
    stravaId: Math.floor(Math.random() * 1_000_000_000),
    name: 'Test Run',
    distanceKm: 5,
    movingTimeSec: 30 * 60,
    elevationGainM: 10,
    jamActivityType: 'running',
    startDate,
    startDateLocal: startDate.replace('Z', ''),
    averageSpeedKmh: 10,
    startLatLng: null,
    endLatLng: null,
    weatherTempC: null,
    ...overrides,
  }
}

/** 60분짜리 러닝 — 반복형 회차 술어(`duration_minutes: 60`)를 만족하는 활동 */
function makeLongRun(stravaId: number, startDate: string): NormalizedActivity {
  return makeRun(startDate, { stravaId, movingTimeSec: 60 * 60 })
}

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
    activity_types: ['running'],
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

/** 등급형 한 장 — total_count:1 조건은 러닝 활동 1건이면 통과한다 */
function makeGradedBadge(id: string, rarity: BadgeRarity): BadgeRow {
  return makeBadge({
    id,
    name: `등급형-${rarity}`,
    rarity,
    condition_json: { activity_type: 'running', total_count: 1 },
  })
}

/** 무한레벨형 한 칸 — `rarity: null` + `level` (마이그레이션 130의 배타 CHECK와 같은 형태) */
function makeLevelBadge(level: number, familyKey: string, overrides: Partial<BadgeRow> = {}): BadgeRow {
  return makeBadge({
    id: `${familyKey}-lv${level}`,
    name: '무한 러너',
    rarity: null,
    level,
    family_key: familyKey,
    sort_order: 10,
    condition_json: { activity_type: 'running', total_count: 1 },
    ...overrides,
  })
}

/** 반복형 한 칸 — 등급 + `condition_json.repeat_count` */
function makeRepeatBadge(id: string, rarity: BadgeRarity, repeatCount: number): BadgeRow {
  return makeBadge({
    id,
    name: '반복 러너',
    rarity,
    sort_order: 20,
    condition_json: { activity_type: 'running', duration_minutes: 60, repeat_count: repeatCount },
  })
}

// ── 모킹 — badge-engine-v5.test.ts의 쿼리 빌더·RPC 흉내를 그대로 가져온다 ──────

type StoredActivity = { normalized: NormalizedActivity; start_date: string }
type EarnState = { earn_count: number; earn_history: BadgeEarnHistoryEntry[] }
type InsertPayload = { badge_id: string; earn_count?: number; earn_history?: BadgeEarnHistoryEntry[] }

const state: {
  badges: BadgeRow[]
  ownedBadgeIds: string[]
  storedActivities: StoredActivity[]
  user: { initial_sync_done: boolean; created_at: string | null }
  earnState: Record<string, EarnState>
  inserts: InsertPayload[]
  rpcCalls: { badgeId: string; entries: BadgeEarnHistoryEntry[] }[]
  /** 쿼리 빌더가 `from()`으로 연 표 이름 — 옛 밴 표를 열지 않았는지 확인하는 데 쓴다 */
  opened: string[]
} = {
  badges: [],
  ownedBadgeIds: [],
  storedActivities: [],
  // 첫 싱크 게이트가 이 회귀 테스트의 관심사를 가리지 않도록 기본값은 동기화 완료 상태로 둔다.
  user: { initial_sync_done: true, created_at: SIGNUP_AT },
  earnState: {},
  inserts: [],
  rpcCalls: [],
  opened: [],
}

function resetState() {
  state.badges = []
  state.ownedBadgeIds = []
  state.storedActivities = []
  state.user = { initial_sync_done: true, created_at: SIGNUP_AT }
  state.earnState = {}
  state.inserts = []
  state.rpcCalls = []
  state.opened = []
}

function earnStateOf(badgeId: string): EarnState {
  if (!state.earnState[badgeId]) state.earnState[badgeId] = { earn_count: 1, earn_history: [] }
  return state.earnState[badgeId]
}

function oneRun() {
  state.storedActivities = [{ normalized: makeRun('2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' }]
}

/** supabase-js 쿼리 빌더 흉내 — badge-engine-v5.test.ts와 같은 최소 구현 */
function mockSupabase() {
  const from = (table: string) => {
    state.opened.push(table)
    let gteValue: string | undefined
    let inIds: string[] | null = null
    const builder: Record<string, unknown> = {}
    const self = () => builder
    builder.select = self
    builder.eq = self
    builder.is = self
    builder.or = self
    builder.order = self
    builder.gte = (_column: string, value: string) => {
      gteValue = value
      return builder
    }
    builder.in = (_column: string, values: string[]) => {
      inIds = values
      return builder
    }
    builder.update = self
    builder.maybeSingle = () => {
      if (table === 'users') return Promise.resolve({ data: state.user, error: null })
      // 옛 표에 hard 밴 행이 남아 있는 것처럼 흉내 낸다 — 코드가 읽으면 열린 표에 남는다
      if (table === 'user_shadow_bans') return Promise.resolve({ data: { ban_level: 'hard', expires_at: null }, error: null })
      return Promise.resolve({ data: null, error: null })
    }
    builder.insert = (payload: InsertPayload) => {
      if (table !== 'user_activity_badges') return Promise.resolve({ data: null, error: null })
      state.inserts.push(payload)
      if (state.ownedBadgeIds.includes(payload.badge_id)) {
        return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } })
      }
      state.ownedBadgeIds.push(payload.badge_id)
      state.earnState[payload.badge_id] = {
        earn_count: payload.earn_count ?? 1,
        earn_history: payload.earn_history ?? [],
      }
      return Promise.resolve({ data: null, error: null })
    }
    builder.then = (resolve: (v: unknown) => void) => {
      let data: unknown = []
      if (table === 'badges') {
        data = inIds ? state.badges.filter((b) => inIds!.includes(b.id)) : state.badges
      } else if (table === 'user_activity_badges') {
        data = state.ownedBadgeIds.map((id) => ({ badge_id: id, earned_at: '2026-04-01T00:00:00Z' }))
      } else if (table === 'strava_activities') {
        data = state.storedActivities.filter((r) => !gteValue || r.start_date >= gteValue)
      }
      return Promise.resolve({ data, error: null }).then(resolve)
    }
    return builder
  }

  /** `increment_activity_badge_earn` RPC 흉내 — 멱등 조건(근거 활동 중복 제외)까지 실제로 구현한다 */
  const rpc = (name: string, args: Record<string, unknown>) => {
    if (name !== 'increment_activity_badge_earn') return Promise.resolve({ data: null, error: null })
    const badgeId = args.p_badge_id as string
    const entries = (args.p_entries ?? []) as BadgeEarnHistoryEntry[]
    const limit = (args.p_history_limit as number | undefined) ?? 200
    state.rpcCalls.push({ badgeId, entries })
    if (!state.ownedBadgeIds.includes(badgeId)) return Promise.resolve({ data: 0, error: null })
    const row = earnStateOf(badgeId)
    const seen = new Set<number>()
    let added = 0
    for (const entry of entries) {
      const id = entry.strava_activity_id
      if (id == null) continue
      if (seen.has(id)) continue
      seen.add(id)
      if (row.earn_history.some((h) => h.strava_activity_id === id)) continue
      row.earn_count += 1
      row.earn_history = [...row.earn_history, entry].slice(-limit)
      added += 1
    }
    return Promise.resolve({ data: added, error: null })
  }

  return { from, rpc }
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => mockSupabase() }))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/points', () => ({ awardPoints: vi.fn(async () => true) }))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications/recap', () => ({ recordActivityRecap: vi.fn(async () => {}) }))
vi.mock('@/lib/abusing/policy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/abusing/policy')>()
  return { ...actual, getAbusingPolicy: vi.fn(async () => actual.DEFAULT_POLICY) }
})

beforeEach(() => {
  resetState()
  vi.clearAllMocks()
})

afterEach(() => {
  // 어느 시험이든 발급 경로가 옛 밴 표를 열었다면 여기서 실패한다
  expect(state.opened).not.toContain('user_shadow_bans')
})

// ═══════════════════════════════════════════════════════════════════════

describe('섀도우밴을 읽지 않는다 — 옛 표에 hard 밴 행이 있어도 평소대로 발급한다', () => {
  it('mystic 등급형이 정상 발급되고 옛 밴 표를 열지 않는다', async () => {
    state.badges = [makeGradedBadge('G-mystic', 'mystic')]
    oneRun()

    const { earned, missed } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'test' })

    expect(earned.map((b) => b.id)).toEqual(['G-mystic'])
    expect(state.inserts.map((p) => p.badge_id)).toEqual(['G-mystic'])
    expect(missed.find((x) => x.id === 'G-mystic')).toBeUndefined()
    expect(state.opened).not.toContain('user_shadow_bans')
  })

  it('mystic·rare·common이 모두 발급된다', async () => {
    // 서로 다른 이름으로 둬 성장 티어(동명 그룹 최상위 1개) 병합에 걸리지 않게 한다.
    state.badges = [
      makeBadge({ id: 'S-mystic', name: 'S-mystic', rarity: 'mystic', condition_json: { activity_type: 'running', total_count: 1 } }),
      makeBadge({ id: 'S-rare', name: 'S-rare', rarity: 'rare', condition_json: { activity_type: 'running', total_count: 1 } }),
      makeBadge({ id: 'S-common', name: 'S-common', rarity: 'common', condition_json: { activity_type: 'running', total_count: 1 } }),
    ]
    oneRun()

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'test' })

    expect(earned.map((b) => b.id).sort()).toEqual(['S-common', 'S-mystic', 'S-rare'])
  })

  it('레벨형(rarity NULL)도 정상 발급된다', async () => {
    state.badges = [makeLevelBadge(1, 'run:infinite')]
    oneRun()

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'test' })

    expect(earned.map((b) => b.id)).toEqual(['run:infinite-lv1'])
  })

  it('반복형 최초 발급(action=issue)도 정상 발급된다', async () => {
    state.badges = [makeRepeatBadge('REP-rare', 'rare', 1)]
    state.storedActivities = [
      { normalized: makeLongRun(101, '2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' },
    ]

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'test' })

    expect(earned.map((b) => b.id)).toEqual(['REP-rare'])
  })

  it('이미 보유한 반복형의 카운터 증가(action=increment)도 평소대로 동작한다', async () => {
    state.badges = [makeRepeatBadge('REP-rare', 'rare', 1)]
    state.ownedBadgeIds = ['REP-rare']
    state.earnState['REP-rare'] = {
      earn_count: 1,
      earn_history: [{ earned_at: '2026-04-10T05:00:00Z', strava_activity_id: 101 }],
    }
    state.storedActivities = [
      { normalized: makeLongRun(101, '2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' },
    ]

    const { earned, counted } = await evaluateBadgesDetailed(
      USER_ID,
      [makeLongRun(102, '2026-04-11T05:00:00Z')],
      { triggeredBy: 'test' }
    )

    expect(earned).toEqual([]) // 카운터 증가는 발급이 아니다 — earned에 담기지 않는다
    expect(counted.map((c) => c.id)).toEqual(['REP-rare'])
    expect(state.earnState['REP-rare'].earn_count).toBe(2)
  })
})
