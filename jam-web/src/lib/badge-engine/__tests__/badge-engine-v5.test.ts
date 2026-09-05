/**
 * 발급 엔진 v5 회귀 — A묶음(가입 시점 앵커 · 무한레벨 발급 · 첫 싱크 게이트 재정의) +
 * B1묶음(반복 획득 — 「발급」과 「카운터 증가」 분리)
 * (티켓 20260905_0030, 마스터 20260905_0026)
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/badge-engine-v5.test.ts
 *
 * DB 접근은 전부 모킹한다. 모킹은 walking-badges-v4.test.ts의 초경량 체인보다 한 단계
 * 두꺼운데, 이 티켓의 검증 대상이 **쿼리에 실린 필터 자체**(`gte('start_date', 앵커)`)와
 * **보유 배지 정의 조회 결과**(레벨·계열)이기 때문이다.
 */
import { evaluateBadgesDetailed } from '../index'
import { recapContent } from '@/lib/notifications/message'
import { buildEarnedBadgePayload } from '@/lib/strava/sync'
import { recordFeedEvent } from '@/lib/activity-feed'
import { awardPoints } from '@/lib/points'
import { recordActivityRecap } from '@/lib/notifications/recap'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeEarnHistoryEntry, BadgeRarity, BadgeRow } from '@/types/database'

// ── 픽스처 ───────────────────────────────────────────────────────────────

const USER_ID = 'user-v5'
/** 가입 시각. 이 이전 활동은 어떤 누적 조건에도 반영되면 안 된다 */
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
    faction_id: null,
    item_book_id: null,
    category: null,
    drop_weight: 0,
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
    ...overrides,
  }
}

/** 60분짜리 러닝 — 반복형 회차 술어(`duration_minutes: 60`)를 만족하는 활동 */
function makeLongRun(stravaId: number, startDate: string): NormalizedActivity {
  return makeRun(startDate, { stravaId, movingTimeSec: 60 * 60 })
}

/**
 * 반복형 한 칸 — 등급 + `condition_json.repeat_count` (v5 B1).
 * 같은 이름의 4장이 임계값만 1·5·20·50으로 다른 것이 「평면 반복은 횟수에 등급」의 형태다.
 */
function makeRepeatBadge(id: string, rarity: BadgeRarity, repeatCount: number): BadgeRow {
  return makeBadge({
    id,
    name: '반복 러너',
    rarity,
    sort_order: 20,
    condition_json: { activity_type: 'running', duration_minutes: 60, repeat_count: repeatCount },
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
    ...overrides,
  })
}

// ── 모킹 ─────────────────────────────────────────────────────────────────

type StoredActivity = { normalized: NormalizedActivity; start_date: string }
/** user_activity_badges 한 행의 회차 상태 (마이그레이션 130의 두 컬럼) */
type EarnState = { earn_count: number; earn_history: BadgeEarnHistoryEntry[] }
type InsertPayload = { badge_id: string; earn_count?: number; earn_history?: BadgeEarnHistoryEntry[] }

const state: {
  badges: BadgeRow[]
  ownedBadgeIds: string[]
  storedActivities: StoredActivity[]
  user: { initial_sync_done: boolean; created_at: string | null }
  /** strava_activities 조회에 실제로 걸린 gte 필터 값 — 앵커가 적용됐는지의 직접 증거 */
  lastHistoryGte: string | undefined
  /** badge_id → 회차 상태. 보유 배지의 earn_count/earn_history를 실제로 들고 있는다 */
  earnState: Record<string, EarnState>
  /** user_activity_badges에 실제로 시도된 INSERT 페이로드 */
  inserts: InsertPayload[]
  /** increment_activity_badge_earn RPC 호출 기록 */
  rpcCalls: { badgeId: string; entries: BadgeEarnHistoryEntry[] }[]
  /** 강제 INSERT 실패 — 「DB 반영 실패 시 부수효과 제외」 검증용 */
  insertErrorByBadgeId: Record<string, { code: string; message: string }>
} = {
  badges: [],
  ownedBadgeIds: [],
  storedActivities: [],
  user: { initial_sync_done: true, created_at: SIGNUP_AT },
  lastHistoryGte: undefined,
  earnState: {},
  inserts: [],
  rpcCalls: [],
  insertErrorByBadgeId: {},
}

function resetState() {
  state.badges = []
  state.ownedBadgeIds = []
  state.storedActivities = []
  state.user = { initial_sync_done: true, created_at: SIGNUP_AT }
  state.lastHistoryGte = undefined
  state.earnState = {}
  state.inserts = []
  state.rpcCalls = []
  state.insertErrorByBadgeId = {}
}

/** 보유 배지의 회차 상태. 없으면 「발급 1회 = 1회차」로 초기화한다(마이그레이션 130 불변식) */
function earnStateOf(badgeId: string): EarnState {
  if (!state.earnState[badgeId]) state.earnState[badgeId] = { earn_count: 1, earn_history: [] }
  return state.earnState[badgeId]
}

/** supabase-js 쿼리 빌더 흉내 — 필요한 연산자만 구현하고 필터는 실제로 적용한다 */
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
      if (table === 'strava_activities') state.lastHistoryGte = value
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
      const forced = state.insertErrorByBadgeId[payload.badge_id]
      if (forced) return Promise.resolve({ data: null, error: forced })
      // UNIQUE(user_id, badge_id) — 이미 보유한 배지의 INSERT는 23505로 떨어진다
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

  /**
   * `increment_activity_badge_earn` RPC 흉내 — **마이그레이션 132의 멱등 조건을 실제로 구현한다.**
   * 근거 활동 id가 이미 earn_history에 있으면 올리지 않는다(SQL의
   * `NOT (earn_history @> [{"strava_activity_id": …}])`와 같은 판정).
   * 흉내만 내고 통과시키면 「같은 활동으로 두 번 평가해도 한 번만 오른다」가 검증되지 않는다.
   */
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

beforeEach(() => {
  resetState()
  vi.clearAllMocks() // 부수효과(피드·포인트·결산) 호출 여부를 테스트마다 새로 센다
})

// ═══════════════════════════════════════════════════════════════════════
// ① 가입 시점 앵커 (§5)
// ═══════════════════════════════════════════════════════════════════════

describe('가입 시점 앵커 — 가입 이전 활동은 발급에 반영되지 않는다', () => {
  const badge = () =>
    makeBadge({ id: 'B-count2', name: '2회 러너', condition_json: { activity_type: 'running', total_count: 2 } })

  it('가입 이전 1건 + 이후 1건이면 total_count:2가 충족되지 않는다', async () => {
    state.badges = [badge()]
    state.storedActivities = [
      { normalized: makeRun('2026-01-15T05:00:00Z'), start_date: '2026-01-15T05:00:00Z' }, // 가입 전
      { normalized: makeRun('2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' }, // 가입 후
    ]

    const { earned, missed } = await evaluateBadgesDetailed(USER_ID, [], { dryRun: true })

    expect(state.lastHistoryGte).toBe(SIGNUP_AT) // 앵커가 실제로 쿼리에 실렸다
    expect(earned.map((b) => b.name)).not.toContain('2회 러너')
    expect(missed.map((b) => b.name)).toContain('2회 러너')
  })

  it('가입 이후 2건이면 그대로 발급된다 (앵커가 정상 이력까지 자르지 않는다)', async () => {
    state.badges = [badge()]
    state.storedActivities = [
      { normalized: makeRun('2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' },
      { normalized: makeRun('2026-04-11T05:00:00Z'), start_date: '2026-04-11T05:00:00Z' },
    ]

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { dryRun: true })
    expect(earned.map((b) => b.name)).toContain('2회 러너')
  })

  it('가입 시각을 읽지 못하면 필터 없이 진행한다 (일시적 조회 실패가 배지를 지우지 않는다)', async () => {
    state.user = { initial_sync_done: true, created_at: null }
    state.badges = [badge()]
    state.storedActivities = [
      { normalized: makeRun('2026-01-15T05:00:00Z'), start_date: '2026-01-15T05:00:00Z' },
      { normalized: makeRun('2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' },
    ]

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { dryRun: true })
    expect(state.lastHistoryGte).toBeUndefined()
    expect(earned.map((b) => b.name)).toContain('2회 러너')
  })

  it('이번 배치는 앵커와 무관하게 평가에 들어간다 (방금 동기화한 활동을 잘라내지 않는다)', async () => {
    state.badges = [
      makeBadge({ id: 'B-count1', name: '첫 러닝', condition_json: { activity_type: 'running', total_count: 1 } }),
    ]
    // 이력은 비어 있고, 배치로만 활동 1건이 들어온다
    const { earned } = await evaluateBadgesDetailed(USER_ID, [makeRun('2026-04-10T05:00:00Z')], { dryRun: true })
    expect(earned.map((b) => b.name)).toContain('첫 러닝')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ② · ③ 무한레벨 발급 (§1)
// ═══════════════════════════════════════════════════════════════════════

describe('무한레벨 발급 — 성장 티어 비교에 걸려 탈락하지 않는다', () => {
  it('rarity=null Lv.1 단독 배지가 발급된다 (0 <= 0 탈락 회귀 — 마스터 티켓 B-1)', async () => {
    state.badges = [makeLevelBadge(1, 'run:infinite', { condition_json: { activity_type: 'running', total_count: 1 } })]
    state.storedActivities = [{ normalized: makeRun('2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' }]

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { dryRun: true })
    expect(earned.map((b) => b.id)).toEqual(['run:infinite-lv1'])
    expect(earned[0].rarity).toBeNull()
  })

  it('같은 이름의 등급형 계열이 함께 있어도 레벨형이 티어 비교에 오염되지 않는다', async () => {
    // 등급형 Common('무한 러너')을 이미 보유 → highestOwnedTierByName['무한 러너'] = 1.
    // 예전 구조라면 같은 이름 그룹에 묶인 레벨형이 rarityTier(null)=0 <= 1로 탈락했다.
    const commonTwin = makeBadge({
      id: 'twin-common',
      name: '무한 러너',
      rarity: 'common',
      condition_json: { activity_type: 'running', total_count: 1 },
    })
    state.badges = [
      commonTwin,
      makeLevelBadge(1, 'run:infinite', { condition_json: { activity_type: 'running', total_count: 1 } }),
    ]
    state.ownedBadgeIds = ['twin-common']
    state.storedActivities = [{ normalized: makeRun('2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' }]

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { dryRun: true })
    expect(earned.map((b) => b.id)).toContain('run:infinite-lv1')
  })
})

describe('무한레벨 발급 — 보유 레벨 + 1부터 순차 발급', () => {
  const family = () => [
    makeLevelBadge(1, 'run:infinite', { condition_json: { activity_type: 'running', total_count: 1 } }),
    makeLevelBadge(2, 'run:infinite', { condition_json: { activity_type: 'running', total_count: 2 } }),
    makeLevelBadge(3, 'run:infinite', { condition_json: { activity_type: 'running', total_count: 5 } }),
  ]

  it('Lv.1 → Lv.2 순서로 연속 발급하고, 조건 미달인 Lv.3에서 멈춘다', async () => {
    state.badges = family()
    state.storedActivities = [
      { normalized: makeRun('2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' },
      { normalized: makeRun('2026-04-11T05:00:00Z'), start_date: '2026-04-11T05:00:00Z' },
    ]

    const { earned, missed } = await evaluateBadgesDetailed(USER_ID, [], { dryRun: true })
    expect(earned.map((b) => b.id)).toEqual(['run:infinite-lv1', 'run:infinite-lv2'])
    expect(missed.map((b) => b.id)).toContain('run:infinite-lv3')
  })

  it('Lv.1 보유 상태에서는 Lv.2만 후보가 된다 (이미 지난 레벨은 다시 발급되지 않는다)', async () => {
    state.badges = family()
    state.ownedBadgeIds = ['run:infinite-lv1']
    state.storedActivities = [
      { normalized: makeRun('2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' },
      { normalized: makeRun('2026-04-11T05:00:00Z'), start_date: '2026-04-11T05:00:00Z' },
    ]

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { dryRun: true })
    expect(earned.map((b) => b.id)).toEqual(['run:infinite-lv2'])
  })

  it('프런티어가 막히면 그 위 레벨은 «이전 레벨 미획득»으로 남는다', async () => {
    state.badges = family()
    state.storedActivities = [] // 활동 0건 → Lv.1부터 조건 미달

    const { earned, missed } = await evaluateBadgesDetailed(USER_ID, [], { dryRun: true })
    expect(earned).toHaveLength(0)
    const reasonById = new Map(missed.map((m) => [m.id, m.reason]))
    expect(reasonById.get('run:infinite-lv2')).toBe('이전 레벨 미획득')
    expect(reasonById.get('run:infinite-lv3')).toBe('이전 레벨 미획득')
  })

  it('진행 트랙 병합이 연속 발급분을 최고값 1개로 접지 않는다', async () => {
    // 레벨형에 prerequisite_badge_names가 붙어도(등급형 트랙 병합의 트리거 조건)
    // 레벨형은 병합 대상이 아니므로 Lv.1·Lv.2가 모두 살아남아야 한다.
    state.badges = [
      makeLevelBadge(1, 'run:infinite', {
        condition_json: { activity_type: 'running', distance_km: 5, prerequisite_badge_names: ['무한 러너'] },
      }),
      makeLevelBadge(2, 'run:infinite', {
        condition_json: { activity_type: 'running', distance_km: 8, prerequisite_badge_names: ['무한 러너'] },
      }),
      // 선행 배지 게이트를 열기 위한 보유 배지(이름 일치)
      makeBadge({ id: 'gate-owned', name: '무한 러너', rarity: 'common', condition_json: {} }),
    ]
    state.ownedBadgeIds = ['gate-owned']
    state.storedActivities = [
      { normalized: makeRun('2026-04-10T05:00:00Z', { distanceKm: 10 }), start_date: '2026-04-10T05:00:00Z' },
    ]

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { dryRun: true })
    expect(earned.map((b) => b.id)).toEqual(['run:infinite-lv1', 'run:infinite-lv2'])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ④ 첫 싱크 게이트 재정의 (§6)
// ═══════════════════════════════════════════════════════════════════════

describe('첫 싱크 게이트 — 레벨형은 Lv.1만 허용', () => {
  it('initial_sync_done=false이면 Lv.1만 발급되고 Lv.2는 게이트에 막힌다', async () => {
    state.user = { initial_sync_done: false, created_at: SIGNUP_AT }
    state.badges = [
      makeLevelBadge(1, 'run:infinite', { condition_json: { activity_type: 'running', total_count: 1 } }),
      makeLevelBadge(2, 'run:infinite', { condition_json: { activity_type: 'running', total_count: 2 } }),
    ]
    state.storedActivities = [
      { normalized: makeRun('2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' },
      { normalized: makeRun('2026-04-11T05:00:00Z'), start_date: '2026-04-11T05:00:00Z' },
    ]

    const { earned, missed } = await evaluateBadgesDetailed(USER_ID, [], { dryRun: true })
    expect(earned.map((b) => b.id)).toEqual(['run:infinite-lv1'])
    const lv2 = missed.find((m) => m.id === 'run:infinite-lv2')
    expect(lv2?.reason).toBe('첫 싱크 게이트 — Lv.1만 발급')
    expect(lv2?.required).toBe('Lv.1')
    expect(lv2?.actual).toBe('Lv.2') // "등급 없음"이 아니라 레벨로 말한다
  })

  it('등급형의 첫 싱크 게이트(Common만)는 그대로다', async () => {
    state.user = { initial_sync_done: false, created_at: SIGNUP_AT }
    state.badges = [
      makeBadge({ id: 'C1', name: '커먼', rarity: 'common', condition_json: { activity_type: 'running', total_count: 1 } }),
      makeBadge({ id: 'R1', name: '레어', rarity: 'rare', condition_json: { activity_type: 'running', total_count: 1 } }),
    ]
    state.storedActivities = [{ normalized: makeRun('2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' }]

    const { earned, missed } = await evaluateBadgesDetailed(USER_ID, [], { dryRun: true })
    expect(earned.map((b) => b.id)).toEqual(['C1'])
    expect(missed.find((m) => m.id === 'R1')?.reason).toBe('첫 싱크 게이트 — Common 등급만 발급')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ⑤ 결산 알림 · 획득 연출에 'Common'이 새지 않는다
// ═══════════════════════════════════════════════════════════════════════

describe("레벨형은 결산 알림에서 Common으로 표시되지 않는다", () => {
  it('rarity=null 활동배지는 등급이 null로 유지되고 희귀 헤드라인 후보가 아니다', () => {
    const c = recapContent({
      activity_ids: [1],
      activity_badges: [{ id: 'lv3', name: '무한 러너', rarity: null }],
    })
    expect(c.activityBadges).toHaveLength(1)
    expect(c.activityBadges[0].rarity).toBeNull()
    expect(c.rare).toBeNull()
  })

  it('등급형은 기존대로 등급이 유지된다 (회귀 방지)', () => {
    const c = recapContent({
      activity_ids: [1],
      activity_badges: [
        { id: 'e1', name: '에픽', rarity: 'epic' },
        { id: 'c1', name: '커먼', rarity: 'common' },
      ],
    })
    expect(c.activityBadges.map((b) => b.rarity)).toEqual(['epic', 'common'])
    expect(c.rare?.id).toBe('e1')
  })
})

describe("레벨형은 획득 연출 페이로드에서 Common으로 접히지 않는다", () => {
  it('buildEarnedBadgePayload가 rarity=null을 그대로 내려보낸다', async () => {
    state.badges = [
      makeLevelBadge(3, 'run:infinite', { id: 'lv3', condition_json: {}, image_url: null, description: '' }),
    ]
    const supabase = mockSupabase() as unknown as Parameters<typeof buildEarnedBadgePayload>[0]
    const payload = await buildEarnedBadgePayload(supabase, ['lv3'], USER_ID)

    expect(payload.earnedBadges).toHaveLength(1)
    expect(payload.earnedBadges[0].rarity).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ⑥ 반복 획득 — 「발급」과 「카운터 증가」 분리 (§2, B1묶음)
// ═══════════════════════════════════════════════════════════════════════

/** 반복형 계열 — 같은 이름의 Common(1회) · Rare(5회) */
function repeatFamily(): BadgeRow[] {
  return [makeRepeatBadge('RC-common', 'common', 1), makeRepeatBadge('RC-rare', 'rare', 5)]
}

describe('반복형 — 임계값 회차에서만 발급된다', () => {
  it('회차 3건이면 Common(1회)만 발급되고 Rare(5회)는 「충족 횟수 부족」으로 남는다', async () => {
    state.badges = repeatFamily()
    state.storedActivities = [101, 102, 103].map((id, i) => ({
      normalized: makeLongRun(id, `2026-04-1${i}T05:00:00Z`),
      start_date: `2026-04-1${i}T05:00:00Z`,
    }))

    const { earned, missed } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'test' })

    expect(earned.map((b) => b.id)).toEqual(['RC-common'])
    const rare = missed.find((m) => m.id === 'RC-rare')
    expect(rare?.reason).toBe('충족 횟수 부족')
    expect(rare?.actual).toBe('3회')
  })

  it('회차 술어를 만족하지 않는 활동은 회차로 세지 않는다 (total_count와 다르다)', async () => {
    // 30분짜리 러닝 5건 — 「활동 5회」지만 「60분 이상 활동」은 0건이다.
    // total_count였다면 통과했을 조건이 repeat_count에서는 통과하지 않는다.
    state.badges = repeatFamily()
    state.storedActivities = [201, 202, 203, 204, 205].map((id, i) => ({
      normalized: makeRun(`2026-04-1${i}T05:00:00Z`, { stravaId: id }),
      start_date: `2026-04-1${i}T05:00:00Z`,
    }))

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'test' })
    expect(earned).toHaveLength(0)
  })

  it('발급 시점에 쌓인 회차 전부가 earn_history에 들어간다 (다음 싱크에서 뒤늦게 더해지지 않게)', async () => {
    state.badges = [makeRepeatBadge('RC-common', 'common', 1)]
    state.storedActivities = [101, 102, 103].map((id, i) => ({
      normalized: makeLongRun(id, `2026-04-1${i}T05:00:00Z`),
      start_date: `2026-04-1${i}T05:00:00Z`,
    }))

    await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'test' })

    const inserted = state.inserts.find((p) => p.badge_id === 'RC-common')
    expect(inserted?.earn_count).toBe(3)
    expect(inserted?.earn_history?.map((h) => h.strava_activity_id)).toEqual([101, 102, 103])
  })
})

describe('반복형 — 보유해도 후보에서 빠지지 않는다 (B-1 · B-2)', () => {
  it('보유한 Common의 회차 카운터가 계속 오른다 — 「보유하면 제외」에 걸리지 않는다', async () => {
    state.badges = repeatFamily()
    state.ownedBadgeIds = ['RC-common']
    state.earnState['RC-common'] = {
      earn_count: 1,
      earn_history: [{ earned_at: '2026-04-10T05:00:00Z', strava_activity_id: 101 }],
    }
    state.storedActivities = [
      { normalized: makeLongRun(101, '2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' },
    ]

    await evaluateBadgesDetailed(USER_ID, [makeLongRun(102, '2026-04-11T05:00:00Z')], { triggeredBy: 'test' })

    expect(state.rpcCalls.map((c) => c.badgeId)).toEqual(['RC-common'])
    expect(state.earnState['RC-common'].earn_count).toBe(2)
  })

  it('상위 등급(Rare)을 보유해도 하위 등급(Common)이 성장 티어 비교로 탈락하지 않는다', async () => {
    // 등급형이었다면 rarityTier(common)=1 <= highestOwned(rare)=2 로 후보에서 빠진다.
    // 반복형은 하위 등급도 계속 카운터를 받아야 하므로 그 비교의 대상이 아니다.
    state.badges = repeatFamily()
    state.ownedBadgeIds = ['RC-common', 'RC-rare']
    state.earnState['RC-common'] = { earn_count: 5, earn_history: [] }
    state.earnState['RC-rare'] = { earn_count: 1, earn_history: [] }
    state.storedActivities = [101, 102, 103, 104, 105].map((id, i) => ({
      normalized: makeLongRun(id, `2026-04-1${i}T05:00:00Z`),
      start_date: `2026-04-1${i}T05:00:00Z`,
    }))

    await evaluateBadgesDetailed(USER_ID, [makeLongRun(106, '2026-04-16T05:00:00Z')], { triggeredBy: 'test' })

    expect(state.rpcCalls.map((c) => c.badgeId).sort()).toEqual(['RC-common', 'RC-rare'])
  })

  it('이번 배치에 새 회차가 없으면 RPC를 부르지 않는다', async () => {
    state.badges = [makeRepeatBadge('RC-common', 'common', 1)]
    state.ownedBadgeIds = ['RC-common']
    state.storedActivities = [
      { normalized: makeLongRun(101, '2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' },
    ]

    await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'test' })
    expect(state.rpcCalls).toHaveLength(0)
  })
})

describe('반복형 — 임계값이 아닌 회차는 피드·결산에 나타나지 않는다 (홍수 방지의 핵심)', () => {
  it('카운터만 오른 회차는 earned·피드 이벤트·결산 어디에도 없다', async () => {
    state.badges = repeatFamily()
    state.ownedBadgeIds = ['RC-common']
    state.earnState['RC-common'] = {
      earn_count: 1,
      earn_history: [{ earned_at: '2026-04-10T05:00:00Z', strava_activity_id: 101 }],
    }
    state.storedActivities = [
      { normalized: makeLongRun(101, '2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' },
    ]

    const { earned } = await evaluateBadgesDetailed(USER_ID, [makeLongRun(102, '2026-04-11T05:00:00Z')], {
      triggeredBy: 'test',
    })

    expect(earned).toHaveLength(0) // 결산·획득 연출은 earned만 본다
    expect(vi.mocked(recordFeedEvent)).not.toHaveBeenCalled()
    expect(vi.mocked(recordActivityRecap)).not.toHaveBeenCalled()
    expect(state.earnState['RC-common'].earn_count).toBe(2) // 카운터는 올랐다
  })

  it('임계값을 넘긴 회차에서는 피드 이벤트가 남는다 (대비군)', async () => {
    state.badges = [makeRepeatBadge('RC-common', 'common', 1)]
    state.storedActivities = [
      { normalized: makeLongRun(101, '2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' },
    ]

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'test' })
    expect(earned.map((b) => b.id)).toEqual(['RC-common'])
    expect(vi.mocked(recordFeedEvent)).toHaveBeenCalledTimes(1)
  })
})

describe('반복형 — 같은 활동으로 두 번 평가해도 회차는 한 번만 오른다 (멱등)', () => {
  it('같은 배치를 두 번 넘겨도 earn_count가 1만 오른다', async () => {
    state.badges = [makeRepeatBadge('RC-common', 'common', 1)]
    state.ownedBadgeIds = ['RC-common']
    state.earnState['RC-common'] = {
      earn_count: 1,
      earn_history: [{ earned_at: '2026-04-10T05:00:00Z', strava_activity_id: 101 }],
    }
    state.storedActivities = [
      { normalized: makeLongRun(101, '2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' },
    ]

    const batch = [makeLongRun(102, '2026-04-11T05:00:00Z')]
    await evaluateBadgesDetailed(USER_ID, batch, { triggeredBy: 'test' })
    await evaluateBadgesDetailed(USER_ID, batch, { triggeredBy: 'test' })

    expect(state.rpcCalls).toHaveLength(2) // 두 번 다 시도는 했다
    expect(state.earnState['RC-common'].earn_count).toBe(2) // 그런데 회차는 한 번만 올랐다
    expect(state.earnState['RC-common'].earn_history.map((h) => h.strava_activity_id)).toEqual([101, 102])
  })
})

describe('발급 3단 분리 — DB 반영에 실패한 배지는 부수효과에서 빠진다 (B-3)', () => {
  it('INSERT가 실패하면 earned·포인트·피드 어디에도 남지 않는다', async () => {
    state.badges = [
      makeBadge({
        id: 'FAIL-1',
        name: '실패 배지',
        point_reward: 100,
        condition_json: { activity_type: 'running', total_count: 1 },
      }),
    ]
    state.insertErrorByBadgeId['FAIL-1'] = { code: '23503', message: 'FK 위반' }
    state.storedActivities = [
      { normalized: makeRun('2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' },
    ]

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'test' })

    expect(state.inserts.map((p) => p.badge_id)).toEqual(['FAIL-1']) // 시도는 했다
    expect(earned).toHaveLength(0) // 예전에는 여기 남아 결산·연출에 나갔다
    expect(vi.mocked(awardPoints)).not.toHaveBeenCalled()
    expect(vi.mocked(recordFeedEvent)).not.toHaveBeenCalled()
  })

  it('중복키(23505)로 실패해도 마찬가지다 — 동시 싱크가 결산을 두 번 만들지 않는다', async () => {
    state.badges = [
      makeBadge({ id: 'DUP-1', name: '중복 배지', condition_json: { activity_type: 'running', total_count: 1 } }),
    ]
    state.insertErrorByBadgeId['DUP-1'] = { code: '23505', message: 'duplicate key' }
    state.storedActivities = [
      { normalized: makeRun('2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' },
    ]

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'test' })
    expect(earned).toHaveLength(0)
    expect(vi.mocked(recordFeedEvent)).not.toHaveBeenCalled()
  })

  it('dryRun에서는 DB를 건드리지 않고 earned만 채운다 (어드민 시뮬레이터 회귀)', async () => {
    state.badges = [
      makeBadge({ id: 'OK-1', name: '정상 배지', condition_json: { activity_type: 'running', total_count: 1 } }),
    ]
    state.storedActivities = [
      { normalized: makeRun('2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' },
    ]

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { dryRun: true })
    expect(earned.map((b) => b.id)).toEqual(['OK-1'])
    expect(state.inserts).toHaveLength(0)
    expect(vi.mocked(recordFeedEvent)).not.toHaveBeenCalled()
  })
})
