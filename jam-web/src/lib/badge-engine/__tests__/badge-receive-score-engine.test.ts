/**
 * 엔진 새 발급 → 챕터 점수 «배지 받기» 연결 (티켓 20261019_1315 2a회, 운영 로직 12.2절)
 *
 * `evaluateBadgesDetailed`가 `user_activity_badges`에 **새 행을 실제로 넣은** 발급마다 `chapter_add_score('badge_receive')`를 부르는지 고정한다.
 * 쿼리 빌더·반복형 RPC 모킹은 shadow-ban-gate.test.ts의 관례를 따르고, 점수 RPC와 이용 정지 조회를 더했다.
 *
 * 검증 대상:
 *  - 새로 발급한 배지는 (유저, 배지) 결정적 원천 id로 한 번 센다. 레벨형은 레벨마다, 반복형의 첫 획득도 센다
 *  - 세지 않는 것: 23505(이미 보유) · dryRun · 카탈로그 재평가 배치 · 어드민 시뮬레이터 · 숨김 배지 · 이용 정지 유저
 *  - 이미 보유한 반복형의 새 회차(increment 경로)는 이번 회차에서 세지 않는다(2b회 몫)
 *  - 점수 호출이 실패해도 발급 결과(earned·insert)는 그대로다
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
vi.mock('@/lib/abusing/shadow-ban', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/abusing/shadow-ban')>()
  return { ...actual, getUserBanLevel: vi.fn(async () => 'none') }
})
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

  it('이미 보유한 반복형의 새 회차(increment 경로)는 이번 회차에서 세지 않는다 (2b회 몫)', async () => {
    state.badges = [makeRepeatBadge('REP-rare', 'rare', 1)]
    state.ownedBadgeIds = ['REP-rare']
    state.earnState['REP-rare'] = { earn_count: 1, earn_history: [{ earned_at: '2026-04-10T05:00:00Z', strava_activity_id: 101 }] }
    state.storedActivities = [
      { normalized: makeRun(101, '2026-04-10T05:00:00Z', { movingTimeSec: 60 * 60 }), start_date: '2026-04-10T05:00:00Z' },
    ]

    // 이번 배치의 활동 102가 새 회차다
    const { earned, counted } = await evaluateBadgesDetailed(USER_ID, [makeRun(102, '2026-04-11T05:00:00Z', { movingTimeSec: 60 * 60 })], {
      triggeredBy: 'strava_sync',
    })

    expect(earned).toEqual([])
    expect(counted.map((c) => c.id)).toEqual(['REP-rare']) // 회차 카운터는 올랐다
    expect(state.scoreCalls).toEqual([])
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
