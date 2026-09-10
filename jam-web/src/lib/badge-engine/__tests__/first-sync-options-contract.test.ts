/**
 * `forceFirstSyncGate` · `skipInitialSyncFlagUpdate` 계약 고정 (티켓 20260906_1928)
 *
 * 예전엔 `overrideFirstSync?: boolean` 하나가 「첫 싱크 게이트 적용 여부」와
 * 「`users.initial_sync_done` 갱신 여부」라는 서로 다른 두 계약을 동시에 표현했다 —
 * 값(true/false/undefined) 하나로 두 결정을 동시에 내려야 해서, 새 호출부가 추가되면
 * 같은 함정(값 기준 vs 호출 의도 기준의 혼동, 티켓 20260906_1431 게이트 리뷰 FAIL)에
 * 다시 빠질 위험이 있었다. 이 테스트는 두 파라미터가 분리된 뒤에도 각자의 계약이
 * 독립적으로 성립함을 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/first-sync-options-contract.test.ts
 *
 * 모킹은 badge-engine-v5.test.ts의 관례를 그대로 따른다 — supabase-js 쿼리 빌더를
 * 최소 연산자만 구현한 흉내로 대체하고, `users` 테이블 UPDATE 호출 여부를 직접 기록한다.
 */
import { evaluateBadgesDetailed } from '../index'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeRow } from '@/types/database'

const USER_ID = 'user-first-sync-contract'
const SIGNUP_AT = '2026-03-01T00:00:00Z'

function makeRun(startDate: string): NormalizedActivity {
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

type StoredActivity = { normalized: NormalizedActivity; start_date: string }

const state: {
  badges: BadgeRow[]
  ownedBadgeIds: string[]
  storedActivities: StoredActivity[]
  user: { initial_sync_done: boolean; created_at: string | null }
  /** `users` 테이블에 실제로 시도된 UPDATE 페이로드 (initial_sync_done 갱신 여부의 직접 증거) */
  userUpdates: Record<string, unknown>[]
} = {
  badges: [],
  ownedBadgeIds: [],
  storedActivities: [],
  user: { initial_sync_done: false, created_at: SIGNUP_AT },
  userUpdates: [],
}

function resetState() {
  state.badges = []
  state.ownedBadgeIds = []
  state.storedActivities = []
  state.user = { initial_sync_done: false, created_at: SIGNUP_AT }
  state.userUpdates = []
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
    builder.update = (payload: Record<string, unknown>) => {
      if (table === 'users') state.userUpdates.push(payload)
      return builder
    }
    builder.maybeSingle = () =>
      Promise.resolve(table === 'users' ? { data: state.user, error: null } : { data: null, error: null })
    builder.insert = (payload: { badge_id: string }) => {
      if (table !== 'user_activity_badges') return Promise.resolve({ data: null, error: null })
      if (state.ownedBadgeIds.includes(payload.badge_id)) {
        return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } })
      }
      state.ownedBadgeIds.push(payload.badge_id)
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
  const rpc = () => Promise.resolve({ data: null, error: null })
  return { from, rpc }
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => mockSupabase() }))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/points', () => ({ awardPoints: vi.fn(async () => true) }))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications/recap', () => ({ recordActivityRecap: vi.fn(async () => {}) }))

beforeEach(() => {
  resetState()
  vi.clearAllMocks()
})

/** 등급형 Common/Rare 한 벌 — 첫 싱크 게이트(Common만 통과) 판정용 */
function gradedPair(): BadgeRow[] {
  return [
    makeBadge({ id: 'C1', name: '커먼', rarity: 'common', condition_json: { activity_type: 'running', total_count: 1 } }),
    makeBadge({ id: 'R1', name: '레어', rarity: 'rare', condition_json: { activity_type: 'running', total_count: 1 } }),
  ]
}

function oneRun() {
  state.storedActivities = [{ normalized: makeRun('2026-04-10T05:00:00Z'), start_date: '2026-04-10T05:00:00Z' }]
}

describe('forceFirstSyncGate — 첫 싱크 게이트 적용 여부', () => {
  it('미지정 + userInitialSyncDone=false → 게이트가 적용된다 (Rare 탈락)', async () => {
    state.user = { initial_sync_done: false, created_at: SIGNUP_AT }
    state.badges = gradedPair()
    oneRun()

    const { earned, missed } = await evaluateBadgesDetailed(USER_ID, [], { dryRun: true })
    expect(earned.map((b) => b.id)).toEqual(['C1'])
    expect(missed.find((m) => m.id === 'R1')?.reason).toBe('첫 싱크 게이트 — Common 등급만 발급')
  })

  it('forceFirstSyncGate=true + userInitialSyncDone=true → 그래도 게이트가 강제 적용된다', async () => {
    // 실제 상태는 이미 동기화 완료(true)라 원래대로면 게이트가 안 걸려야 하지만,
    // 강제 override가 실제 상태보다 우선한다.
    state.user = { initial_sync_done: true, created_at: SIGNUP_AT }
    state.badges = gradedPair()
    oneRun()

    const { earned, missed } = await evaluateBadgesDetailed(USER_ID, [], { dryRun: true, forceFirstSyncGate: true })
    expect(earned.map((b) => b.id)).toEqual(['C1'])
    expect(missed.find((m) => m.id === 'R1')?.reason).toBe('첫 싱크 게이트 — Common 등급만 발급')
  })

  it('forceFirstSyncGate=false + userInitialSyncDone=false → 게이트가 강제 해제된다', async () => {
    // 실제 상태는 미동기화(false)라 원래대로면 게이트가 걸려야 하지만,
    // 강제 override가 실제 상태보다 우선해 Rare까지 정상 발급된다.
    state.user = { initial_sync_done: false, created_at: SIGNUP_AT }
    state.badges = gradedPair()
    oneRun()

    const { earned } = await evaluateBadgesDetailed(USER_ID, [], { dryRun: true, forceFirstSyncGate: false })
    expect(earned.map((b) => b.id).sort()).toEqual(['C1', 'R1'])
  })
})

describe('skipInitialSyncFlagUpdate — users.initial_sync_done 갱신 여부', () => {
  it('미지정 + 조건 충족(dryRun=false, userInitialSyncDone=false) → initial_sync_done이 갱신된다', async () => {
    state.user = { initial_sync_done: false, created_at: SIGNUP_AT }
    state.badges = gradedPair()
    oneRun()

    await evaluateBadgesDetailed(USER_ID, [], { dryRun: false, triggeredBy: 'test' })
    expect(state.userUpdates).toEqual([{ initial_sync_done: true }])
  })

  it('skipInitialSyncFlagUpdate=true + 조건 충족 → initial_sync_done이 갱신되지 않는다', async () => {
    state.user = { initial_sync_done: false, created_at: SIGNUP_AT }
    state.badges = gradedPair()
    oneRun()

    await evaluateBadgesDetailed(USER_ID, [], {
      dryRun: false,
      triggeredBy: 'test',
      skipInitialSyncFlagUpdate: true,
    })
    expect(state.userUpdates).toEqual([])
  })

  it('forceFirstSyncGate와 skipInitialSyncFlagUpdate는 서로 독립이다 — 게이트를 강제 적용해도 갱신은 그대로 스킵할 수 있다', async () => {
    // 관리자 시뮬레이터의 "첫 싱크 강제 시뮬레이션" 조합 — 게이트는 강제 적용하되
    // 실제 유저의 온보딩 상태(initial_sync_done)는 절대 건드리지 않는다.
    state.user = { initial_sync_done: false, created_at: SIGNUP_AT }
    state.badges = gradedPair()
    oneRun()

    const { earned, missed } = await evaluateBadgesDetailed(USER_ID, [], {
      dryRun: false,
      triggeredBy: 'admin_simulate',
      forceFirstSyncGate: true,
      skipInitialSyncFlagUpdate: true,
    })
    expect(earned.map((b) => b.id)).toEqual(['C1'])
    expect(missed.find((m) => m.id === 'R1')?.reason).toBe('첫 싱크 게이트 — Common 등급만 발급')
    expect(state.userUpdates).toEqual([]) // 게이트는 걸렸지만 상태는 오염되지 않았다
  })
})
