/**
 * strava/sync — 잼 정산과 대량 수령 경보 (티켓 20261017_1423, 운영 로직 4.2~4.5절·16.3절)
 *
 * 고정하는 것:
 * - 인정 필터와 어뷰징 필터를 모두 통과한 활동만 `jam_apply`로 정산한다(걸러진 활동은 정산하지 않는다).
 *   첫 동기화는 최근 1건이다.
 * - `p_earned_on`은 활동한 날의 KST 날짜다 — UTC 15:00 전후 경계, 늦게 동기화한 활동이 동기화한 날로 잡히지 않는다.
 * - 같은 활동을 두 번 처리해도 원장은 한 줄이다.
 * - 종목 불일치로 걷기가 된 활동은 가벼움(×1), 전기자전거는 가벼움, 자전거는 보통(×2).
 * - 정산 실패는 동기화를 막지 않는다. 경보 기준선은 정산 전에 읽고, 경보 발송 실패는 결과를 바꾸지 않는다.
 * - 동기화 응답에 `jamEarned`가 실리고 기존 필드는 그대로다.
 *
 * 실제 Strava·공용 DB·슬랙은 호출하지 않는다 — 가짜 클라이언트와 발송 함수 모킹만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-jam-settlement.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StravaSummaryActivity } from '@/types/strava'

const { createServiceClientMock, getAllActivitiesMock, postOpsSlackMock } = vi.hoisted(() => ({
  createServiceClientMock: vi.fn(),
  getAllActivitiesMock: vi.fn(),
  postOpsSlackMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: createServiceClientMock }))
vi.mock('@/lib/utils', () => ({
  decrypt: vi.fn(async (v: string) => v),
  encrypt: vi.fn(async (v: string) => v),
}))
vi.mock('@/lib/strava/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/strava/api')>('@/lib/strava/api')
  return {
    ...actual,
    getAllActivities: getAllActivitiesMock,
    getActivityStreams: vi.fn(async () => ({ route: [[37.5, 127.0]], velocitySmooth: [], time: [] })),
    refreshStravaToken: vi.fn(),
  }
})
vi.mock('@/lib/admin/opsInbox/slack', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin/opsInbox/slack')>('@/lib/admin/opsInbox/slack')
  return { ...actual, postOpsSlack: postOpsSlackMock }
})
vi.mock('@/lib/drop-engine/syncIssueRun', () => ({ issueSyncItemBadges: vi.fn(async () => []) }))
vi.mock('@/lib/badge-engine/index', () => ({ evaluateBadges: vi.fn(async () => []) }))
vi.mock('@/lib/badge-engine/jamActionBadges', () => ({ evaluateJamActionBadges: vi.fn(async () => []) }))
vi.mock('@/lib/badge-engine/usageBadges', () => ({
  recordDailySyncAndEvaluate: vi.fn(async () => []),
  evaluateCheckinUsageBadges: vi.fn(async () => []),
}))
vi.mock('@/lib/itembook/checker', () => ({
  checkItemBookCompletion: vi.fn(async () => ({ completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] })),
}))
vi.mock('@/lib/itembook/completable', () => ({ findCompletableItemBooks: vi.fn(async () => []) }))
vi.mock('@/lib/missions/checker', () => ({
  checkMissions: vi.fn(async () => ({ completedMissionIds: [], awardedBadgeIds: [] })),
}))
vi.mock('@/lib/onboarding-quest/completion', () => ({ recordOnboardingQuestCompletion: vi.fn(async () => null) }))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn(async () => {}),
  dailyGroupKey: vi.fn(() => 'group-key'),
}))
vi.mock('@/lib/notifications/recap', () => ({ recordActivityRecap: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications/batch/collections', () => ({ selectCompletableDrafts: vi.fn(() => []) }))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: vi.fn(async () => {}) }))
vi.mock('@/lib/poi/matcher', () => ({ matchPoisForActivity: vi.fn(async () => []) }))

import { processFetchedActivities, syncStravaActivities } from '../sync'

const USER_ID = 'user-jam'
const FUTURE = '2099-01-01T00:00:00.000Z'

/** 가짜 DB 상태 — 활동 저장·원장 줄·일별 모은 양을 담는다 */
interface World {
  upsertedRows: Record<string, unknown>[]
  /** strava_id → 저장된 활동 행 id */
  activityIds: Map<number, string>
  /** source_activity_id → 원장 줄 */
  ledger: Map<string, { amount: number; earnedOn: string }>
  balance: number
  /** jam_daily_earned 행. 정산이 늘리면 여기에 더해진다(기준선을 정산 뒤에 읽으면 값이 달라진다) */
  dailyRows: { earned_on: string; amount: number }[]
  rpcCalls: Record<string, unknown>[]
  /** 호출 순서: 'baseline'(jam_daily_earned 조회) · 'upsert'(활동 저장) · 'rpc'(jam_apply) */
  events: string[]
  rpcError: boolean
}

function makeWorld(overrides: Partial<World> = {}): World {
  return {
    upsertedRows: [],
    activityIds: new Map(),
    ledger: new Map(),
    balance: 0,
    dailyRows: [],
    rpcCalls: [],
    events: [],
    rpcError: false,
    ...overrides,
  }
}

function makeFakeSupabase(world: World, opts: { initialSyncDone?: boolean } = {}): SupabaseClient {
  const from = (table: string) => {
    if (table === 'strava_connections') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                id: 'conn-1',
                user_id: USER_ID,
                strava_athlete_id: 1,
                access_token: 'enc',
                refresh_token: 'enc',
                token_expires_at: FUTURE,
                last_synced_at: null,
                backfill_completed: true,
                first_sync_pending: false,
                disconnected_at: null,
                disconnect_reason: null,
              },
              error: null,
            }),
          }),
        }),
        update: () => {
          const chain: Record<string, unknown> = {
            eq: () => chain,
            is: () => chain,
            select: async () => ({ data: [{ user_id: USER_ID }], error: null }),
            then: (onFulfilled: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(onFulfilled),
          }
          return chain
        },
      }
    }
    if (table === 'users') {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { initial_sync_done: opts.initialSyncDone ?? true }, error: null }) }),
        }),
      }
    }

    let selectedCols = ''
    const builder: Record<string, unknown> = {
      select: (cols?: string, selectOpts?: { count?: string; head?: boolean }) => {
        selectedCols = cols ?? ''
        if (table === 'user_checkin_badge_earns' && selectOpts?.head) {
          const chain = {
            eq: () => chain,
            then: (onFulfilled: (v: { count: number; error: null }) => unknown) =>
              Promise.resolve({ count: 0, error: null }).then(onFulfilled),
          }
          return chain
        }
        return builder
      },
      eq: () => builder,
      in: () => builder,
      gte: () => builder,
      lte: () => builder,
      is: () => builder,
      not: () => builder,
      order: () => builder,
      limit: () => builder,
      upsert: async (rows: Record<string, unknown>[]) => {
        if (table === 'strava_activities') {
          world.events.push('upsert')
          for (const row of rows) {
            world.upsertedRows.push(row)
            const stravaId = row.strava_id as number
            if (!world.activityIds.has(stravaId)) world.activityIds.set(stravaId, `act-${stravaId}`)
          }
        }
        return { error: null }
      },
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      insert: async () => ({ error: null }),
      then(onFulfilled: (v: { data: unknown; error: unknown }) => unknown, onRejected?: (e: unknown) => unknown) {
        if (table === 'jam_daily_earned') {
          world.events.push('baseline')
          return Promise.resolve({ data: world.dailyRows, error: null }).then(onFulfilled, onRejected)
        }
        if (table === 'strava_activities' && selectedCols === 'id, strava_id') {
          const data = [...world.activityIds.entries()].map(([strava_id, id]) => ({ id, strava_id }))
          return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected)
        }
        return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected)
      },
    }
    return builder
  }

  const rpc = async (name: string, args: Record<string, unknown>) => {
    if (name !== 'jam_apply') return { data: null, error: { message: `알 수 없는 rpc ${name}` } }
    world.events.push('rpc')
    world.rpcCalls.push(args)
    if (world.rpcError) return { data: null, error: { message: 'rpc failed' } }
    const activityId = args.p_source_activity_id as string
    const existing = world.ledger.get(activityId)
    if (existing) return { data: { amount: existing.amount, source_activity_id: activityId }, error: null }
    const amount = args.p_amount as number
    world.ledger.set(activityId, { amount, earnedOn: args.p_earned_on as string })
    world.balance += amount
    world.dailyRows.push({ earned_on: args.p_earned_on as string, amount })
    return { data: { amount, source_activity_id: activityId }, error: null }
  }

  return { from, rpc } as unknown as SupabaseClient
}

/** 인정 기준을 모두 갖춘 러닝 30분(10km/h). 필요한 칸만 덮어써서 바꾼다. id가 클수록 최근이다 */
function makeRaw(id: number, overrides: Partial<StravaSummaryActivity> = {}): StravaSummaryActivity {
  return {
    id,
    resource_state: 2,
    name: `Run ${id}`,
    distance: 5000,
    moving_time: 1800,
    elapsed_time: 1800,
    total_elevation_gain: 20,
    type: 'Run',
    sport_type: 'Run',
    start_date: `2026-09-${String(10 + id).padStart(2, '0')}T00:00:00Z`,
    start_date_local: `2026-09-${String(10 + id).padStart(2, '0')}T09:00:00`,
    timezone: '(GMT+09:00) Asia/Seoul',
    utc_offset: 32400,
    location_city: null,
    location_state: null,
    location_country: null,
    achievement_count: 0,
    kudos_count: 0,
    comment_count: 0,
    athlete_count: 1,
    photo_count: 0,
    map: { id: `m${id}`, summary_polyline: 'ENCODED', resource_state: 2 },
    trainer: false,
    commute: false,
    manual: false,
    private: false,
    visibility: 'everyone',
    flagged: false,
    gear_id: null,
    start_latlng: [37.5123, 127.0456],
    end_latlng: [],
    average_speed: 2.8,
    max_speed: 3.5,
    has_heartrate: false,
    heartrate_opt_out: false,
    display_hide_heartrate_option: false,
    upload_id: null,
    upload_id_str: null,
    external_id: null,
    pr_count: 0,
    total_photo_count: 0,
    has_kudoed: false,
    workout_type: null,
    suffer_score: null,
    ...overrides,
  } as unknown as StravaSummaryActivity
}

let world: World

beforeEach(() => {
  vi.clearAllMocks()
  world = makeWorld()
  postOpsSlackMock.mockResolvedValue({ ok: true })
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const run = (raws: StravaSummaryActivity[], isFirstSync = false) =>
  processFetchedActivities(makeFakeSupabase(world), USER_ID, 'token', raws, isFirstSync, 'sync')

describe('잼 정산 — 대상과 계산', () => {
  it('인정 활동은 jam_apply(activity_settlement, 저장된 활동 id)로 정산되고 합계가 결과에 실린다', async () => {
    const result = await run([makeRaw(1)])

    expect(result.settledCount).toBe(1)
    expect(result.jamEarned).toBe(90) // 러닝 30분 × 3
    expect(world.rpcCalls).toEqual([
      {
        p_user_id: USER_ID,
        p_amount: 90,
        p_reason: 'activity_settlement',
        p_source_activity_id: 'act-1',
        p_earned_on: '2026-09-11',
      },
    ])
    // 활동별 잼 값은 정산 단계 결과로 남는다(아이템 배지 발급이 쓴다)
    expect(result.jamSettlements).toEqual([{ stravaId: 1, activityId: 'act-1', amount: 90, earnedOn: '2026-09-11' }])
  })

  it('활동을 저장한 뒤에 정산한다 (활동 id가 있어야 원장에 쓸 수 있다)', async () => {
    await run([makeRaw(1)])
    expect(world.events.indexOf('upsert')).toBeGreaterThanOrEqual(0)
    expect(world.events.indexOf('upsert')).toBeLessThan(world.events.indexOf('rpc'))
  })

  it('인정되지 않은 활동(수동 입력·10분 미만)과 차량 속도로 걸러진 활동은 정산하지 않는다', async () => {
    const result = await run([
      makeRaw(1, { manual: true }),
      makeRaw(2, { moving_time: 599 }),
      makeRaw(3, { average_speed: 100 / 3.6 }), // 100km/h > 기본 60km/h
      makeRaw(4),
    ])

    expect(result.settledCount).toBe(1)
    expect(world.rpcCalls.map((c) => c.p_source_activity_id)).toEqual(['act-4'])
    expect(result.jamEarned).toBe(90)
  })

  it('인정 활동이 하나도 없으면 정산도 기준선 조회도 하지 않고 jamEarned는 0이다', async () => {
    const result = await run([makeRaw(1, { manual: true })])
    expect(world.rpcCalls).toEqual([])
    expect(world.events).not.toContain('baseline')
    expect(result.jamEarned).toBe(0)
    expect(result.jamSettlements).toEqual([])
  })

  it('새 활동이 0건이면 jamEarned는 0이다', async () => {
    const result = await run([])
    expect(result.jamEarned).toBe(0)
    expect(world.rpcCalls).toEqual([])
  })

  it('첫 동기화는 인정 활동 가운데 가장 최근 1건만 정산한다', async () => {
    const result = await run([makeRaw(1), makeRaw(2), makeRaw(3)], true)

    expect(result.settledCount).toBe(1)
    expect(world.rpcCalls.map((c) => c.p_source_activity_id)).toEqual(['act-3'])
    expect(result.jamEarned).toBe(90)
  })

  it('종목 불일치로 걷기가 된 활동은 가벼움(×1)이다 — 러닝 30분이 평균 3.6km/h면 30', async () => {
    const result = await run([makeRaw(1, { average_speed: 1.0 })])
    expect(result.jamEarned).toBe(30)
  })

  it('전기자전거 30분은 30, 자전거 30분은 60이다', async () => {
    const ebike = await run([makeRaw(1, { type: 'EBikeRide', sport_type: 'EBikeRide', average_speed: 4 })])
    expect(ebike.jamEarned).toBe(30)

    world = makeWorld()
    const ride = await run([makeRaw(2, { type: 'Ride', sport_type: 'Ride', average_speed: 4 })])
    expect(ride.jamEarned).toBe(60)
  })

  it('걷기 30분은 30이다', async () => {
    const result = await run([makeRaw(1, { type: 'Walk', sport_type: 'Walk', average_speed: 1.4 })])
    expect(result.jamEarned).toBe(30)
  })
})

describe('잼 정산 — 활동한 날(KST)과 한 활동 한 번', () => {
  it('UTC 14:59:59 시작은 그날, 15:00:00 시작은 다음 날로 jam_daily_earned에 간다', async () => {
    await run([
      makeRaw(1, { start_date: '2026-09-12T14:59:59Z' }),
      makeRaw(2, { start_date: '2026-09-12T15:00:00Z' }),
    ])
    const dateOf = (id: string) => world.ledger.get(id)?.earnedOn
    expect(dateOf('act-1')).toBe('2026-09-12')
    expect(dateOf('act-2')).toBe('2026-09-13')
  })

  it('한참 늦게 동기화한 활동도 동기화한 날이 아니라 활동한 날로 잡힌다', async () => {
    await run([makeRaw(1, { start_date: '2026-08-01T01:00:00Z' })])
    expect(world.rpcCalls).toHaveLength(1)
    expect(world.rpcCalls[0].p_earned_on).toBe('2026-08-01')
  })

  it('같은 활동을 두 번 처리해도 원장은 한 줄이고 가진 양은 한 번만 늘어난다', async () => {
    await run([makeRaw(1)])
    await run([makeRaw(1)])

    expect(world.ledger.size).toBe(1)
    expect(world.balance).toBe(90)
    expect(world.dailyRows).toHaveLength(1)
  })
})

describe('잼 정산 — 실패가 동기화를 막지 않는다', () => {
  it('jam_apply가 실패해도 동기화는 끝나고(활동 저장·settledCount) jamEarned는 0이다', async () => {
    world.rpcError = true
    const result = await run([makeRaw(1)])

    expect(result.settledCount).toBe(1)
    expect(result.jamEarned).toBe(0)
    expect(world.upsertedRows).toHaveLength(1)
    expect(world.upsertedRows[0]).toMatchObject({ strava_id: 1, filter_reason: null })
    expect(postOpsSlackMock).not.toHaveBeenCalled()
  })
})

describe('대량 수령 경보', () => {
  /** 12시간 러닝 = 720분 × 3 = 2,160 */
  const longRun = (id: number) => makeRaw(id, { moving_time: 12 * 3600, elapsed_time: 12 * 3600 })

  it('지난 기록이 없으면 1,200을 넘을 때만 #jam-alert로 알린다', async () => {
    await run([makeRaw(1)]) // 90
    expect(postOpsSlackMock).not.toHaveBeenCalled()

    world = makeWorld()
    await run([longRun(2)]) // 2,160
    expect(postOpsSlackMock).toHaveBeenCalledTimes(1)
    const [channel, text] = postOpsSlackMock.mock.calls[0] as [string, string]
    expect(channel).toBe('alert')
    expect(text).toContain('2,160')
  })

  it('지난 4주 주간 평균의 3배를 넘을 때만 알린다 — 기준선은 이번 정산 전에 읽는다', async () => {
    // 지난 4주 합계 100 → 주간 평균 25, 3배 75. 이번 동기화 90은 넘는다.
    // 기준선을 정산 뒤에 읽으면 합계가 190(평균 47.5, 3배 142.5)이 되어 알리지 않는다.
    world.dailyRows.push({ earned_on: '2026-10-10', amount: 100 })
    await run([makeRaw(1)])

    expect(world.events.indexOf('baseline')).toBeGreaterThanOrEqual(0)
    expect(world.events.indexOf('baseline')).toBeLessThan(world.events.indexOf('rpc'))
    expect(postOpsSlackMock).toHaveBeenCalledTimes(1)
  })

  it('주간 평균의 3배를 넘지 않으면 알리지 않는다', async () => {
    // 지난 4주 합계 400 → 주간 평균 100, 3배 300. 90은 넘지 않는다.
    world.dailyRows.push({ earned_on: '2026-10-10', amount: 400 })
    await run([makeRaw(1)])
    expect(postOpsSlackMock).not.toHaveBeenCalled()
  })

  it('경보 발송이 실패하거나 예외를 던져도 동기화 결과는 그대로다', async () => {
    const baselineResult = await run([longRun(1)])
    expect(postOpsSlackMock).toHaveBeenCalledTimes(1)

    world = makeWorld()
    postOpsSlackMock.mockResolvedValueOnce({ ok: false, error: 'not_configured' })
    const failed = await run([longRun(1)])
    expect(failed).toEqual(baselineResult)

    world = makeWorld()
    postOpsSlackMock.mockRejectedValueOnce(new Error('network'))
    const thrown = await run([longRun(1)])
    expect(thrown).toEqual(baselineResult)
  })

  it('받은 잼이 0이면 경보 판정도 하지 않는다', async () => {
    await run([makeRaw(1, { manual: true })])
    expect(postOpsSlackMock).not.toHaveBeenCalled()
  })
})

describe('syncStravaActivities — 응답의 jamEarned', () => {
  it('이번 동기화로 받은 잼 합계가 실리고 기존 응답 필드는 그대로다', async () => {
    createServiceClientMock.mockReturnValue(makeFakeSupabase(world))
    getAllActivitiesMock.mockResolvedValue([makeRaw(1), makeRaw(2)])

    const result = await syncStravaActivities(USER_ID)

    expect(result).toEqual({
      synced: 2,
      badges: 0,
      itemBooksCompleted: 0,
      missionsCompleted: 0,
      earnedBadges: [],
      earnedBadgesMore: 0,
      isFirstBadgeEver: false,
      completedMissionIds: [],
      jamEarned: 180,
    })
  })

  it('활동이 없으면 jamEarned는 0이다', async () => {
    createServiceClientMock.mockReturnValue(makeFakeSupabase(world))
    getAllActivitiesMock.mockResolvedValue([])

    const result = await syncStravaActivities(USER_ID)

    expect(result.synced).toBe(0)
    expect(result.jamEarned).toBe(0)
  })

  it('정산이 실패해도 응답은 나가고 jamEarned는 0이다', async () => {
    world.rpcError = true
    createServiceClientMock.mockReturnValue(makeFakeSupabase(world))
    getAllActivitiesMock.mockResolvedValue([makeRaw(1)])

    const result = await syncStravaActivities(USER_ID)

    expect(result.synced).toBe(1)
    expect(result.jamEarned).toBe(0)
  })
})
