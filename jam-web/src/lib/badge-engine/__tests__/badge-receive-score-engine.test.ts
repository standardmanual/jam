/**
 * 엔진 새 발급 → 챕터 점수 «배지 받기» 연결 (티켓 20261019_1315 2a회, 운영 로직 12.2절)
 *
 * `evaluateBadgesDetailed`가 `user_activity_badges`에 **새 행을 실제로 넣은** 발급마다 `chapter_add_score('badge_receive')`를 부르는지 고정한다.
 * 쿼리 빌더·반복형 RPC 모킹은 shadow-ban-gate.test.ts의 관례를 따르고, 점수 RPC와 이용 정지 조회를 더했다.
 *
 * 검증 대상:
 *  - 새로 발급한 배지는 (유저, 배지) 결정적 원천 id로 한 번 센다. 레벨형은 레벨마다, 반복형의 첫 획득도 센다
 *  - 세지 않는 것: 23505(이미 보유) · dryRun · 카탈로그 재평가 배치 · 어드민 시뮬레이터 · 숨김 배지 · 이용 정지 유저
 *  - 점수 호출이 실패해도 발급 결과(earned·insert)는 그대로다
 *  - (2b회, 티켓 20261019_1315 14·15번) 이미 보유한 반복형의 새 회차(increment 경로)는 회차마다 (유저, 배지, 활동 id) 키로 한 번씩 센다.
 *    첫 획득의 (유저, 배지) 키와 구분되고, 카운터가 늘지 않았거나 dryRun이면 부르지 않으며, 제외 규칙은 회차에도 적용되고, 점수 실패는 카운터·반환을 바꾸지 않는다.
 *    미보유 반복형의 첫 평가에서 새 회차가 여러 건이면 계기 활동은 (유저, 배지) 키로만, 나머지 새 회차는 활동 id 키로 센다(계기 활동 이중 가산 없음)
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/badge-receive-score-engine.test.ts
 */
import { evaluateBadgesDetailed } from '../index'
import { deterministicSourceId } from '@/lib/chapter/source-id'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeEarnHistoryEntry, BadgeRarity, BadgeRow } from '@/types/database'

const USER_ID = 'user-badge-receive'
const SIGNUP_AT = '2026-03-01T00:00:00Z'

function makeRun(stravaId: number, startDate: string, overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return {
    stravaId,
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
function makeGradedBadge(id: string, rarity: BadgeRarity, overrides: Partial<BadgeRow> = {}): BadgeRow {
  return makeBadge({ id, name: `등급형-${id}`, rarity, condition_json: { activity_type: 'running', total_count: 1 }, ...overrides })
}

/** 무한레벨형 한 칸 — `rarity: null` + `level` */
function makeLevelBadge(level: number, familyKey: string): BadgeRow {
  return makeBadge({
    id: `${familyKey}-lv${level}`,
    name: '무한 러너',
    rarity: null,
    level,
    family_key: familyKey,
    sort_order: 10,
    condition_json: { activity_type: 'running', total_count: 1 },
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

// ── 모킹 ─────────────────────────────────────────────────────────────────

type EarnState = { earn_count: number; earn_history: BadgeEarnHistoryEntry[] }
type InsertPayload = { badge_id: string; earn_count?: number; earn_history?: BadgeEarnHistoryEntry[] }
type ScoreCall = { p_user_id: string; p_activity_kind: string; p_source_id: string; p_amount: number; p_occurred_on?: string }

const state: {
  badges: BadgeRow[]
  ownedBadgeIds: string[]
  storedActivities: { normalized: NormalizedActivity; start_date: string }[]
  user: { initial_sync_done: boolean; created_at: string | null }
  earnState: Record<string, EarnState>
  inserts: InsertPayload[]
  scoreCalls: ScoreCall[]
  /** true면 이용 정지 중이다 */
  suspended: boolean
  /** 이 배지 id의 insert는 23505(동시 발급 경합)로 거절된다 */
  conflictBadgeIds: string[]
  /** true면 점수 RPC가 오류를 돌려준다 */
  scoreRpcFails: boolean
  /** true면 점수 RPC가 예외를 던진다 */
  scoreRpcThrows: boolean
} = {
  badges: [],
  ownedBadgeIds: [],
  storedActivities: [],
  user: { initial_sync_done: true, created_at: SIGNUP_AT },
  earnState: {},
  inserts: [],
  scoreCalls: [],
  suspended: false,
  conflictBadgeIds: [],
  scoreRpcFails: false,
  scoreRpcThrows: false,
}

function resetState() {
  state.badges = []
  state.ownedBadgeIds = []
  state.storedActivities = []
  state.user = { initial_sync_done: true, created_at: SIGNUP_AT }
  state.earnState = {}
  state.inserts = []
  state.scoreCalls = []
  state.suspended = false
  state.conflictBadgeIds = []
  state.scoreRpcFails = false
  state.scoreRpcThrows = false
}

function oneRun() {
  state.storedActivities = [{ normalized: makeRun(1, '2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' }]
}

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
    builder.maybeSingle = () => {
      if (table === 'users') return Promise.resolve({ data: state.user, error: null })
      if (table === 'user_suspensions' && state.suspended) {
        return Promise.resolve({ data: { id: 's-1', reason: '운영 정책 위반', suspended_at: '2026-10-01T00:00:00Z' }, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    }
    builder.insert = (payload: InsertPayload) => {
      if (table !== 'user_activity_badges') return Promise.resolve({ data: null, error: null })
      state.inserts.push(payload)
      if (state.conflictBadgeIds.includes(payload.badge_id) || state.ownedBadgeIds.includes(payload.badge_id)) {
        return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } })
      }
      state.ownedBadgeIds.push(payload.badge_id)
      state.earnState[payload.badge_id] = { earn_count: payload.earn_count ?? 1, earn_history: payload.earn_history ?? [] }
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

  const rpc = (name: string, args: Record<string, unknown>) => {
    if (name === 'chapter_add_score') {
      state.scoreCalls.push(args as unknown as ScoreCall)
      if (state.scoreRpcThrows) throw new Error('점수 함수 예외')
      if (state.scoreRpcFails) return Promise.resolve({ data: null, error: { message: '점수 함수 오류' } })
      return Promise.resolve({ data: [{ score_added: 10, current_chapter: null, reached_chapters: [] }], error: null })
    }
    if (name !== 'increment_activity_badge_earn') return Promise.resolve({ data: null, error: null })
    const badgeId = args.p_badge_id as string
    const entries = (args.p_entries ?? []) as BadgeEarnHistoryEntry[]
    if (!state.ownedBadgeIds.includes(badgeId)) return Promise.resolve({ data: 0, error: null })
    const row = (state.earnState[badgeId] ??= { earn_count: 1, earn_history: [] })
    let added = 0
    for (const entry of entries) {
      const id = entry.strava_activity_id
      if (id == null || row.earn_history.some((h) => h.strava_activity_id === id)) continue
      row.earn_count += 1
      row.earn_history = [...row.earn_history, entry]
      added += 1
    }
    return Promise.resolve({ data: added, error: null })
  }

  return { from, rpc }
}

const logEngineMock = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => mockSupabase() }))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/points', () => ({ awardPoints: vi.fn(async () => true) }))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: logEngineMock }))
vi.mock('@/lib/notifications/recap', () => ({ recordActivityRecap: vi.fn(async () => {}) }))
vi.mock('@/lib/abusing/policy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/abusing/policy')>()
  return { ...actual, getAbusingPolicy: vi.fn(async () => actual.DEFAULT_POLICY) }
})

beforeEach(() => {
  resetState()
  logEngineMock.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function scoredSourceIds(): string[] {
  return state.scoreCalls.map((c) => c.p_source_id)
}

// ═══════════════════════════════════════════════════════════════════════

describe('엔진 새 발급 → «배지 받기» 점수', () => {
  it('새로 발급한 배지는 badge_receive 1단위로 한 번 센다 — 원천 id는 (유저, 배지) 결정적 id, 날짜는 보내지 않는다', async () => {
    state.badges = [makeGradedBadge('G-common', 'common')]
    oneRun()

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'strava_sync' })

    expect(earned.map((b) => b.id)).toEqual(['G-common'])
    expect(state.scoreCalls).toEqual([
      {
        p_user_id: USER_ID,
        p_activity_kind: 'badge_receive',
        p_source_id: deterministicSourceId('badge_receive', USER_ID, 'G-common'),
        p_amount: 1,
      },
    ])
  })

  it('같은 배지를 다시 받아도(초기화·삭제 뒤 재획득) 같은 (활동 종류, 원천 id)를 보낸다', async () => {
    state.badges = [makeGradedBadge('G-common', 'common')]
    oneRun()

    await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'strava_sync' })
    // 어드민 초기화로 보유 기록이 지워졌다고 보고 같은 조건으로 다시 평가한다
    state.ownedBadgeIds = []
    await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'strava_sync' })

    expect(state.inserts).toHaveLength(2)
    expect(state.scoreCalls).toHaveLength(2)
    expect(state.scoreCalls[0].p_activity_kind).toBe(state.scoreCalls[1].p_activity_kind)
    expect(state.scoreCalls[0].p_source_id).toBe(state.scoreCalls[1].p_source_id)
  })

  it('레벨형은 레벨마다 새 행이라 레벨마다 다른 원천 id로 센다', async () => {
    state.badges = [makeLevelBadge(1, 'run:infinite'), makeLevelBadge(2, 'run:infinite'), makeLevelBadge(3, 'run:infinite')]
    oneRun()

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'strava_sync' })

    expect(earned.map((b) => b.id).sort()).toEqual(['run:infinite-lv1', 'run:infinite-lv2', 'run:infinite-lv3'])
    expect(state.scoreCalls).toHaveLength(3)
    expect(new Set(scoredSourceIds()).size).toBe(3)
    expect(scoredSourceIds().sort()).toEqual(
      ['run:infinite-lv1', 'run:infinite-lv2', 'run:infinite-lv3'].map((id) => deterministicSourceId('badge_receive', USER_ID, id)).sort()
    )
  })

  it('반복형의 첫 획득은 새 행이라 센다 (원천 id는 (유저, 배지) — 회차 구분 값이 없다)', async () => {
    state.badges = [makeRepeatBadge('REP-rare', 'rare', 1)]
    state.storedActivities = [
      { normalized: makeRun(101, '2026-04-10T05:00:00Z', { movingTimeSec: 60 * 60 }), start_date: '2026-04-10T05:00:00Z' },
    ]

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'strava_sync' })

    expect(earned.map((b) => b.id)).toEqual(['REP-rare'])
    expect(scoredSourceIds()).toEqual([deterministicSourceId('badge_receive', USER_ID, 'REP-rare')])
  })
})

describe('엔진 새 발급 → 세지 않는 것', () => {
  it('동시 발급 경합(23505)은 이미 보유한 것이라 세지 않는다', async () => {
    state.badges = [makeGradedBadge('G-common', 'common')]
    state.conflictBadgeIds = ['G-common']
    oneRun()

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'strava_sync' })

    expect(earned).toEqual([])
    expect(state.inserts).toHaveLength(1)
    expect(state.scoreCalls).toEqual([])
  })

  it('dryRun은 DB에 쓰지 않고 점수도 부르지 않는다', async () => {
    state.badges = [makeGradedBadge('G-common', 'common')]
    oneRun()

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'strava_sync', dryRun: true })

    expect(earned.map((b) => b.id)).toEqual(['G-common'])
    expect(state.inserts).toEqual([])
    expect(state.scoreCalls).toEqual([])
  })

  it.each(['catalog_reevaluation', 'admin_simulate'])('%s 트리거로 소급·시험 발급된 배지는 발급은 되지만 세지 않는다', async (triggeredBy) => {
    state.badges = [makeGradedBadge('G-common', 'common')]
    oneRun()

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy, silent: true })

    expect(earned.map((b) => b.id)).toEqual(['G-common'])
    expect(state.inserts).toHaveLength(1)
    expect(state.scoreCalls).toEqual([])
  })

  it('숨김 배지는 발급은 되지만 세지 않는다 (같이 발급된 보이는 배지는 센다)', async () => {
    state.badges = [makeGradedBadge('G-hidden', 'common', { is_hidden: true }), makeGradedBadge('G-visible', 'common')]
    oneRun()

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'strava_sync' })

    expect(earned.map((b) => b.id).sort()).toEqual(['G-hidden', 'G-visible'])
    expect(scoredSourceIds()).toEqual([deterministicSourceId('badge_receive', USER_ID, 'G-visible')])
  })

  it('이용 정지 중인 유저가 받은 배지는 발급은 되지만 세지 않는다', async () => {
    state.badges = [makeGradedBadge('G-common', 'common')]
    state.suspended = true
    oneRun()

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'strava_sync' })

    expect(earned.map((b) => b.id)).toEqual(['G-common'])
    expect(state.scoreCalls).toEqual([])
  })
})

describe('엔진 새 발급 → 점수 실패는 발급을 막지 않는다', () => {
  it('점수 RPC가 오류여도 발급 결과·insert는 그대로이고 실패를 기록한다', async () => {
    state.badges = [makeGradedBadge('G-a', 'common'), makeGradedBadge('G-b', 'common')]
    state.scoreRpcFails = true
    oneRun()

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { triggeredBy: 'strava_sync' })

    expect(earned.map((b) => b.id).sort()).toEqual(['G-a', 'G-b'])
    expect(state.inserts.map((p) => p.badge_id).sort()).toEqual(['G-a', 'G-b'])
    // 한 배지의 점수 실패가 다음 배지의 점수를 막지 않는다
    expect(state.scoreCalls).toHaveLength(2)
    expect(logEngineMock).toHaveBeenCalledWith('points', 'chapter_score_failed', USER_ID, expect.objectContaining({ kind: 'badge_receive' }))
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2b회 — 반복형의 새 회차 (티켓 20261019_1315 14·15번)

const HOUR_SEC = 60 * 60

/** 반복형(60분 이상 러닝이 회차 1건)에 맞는 활동 */
function longRun(stravaId: number, startDate: string): NormalizedActivity {
  return makeRun(stravaId, startDate, { movingTimeSec: HOUR_SEC })
}

/** 이번 배치의 새 회차 3건 */
function newRuns(): NormalizedActivity[] {
  return [longRun(102, '2026-04-11T05:00:00Z'), longRun(103, '2026-04-12T05:00:00Z'), longRun(104, '2026-04-13T05:00:00Z')]
}

/** 반복형을 이미 가진 상태 — 첫 획득의 근거 회차(활동 101) 하나가 earn_history에 들어 있다 */
function ownRepeatBadge(id = 'REP-rare', overrides: Partial<BadgeRow> = {}) {
  state.badges = [{ ...makeRepeatBadge(id, 'rare', 1), ...overrides }]
  state.ownedBadgeIds = [id]
  state.earnState[id] = { earn_count: 1, earn_history: [{ earned_at: '2026-04-10T05:00:00Z', strava_activity_id: 101 }] }
  state.storedActivities = [{ normalized: longRun(101, '2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' }]
}

/** 회차 점수의 원천 id = (유저, 배지, 활동 id) */
function occurrenceId(badgeId: string, stravaId: number): string {
  return deterministicSourceId('badge_receive', USER_ID, badgeId, String(stravaId))
}

describe('이미 가진 반복형의 새 회차(increment 경로) → «배지 받기» 점수', () => {
  it('늘어난 회차마다 (유저, 배지, 활동 id) 원천 id로 한 번씩 센다 — 회차 3건이면 서로 다른 키 3개, 수량 1, 날짜는 보내지 않는다', async () => {
    ownRepeatBadge()

    const { earned, counted } = await evaluateBadgesDetailed(USER_ID, newRuns(), { triggeredBy: 'strava_sync' })

    expect(earned).toEqual([]) // 회차는 발급이 아니다
    expect(counted).toEqual([{ id: 'REP-rare', name: '반복 러너', addedEarnCount: 3 }])
    expect(state.scoreCalls).toHaveLength(3)
    expect(state.scoreCalls.every((c) => c.p_user_id === USER_ID && c.p_activity_kind === 'badge_receive' && c.p_amount === 1)).toBe(true)
    expect(state.scoreCalls.every((c) => !('p_occurred_on' in c))).toBe(true)
    expect(new Set(scoredSourceIds()).size).toBe(3)
    expect([...scoredSourceIds()].sort()).toEqual([102, 103, 104].map((id) => occurrenceId('REP-rare', id)).sort())
  })

  it('회차 키는 첫 획득의 (유저, 배지) 키와 다르다', async () => {
    ownRepeatBadge()

    await evaluateBadgesDetailed(USER_ID, newRuns(), { triggeredBy: 'strava_sync' })

    expect(scoredSourceIds()).not.toContain(deterministicSourceId('badge_receive', USER_ID, 'REP-rare'))
  })

  it('같은 회차를 다시 보내도 같은 키다 — 카운터가 이미 올랐으면 점수를 다시 보내지 않는다', async () => {
    ownRepeatBadge()

    await evaluateBadgesDetailed(USER_ID, newRuns(), { triggeredBy: 'strava_sync' })
    const firstKeys = [...scoredSourceIds()].sort()
    expect(firstKeys).toHaveLength(3)

    // 같은 배치를 다시 평가 — 회차가 이미 earn_history에 있어 RPC가 0을 돌려주고(added === 0) 점수를 부르지 않는다
    const second = await evaluateBadgesDetailed(USER_ID, newRuns(), { triggeredBy: 'strava_sync' })
    expect(second.counted).toEqual([])
    expect(state.scoreCalls).toHaveLength(3)

    // earn_history가 비워진 틈(상한 밖으로 밀림·초기화)에서 다시 보내도 키는 같아 DB가 이중 가산하지 않는다
    state.earnState['REP-rare'] = { earn_count: 1, earn_history: [{ earned_at: '2026-04-10T05:00:00Z', strava_activity_id: 101 }] }
    await evaluateBadgesDetailed(USER_ID, newRuns(), { triggeredBy: 'strava_sync' })
    expect(state.scoreCalls).toHaveLength(6)
    expect([...scoredSourceIds()].slice(3).sort()).toEqual(firstKeys)
  })

  it('카운터가 늘지 않았으면(added === 0) 점수를 부르지 않는다', async () => {
    ownRepeatBadge()

    // 배치의 활동 101은 이미 earn_history에 있는 회차다
    const { counted } = await evaluateBadgesDetailed(USER_ID, [longRun(101, '2026-04-10T05:00:00Z')], { triggeredBy: 'strava_sync' })

    expect(counted).toEqual([])
    expect(state.scoreCalls).toEqual([])
  })

  it('회차 일부만 늘어도(added > 0) 이번 배치의 회차 전체를 같은 키 규칙으로 보낸다 — 이미 센 회차는 DB가 같은 결과를 돌려준다', async () => {
    ownRepeatBadge()
    // 활동 102는 이미 회차로 세어져 있다
    state.earnState['REP-rare'].earn_history.push({ earned_at: '2026-04-11T05:00:00Z', strava_activity_id: 102 })
    state.earnState['REP-rare'].earn_count = 2

    const { counted } = await evaluateBadgesDetailed(USER_ID, newRuns(), { triggeredBy: 'strava_sync' })

    expect(counted[0].addedEarnCount).toBe(2) // 103, 104만 늘었다
    expect([...scoredSourceIds()].sort()).toEqual([102, 103, 104].map((id) => occurrenceId('REP-rare', id)).sort())
  })

  it('dryRun이면 DB에 쓰지 않고 점수도 부르지 않는다 (회차는 counted에 기록된다)', async () => {
    ownRepeatBadge()

    const { counted } = await evaluateBadgesDetailed(USER_ID, newRuns(), { triggeredBy: 'strava_sync', dryRun: true })

    expect(counted).toEqual([{ id: 'REP-rare', name: '반복 러너', addedEarnCount: 3 }])
    expect(state.earnState['REP-rare'].earn_count).toBe(1)
    expect(state.scoreCalls).toEqual([])
  })

  it.each(['catalog_reevaluation', 'admin_simulate', 'admin_test'])('%s 트리거의 회차는 카운터만 오르고 점수는 세지 않는다', async (triggeredBy) => {
    ownRepeatBadge()

    const { counted } = await evaluateBadgesDetailed(USER_ID, newRuns(), { triggeredBy, silent: true })

    expect(counted[0].addedEarnCount).toBe(3)
    expect(state.scoreCalls).toEqual([])
  })

  it('숨김 배지의 회차는 카운터만 오르고 점수는 세지 않는다', async () => {
    ownRepeatBadge('REP-hidden', { is_hidden: true })

    const { counted } = await evaluateBadgesDetailed(USER_ID, newRuns(), { triggeredBy: 'strava_sync' })

    expect(counted[0].addedEarnCount).toBe(3)
    expect(state.scoreCalls).toEqual([])
  })

  it('이용 정지 중인 유저의 회차는 카운터만 오르고 점수는 세지 않는다', async () => {
    ownRepeatBadge()
    state.suspended = true

    const { counted } = await evaluateBadgesDetailed(USER_ID, newRuns(), { triggeredBy: 'strava_sync' })

    expect(counted[0].addedEarnCount).toBe(3)
    expect(state.scoreCalls).toEqual([])
  })

  it.each([
    ['점수 RPC 오류', 'scoreRpcFails'],
    ['점수 RPC 예외', 'scoreRpcThrows'],
  ] as const)('%s는 카운터 증가·counted·반환값을 바꾸지 않고 회차마다 기록한다', async (_label, flag) => {
    ownRepeatBadge()
    state[flag] = true

    const result = await evaluateBadgesDetailed(USER_ID, newRuns(), { triggeredBy: 'strava_sync' })

    expect(result.earned).toEqual([])
    expect(result.missed).toEqual([])
    expect(result.counted).toEqual([{ id: 'REP-rare', name: '반복 러너', addedEarnCount: 3 }])
    expect(state.earnState['REP-rare'].earn_count).toBe(4)
    expect(state.scoreCalls).toHaveLength(3) // 한 회차의 실패가 다음 회차를 막지 않는다
    expect(logEngineMock.mock.calls.filter((c) => (c as unknown[])[1] === 'chapter_score_failed')).toHaveLength(3)
  })
})

describe('미보유 반복형의 첫 평가에서 새 회차가 여러 건일 때 — 계기 활동은 한 번만 센다', () => {
  it('첫 발급 행은 회차를 모두 담고, 계기 활동은 (유저, 배지) 키로만, 나머지 새 회차는 활동 id 키로 센다', async () => {
    state.badges = [makeRepeatBadge('REP-rare', 'rare', 1)]

    const { earned, counted } = await evaluateBadgesDetailed(USER_ID, newRuns(), { triggeredBy: 'strava_sync' })

    expect(earned.map((b) => b.id)).toEqual(['REP-rare'])
    expect(counted).toEqual([]) // 첫 발급은 increment가 아니다
    // 행이 담는 것: 회차 3건 전부 (earn_count = 회차 수, earn_history = 회차별 활동 id)
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0].earn_count).toBe(3)
    expect(state.inserts[0].earn_history?.map((h) => h.strava_activity_id)).toEqual([102, 103, 104])
    // repeat_count 1의 계기 활동은 첫 회차(102)다 — 102는 (유저, 배지) 키가 대신하고, 103·104만 활동 id 키로 센다
    expect(state.scoreCalls).toHaveLength(3)
    expect(new Set(scoredSourceIds()).size).toBe(3)
    expect([...scoredSourceIds()].sort()).toEqual(
      [deterministicSourceId('badge_receive', USER_ID, 'REP-rare'), occurrenceId('REP-rare', 103), occurrenceId('REP-rare', 104)].sort()
    )
    expect(scoredSourceIds()).not.toContain(occurrenceId('REP-rare', 102))
  })

  it('계기 활동은 repeat_count번째 회차다 — 첫 회차가 아니어도 그 회차만 빠진다', async () => {
    state.badges = [makeRepeatBadge('REP-rare', 'rare', 2)]

    await evaluateBadgesDetailed(USER_ID, newRuns(), { triggeredBy: 'strava_sync' })

    // repeat_count 2의 계기 활동은 두 번째 회차(103)
    expect([...scoredSourceIds()].sort()).toEqual(
      [deterministicSourceId('badge_receive', USER_ID, 'REP-rare'), occurrenceId('REP-rare', 102), occurrenceId('REP-rare', 104)].sort()
    )
  })

  it('이번 배치 밖에서 이미 쌓여 있던 과거 회차(저장된 이력)는 새 회차가 아니라 세지 않는다', async () => {
    state.badges = [makeRepeatBadge('REP-rare', 'rare', 1)]
    state.storedActivities = [{ normalized: longRun(101, '2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' }]

    const runs = [longRun(102, '2026-04-11T05:00:00Z'), longRun(103, '2026-04-12T05:00:00Z')]
    await evaluateBadgesDetailed(USER_ID, runs, { triggeredBy: 'strava_sync' })

    // 행에는 101·102·103이 모두 담기지만(계기 활동은 101) 점수는 (유저, 배지) + 새 회차 102·103이다
    expect(state.inserts[0].earn_history?.map((h) => h.strava_activity_id)).toEqual([101, 102, 103])
    expect([...scoredSourceIds()].sort()).toEqual(
      [deterministicSourceId('badge_receive', USER_ID, 'REP-rare'), occurrenceId('REP-rare', 102), occurrenceId('REP-rare', 103)].sort()
    )
  })

  it('같은 배치를 다시 평가해도 점수가 늘지 않는다 (첫 발급 뒤에는 보유 상태라 RPC가 이미 센 회차를 거절한다)', async () => {
    state.badges = [makeRepeatBadge('REP-rare', 'rare', 1)]

    await evaluateBadgesDetailed(USER_ID, newRuns(), { triggeredBy: 'strava_sync' })
    expect(state.scoreCalls).toHaveLength(3)

    await evaluateBadgesDetailed(USER_ID, newRuns(), { triggeredBy: 'strava_sync' })
    expect(state.scoreCalls).toHaveLength(3)
  })

  it('첫 획득이 제외 대상이면(숨김) 회차도 세지 않는다 — 발급은 그대로다', async () => {
    state.badges = [{ ...makeRepeatBadge('REP-hidden', 'rare', 1), is_hidden: true }]

    const { earned } = await evaluateBadgesDetailed(USER_ID, newRuns(), { triggeredBy: 'strava_sync' })

    expect(earned.map((b) => b.id)).toEqual(['REP-hidden'])
    expect(state.inserts).toHaveLength(1)
    expect(state.scoreCalls).toEqual([])
  })

  it('회차가 하나뿐이면 계기 활동 하나가 전부라 (유저, 배지) 키 한 건만 센다', async () => {
    state.badges = [makeRepeatBadge('REP-rare', 'rare', 1)]

    await evaluateBadgesDetailed(USER_ID, [longRun(102, '2026-04-11T05:00:00Z')], { triggeredBy: 'strava_sync' })

    expect(scoredSourceIds()).toEqual([deterministicSourceId('badge_receive', USER_ID, 'REP-rare')])
  })
})
