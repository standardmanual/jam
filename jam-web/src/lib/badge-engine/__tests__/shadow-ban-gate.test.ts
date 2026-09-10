/**
 * 액티비티 배지 발급 경로 — 섀도우밴 게이트 회귀 테스트 (티켓 20260910_1719)
 *
 * BADGE_ENGINE_UNIFIED.md §1 "공통 정책(두 엔진 공유)"이 명시한 섀도우밴이 이 경로
 * (`evaluateBadgesDetailed`)에는 전혀 연결돼 있지 않았다 — drop-engine(아이템배지)·
 * usageBadges.ts(서비스 사용량 배지)에만 있었다. 이 파일은 usageBadges.ts가 세운 판정
 * (rarity가 있는 배지만 대상, `shouldAllowDrop` 재사용)을 그대로 재사용해 연결한 뒤,
 * ① 밴 유저는 고가치 등급 액티비티 배지를 받지 못하고 ② 정상 유저·카운터 증가 경로는
 * 기존 그대로 동작함을 고정한다.
 *
 * 모킹은 badge-engine-v5.test.ts(쿼리 빌더·반복형 RPC)와 usage-badges.test.ts
 * (getUserBanLevel만 모킹하고 shouldAllowDrop·DEFAULT_POLICY는 실제 구현을 쓴다 — rate
 * 테이블이 결정론적이라 Math.random()에 기대지 않고도 차단/허용을 고정할 수 있다)의
 * 관례를 그대로 따른다.
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
    drop_weight: 0,
    drop_condition_json: null,
    valid_from: null,
    valid_until: null,
    point_reward: 0,
    deleted_at: null,
    deactivated_by_item_book_id: null,
    created_at: '2026-01-01T00:00:00Z',
    background_color: null,
    background_shader_id: null,
    background_image_url: null,
    background_video_url: null,
    background_animation: null,
    image_gen_params: null,
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
} = {
  badges: [],
  ownedBadgeIds: [],
  storedActivities: [],
  // 첫 싱크 게이트가 이 회귀 테스트의 관심사를 가리지 않도록 기본값은 동기화 완료 상태로 둔다.
  user: { initial_sync_done: true, created_at: SIGNUP_AT },
  earnState: {},
  inserts: [],
  rpcCalls: [],
}

function resetState() {
  state.badges = []
  state.ownedBadgeIds = []
  state.storedActivities = []
  state.user = { initial_sync_done: true, created_at: SIGNUP_AT }
  state.earnState = {}
  state.inserts = []
  state.rpcCalls = []
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
    builder.maybeSingle = () =>
      Promise.resolve(table === 'users' ? { data: state.user, error: null } : { data: null, error: null })
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

const getUserBanLevelMock = vi.hoisted(() =>
  vi.fn<(userId: string) => Promise<'none' | 'soft' | 'hard'>>(async () => 'none')
)

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => mockSupabase() }))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/points', () => ({ awardPoints: vi.fn(async () => true) }))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications/recap', () => ({ recordActivityRecap: vi.fn(async () => {}) }))
// getUserBanLevel만 모킹하고 shouldAllowDrop·AbusingPolicy는 실제 구현을 쓴다 — rate 테이블이
// 결정론적이라(예: hard_mystic_rate=0.0) Math.random()에 기대지 않고도 차단/허용을 고정할 수 있다.
vi.mock('@/lib/abusing/shadow-ban', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/abusing/shadow-ban')>()
  return { ...actual, getUserBanLevel: (userId: string) => getUserBanLevelMock(userId) }
})
vi.mock('@/lib/abusing/policy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/abusing/policy')>()
  return { ...actual, getAbusingPolicy: vi.fn(async () => actual.DEFAULT_POLICY) }
})

beforeEach(() => {
  resetState()
  vi.clearAllMocks()
  getUserBanLevelMock.mockResolvedValue('none')
})

// ═══════════════════════════════════════════════════════════════════════

describe('섀도우밴 게이트 — 밴 없음(none)은 기존 발급 흐름에 영향이 없다', () => {
  it('mystic 등급형도 정상 발급된다 (회귀 방지)', async () => {
    state.badges = [makeGradedBadge('G-mystic', 'mystic')]
    oneRun()

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'test' })

    expect(earned.map((b) => b.id)).toEqual(['G-mystic'])
    expect(state.inserts.map((p) => p.badge_id)).toEqual(['G-mystic'])
    // 발급 후보가 있어도 밴이 없으면 정책 조회까지 갈 필요는 없다(shouldAllowDrop 진입 전
    // banLevel==='none' 분기에서 끝난다) — getUserBanLevel 자체는 호출된다.
    expect(getUserBanLevelMock).toHaveBeenCalledWith(USER_ID)
  })
})

describe('섀도우밴 게이트 — hard 밴은 고가치 등급형 발급을 차단한다', () => {
  it('mystic 등급형이 차단된다 (hard_mystic_rate=0.0) — missed에 사유가 남는다', async () => {
    getUserBanLevelMock.mockResolvedValue('hard')
    state.badges = [makeGradedBadge('G-mystic', 'mystic')]
    oneRun()

    const { earned, missed } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'test' })

    expect(earned).toEqual([])
    expect(state.inserts).toEqual([])
    const m = missed.find((x) => x.id === 'G-mystic')
    expect(m?.reason).toBe('섀도우밴 — 고가치 등급 발급 차단')
    expect(m?.actual).toBe('mystic')
  })

  it('common 등급형은 차단되지 않는다 (hard_common_rate=1.0)', async () => {
    getUserBanLevelMock.mockResolvedValue('hard')
    state.badges = [makeGradedBadge('G-common', 'common')]
    oneRun()

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'test' })

    expect(earned.map((b) => b.id)).toEqual(['G-common'])
    expect(state.inserts.map((p) => p.badge_id)).toEqual(['G-common'])
  })
})

describe('섀도우밴 게이트 — soft 밴은 mystic만 차단한다', () => {
  it('mystic은 차단되고 rare·common은 정상 발급된다 (soft_mystic_rate=0.0, 나머지=1.0)', async () => {
    getUserBanLevelMock.mockResolvedValue('soft')
    // 서로 다른 이름으로 둬 성장 티어(동명 그룹 최상위 1개) 병합에 걸리지 않게 한다.
    state.badges = [
      makeBadge({ id: 'S-mystic', name: 'S-mystic', rarity: 'mystic', condition_json: { activity_type: 'running', total_count: 1 } }),
      makeBadge({ id: 'S-rare', name: 'S-rare', rarity: 'rare', condition_json: { activity_type: 'running', total_count: 1 } }),
      makeBadge({ id: 'S-common', name: 'S-common', rarity: 'common', condition_json: { activity_type: 'running', total_count: 1 } }),
    ]
    oneRun()

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'test' })

    expect(earned.map((b) => b.id).sort()).toEqual(['S-common', 'S-rare'])
  })
})

describe('섀도우밴 게이트 — 레벨형(rarity NULL)은 대상이 아니다', () => {
  it('hard 밴이어도 레벨형은 정상 발급된다', async () => {
    getUserBanLevelMock.mockResolvedValue('hard')
    state.badges = [makeLevelBadge(1, 'run:infinite')]
    oneRun()

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'test' })

    expect(earned.map((b) => b.id)).toEqual(['run:infinite-lv1'])
  })
})

describe('섀도우밴 게이트 — 반복형은 rarity 유무로 판정한다', () => {
  it('hard 밴 — 반복형 최초 발급(action=issue)도 rarity 기준으로 차단된다', async () => {
    getUserBanLevelMock.mockResolvedValue('hard')
    state.badges = [makeRepeatBadge('REP-rare', 'rare', 1)]
    state.storedActivities = [
      { normalized: makeLongRun(101, '2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' },
    ]

    const { earned, missed } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'test' })

    expect(earned).toEqual([])
    expect(state.inserts).toEqual([])
    expect(missed.find((x) => x.id === 'REP-rare')?.reason).toBe('섀도우밴 — 고가치 등급 발급 차단')
  })

  it('hard 밴 — 이미 보유한 반복형의 카운터 증가(action=increment)는 섀도우밴과 무관하게 정상 동작한다', async () => {
    // hard_rare_rate=0.0이라 "신규 발급"이었다면 막혔을 등급이지만, 카운터 증가는 새 행을
    // 만들지 않으므로 이 게이트의 대상이 아니다 — 막히면 기존 반복형 회귀다.
    getUserBanLevelMock.mockResolvedValue('hard')
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
    expect(state.rpcCalls.map((c) => c.badgeId)).toEqual(['REP-rare'])
    expect(state.earnState['REP-rare'].earn_count).toBe(2)
  })
})

describe('섀도우밴 게이트 — 조회 비용 최적화', () => {
  it('발급 후보가 없으면 getUserBanLevel을 호출하지 않는다', async () => {
    // 조건 미충족이라 애초에 발급 후보가 없는 상황 — total_count:5인데 활동이 0건.
    state.badges = [makeGradedBadge('G-unreached', 'rare')]
    state.badges[0].condition_json = { activity_type: 'running', total_count: 5 }

    await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'test' })

    expect(getUserBanLevelMock).not.toHaveBeenCalled()
  })
})
