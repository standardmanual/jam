/**
 * 발급 엔진 v5 A묶음 회귀 — 가입 시점 앵커 · 무한레벨 발급 · 첫 싱크 게이트 재정의
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
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeRow } from '@/types/database'

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

const state: {
  badges: BadgeRow[]
  ownedBadgeIds: string[]
  storedActivities: StoredActivity[]
  user: { initial_sync_done: boolean; created_at: string | null }
  /** strava_activities 조회에 실제로 걸린 gte 필터 값 — 앵커가 적용됐는지의 직접 증거 */
  lastHistoryGte: string | undefined
} = {
  badges: [],
  ownedBadgeIds: [],
  storedActivities: [],
  user: { initial_sync_done: true, created_at: SIGNUP_AT },
  lastHistoryGte: undefined,
}

function resetState() {
  state.badges = []
  state.ownedBadgeIds = []
  state.storedActivities = []
  state.user = { initial_sync_done: true, created_at: SIGNUP_AT }
  state.lastHistoryGte = undefined
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
    builder.maybeSingle = () =>
      Promise.resolve(table === 'users' ? { data: state.user, error: null } : { data: null, error: null })
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
  return { from }
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => mockSupabase() }))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/points', () => ({ awardPoints: vi.fn(async () => true) }))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications/recap', () => ({ recordActivityRecap: vi.fn(async () => {}) }))

beforeEach(() => resetState())

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
