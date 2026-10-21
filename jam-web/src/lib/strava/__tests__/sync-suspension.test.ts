/**
 * strava/sync — 이용 정지: 동기화 차단과 정지 기간 활동 미정산 (티켓 20261017_1426, 운영 로직 16.1·16.4절)
 *
 * 고정하는 것:
 * - 정지 중인 유저의 동기화는 Strava 조회·잠금·저장·정산 없이 `UserSuspendedError`를 던진다. 가진 잼·원장·보류·활동 기록은 그대로다.
 * - 정지 여부를 읽지 못하면 «정지 아님»으로 보지 않고 던져 동기화하지 않는다.
 * - 정지를 풀면 동기화는 평소대로 돈다.
 * - 정지 구간 `[suspendedAt, liftedAt)`에 «시작한» 활동은 풀린 뒤에 동기화해도 정산하지 않는다. 활동 행은 `filter_reason: 'suspended'`로 남긴다.
 *   경계 4종(정지 직전·정지 직후, 해제 직전·해제 직후)과 구간이 여러 개인 경우를 가른다.
 * - 정지 구간 밖 활동은 평소대로 정산한다.
 *
 * 실제 Strava·공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-suspension.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StravaSummaryActivity } from '@/types/strava'

const { createServiceClientMock, getAllActivitiesMock, evaluateBadgesMock, issueSyncItemBadgesMock, checkMissionsMock } = vi.hoisted(() => ({
  createServiceClientMock: vi.fn(),
  getAllActivitiesMock: vi.fn(),
  evaluateBadgesMock: vi.fn(async () => [] as string[]),
  issueSyncItemBadgesMock: vi.fn(async () => ({ issuedBadgeIds: [], pendingCount: 0 })),
  checkMissionsMock: vi.fn(async () => ({ completedMissionIds: [], awardedBadgeIds: [] })),
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
  return { ...actual, postOpsSlack: vi.fn(async () => ({ ok: true })) }
})
vi.mock('@/lib/drop-engine/syncIssueRun', () => ({ issueSyncItemBadges: issueSyncItemBadgesMock }))
vi.mock('@/lib/badge-engine/index', () => ({ evaluateBadges: evaluateBadgesMock }))
vi.mock('@/lib/badge-engine/jamActionBadges', () => ({ evaluateJamActionBadges: vi.fn(async () => []) }))
vi.mock('@/lib/badge-engine/usageBadges', () => ({
  recordDailySyncAndEvaluate: vi.fn(async () => []),
  evaluateCheckinUsageBadges: vi.fn(async () => []),
}))
vi.mock('@/lib/itembook/checker', () => ({
  checkItemBookCompletion: vi.fn(async () => ({ completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] })),
}))
vi.mock('@/lib/itembook/completable', () => ({ findCompletableItemBooks: vi.fn(async () => []) }))
vi.mock('@/lib/missions/checker', () => ({ checkMissions: checkMissionsMock }))
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

// 트라이브 게이트(티켓 20261021_1247)는 sync-tribe-gate.test.ts가 맡는다 — 이 파일은 트라이브를 고른 유저로 본다.
vi.mock('@/lib/tribe/gate', () => ({ assertHasTribe: async () => {} }))

import { processFetchedActivities, syncStravaActivities } from '../sync'
import { UserSuspendedError } from '@/lib/suspension/suspension'

const USER_ID = 'user-suspended'
const FUTURE = '2099-01-01T00:00:00.000Z'

/** 정지 구간(DB 행 모양) */
type SuspensionRow = { suspended_at: string; lifted_at: string | null; reason?: string; id?: string }

interface World {
  /** user_suspensions 행 */
  suspensions: SuspensionRow[]
  /** user_suspensions 조회를 실패시킨다 */
  suspensionReadFails: boolean
  upsertedRows: Record<string, unknown>[]
  activityIds: Map<number, string>
  /** source_activity_id → 원장 줄 */
  ledger: Map<string, { amount: number }>
  /** 가진 잼 */
  balance: number
  rpcCalls: Record<string, unknown>[]
  /** 지금 대기 중인 보류 개수 */
  pendingCount: number
  /** 연결 잠금 update 호출 수 */
  connectionUpdates: number
  /** 읽거나 쓴 표 이름 순서 */
  tablesTouched: string[]
}

function makeWorld(overrides: Partial<World> = {}): World {
  return {
    suspensions: [],
    suspensionReadFails: false,
    upsertedRows: [],
    activityIds: new Map(),
    ledger: new Map(),
    balance: 500,
    rpcCalls: [],
    pendingCount: 0,
    connectionUpdates: 0,
    tablesTouched: [],
    ...overrides,
  }
}

function makeFakeSupabase(world: World): SupabaseClient {
  const from = (table: string) => {
    world.tablesTouched.push(table)
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
          world.connectionUpdates += 1
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
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { initial_sync_done: true }, error: null }) }) }),
      }
    }
    if (table === 'sync_pending_items') {
      return {
        select: () => {
          const chain: Record<string, unknown> = {
            eq: () => chain,
            then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
              Promise.resolve({ count: world.pendingCount, error: null }).then(onFulfilled, onRejected),
          }
          return chain
        },
      }
    }
    if (table === 'user_suspensions') {
      const result = () =>
        world.suspensionReadFails
          ? { data: null, error: { message: 'db down' } }
          : { data: world.suspensions, error: null }
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        is: () => {
          // 진행 중 정지 조회(lifted_at IS NULL)
          const open = world.suspensions.filter((s) => s.lifted_at === null)
          const active = {
            maybeSingle: async () =>
              world.suspensionReadFails ? { data: null, error: { message: 'db down' } } : { data: open[0] ?? null, error: null },
          }
          return active
        },
        then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          Promise.resolve(result()).then(onFulfilled, onRejected),
      }
      return chain
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
    world.rpcCalls.push(args)
    const activityId = args.p_source_activity_id as string
    const amount = args.p_amount as number
    world.ledger.set(activityId, { amount })
    world.balance += amount
    return { data: { amount, source_activity_id: activityId }, error: null }
  }

  return { from, rpc } as unknown as SupabaseClient
}

/** 인정 기준을 모두 갖춘 러닝 30분(10km/h). 시작 시각만 바꾼다 */
function makeRaw(id: number, startDate: string): StravaSummaryActivity {
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
    start_date: startDate,
    start_date_local: startDate.replace('Z', ''),
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
  } as unknown as StravaSummaryActivity
}

let world: World

beforeEach(() => {
  vi.clearAllMocks()
  world = makeWorld()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const SUSPENDED_AT = '2026-10-10T00:00:00.000Z'
const LIFTED_AT = '2026-10-12T00:00:00.000Z'
const ms = (iso: string, deltaMs: number) => new Date(Date.parse(iso) + deltaMs).toISOString()

const process = (raws: StravaSummaryActivity[]) =>
  processFetchedActivities(makeFakeSupabase(world), USER_ID, 'token', raws, false, 'sync')

const filterReasonOf = (stravaId: number) => world.upsertedRows.find((r) => r.strava_id === stravaId)?.filter_reason

describe('syncStravaActivities — 정지 중이면 막힌다', () => {
  it('UserSuspendedError(까닭 포함)를 던지고 Strava 조회·저장·정산·잠금을 하지 않으며 가진 잼과 원장은 그대로다', async () => {
    world.suspensions = [{ id: 'sus-1', reason: '반복적인 부정 기록', suspended_at: SUSPENDED_AT, lifted_at: null }]
    world.ledger.set('act-old', { amount: 90 })
    createServiceClientMock.mockReturnValue(makeFakeSupabase(world))
    getAllActivitiesMock.mockResolvedValue([makeRaw(1, '2026-10-11T00:00:00Z')])

    const run = syncStravaActivities(USER_ID)

    await expect(run).rejects.toBeInstanceOf(UserSuspendedError)
    await expect(run).rejects.toMatchObject({ reason: '반복적인 부정 기록', suspendedAt: SUSPENDED_AT })
    expect(getAllActivitiesMock).not.toHaveBeenCalled()
    expect(world.connectionUpdates).toBe(0)
    expect(world.upsertedRows).toEqual([])
    expect(world.rpcCalls).toEqual([])
    expect(world.balance).toBe(500)
    expect([...world.ledger.keys()]).toEqual(['act-old'])
    // 배지·아이템 배지·미션 엔진도 돌지 않는다
    expect(evaluateBadgesMock).not.toHaveBeenCalled()
    expect(issueSyncItemBadgesMock).not.toHaveBeenCalled()
    expect(checkMissionsMock).not.toHaveBeenCalled()
  })

  it('정지 확인이 보류 확인보다 먼저다 — 보류가 있어도 정지 오류가 나가고 보류는 읽지 않는다', async () => {
    world.suspensions = [{ id: 'sus-1', reason: 'x', suspended_at: SUSPENDED_AT, lifted_at: null }]
    world.pendingCount = 2
    createServiceClientMock.mockReturnValue(makeFakeSupabase(world))

    await expect(syncStravaActivities(USER_ID)).rejects.toBeInstanceOf(UserSuspendedError)

    expect(world.tablesTouched).not.toContain('sync_pending_items')
  })

  it('정지 여부를 읽지 못하면 «정지 아님»으로 보지 않고 던져 동기화하지 않는다', async () => {
    world.suspensionReadFails = true
    createServiceClientMock.mockReturnValue(makeFakeSupabase(world))

    const run = syncStravaActivities(USER_ID)

    await expect(run).rejects.toThrow('user_suspensions 조회 실패')
    await expect(run).rejects.not.toBeInstanceOf(UserSuspendedError)
    expect(getAllActivitiesMock).not.toHaveBeenCalled()
    expect(world.upsertedRows).toEqual([])
    expect(world.rpcCalls).toEqual([])
  })

  it('정지를 풀면(이력만 남은 상태) 동기화는 평소대로 돈다', async () => {
    world.suspensions = [{ id: 'sus-1', reason: 'x', suspended_at: SUSPENDED_AT, lifted_at: LIFTED_AT }]
    createServiceClientMock.mockReturnValue(makeFakeSupabase(world))
    getAllActivitiesMock.mockResolvedValue([makeRaw(1, '2026-10-13T00:00:00Z')])

    const result = await syncStravaActivities(USER_ID)

    expect(getAllActivitiesMock).toHaveBeenCalled()
    expect(result.synced).toBe(1)
    expect(result.jamEarned).toBe(90)
  })
})

describe('processFetchedActivities — 정지 기간에 시작한 활동은 풀린 뒤에도 정산하지 않는다', () => {
  beforeEach(() => {
    world.suspensions = [{ suspended_at: SUSPENDED_AT, lifted_at: LIFTED_AT }]
  })

  it('경계 4종: 정지 직전은 정산하고, 정지 정각(직후)과 해제 직전은 정산하지 않고, 해제 정각(직후)부터 다시 정산한다', async () => {
    const result = await process([
      makeRaw(1, ms(SUSPENDED_AT, -1000)), // 정지 직전
      makeRaw(2, SUSPENDED_AT), // 정지 정각 — 구간 안
      makeRaw(3, ms(LIFTED_AT, -1000)), // 해제 직전
      makeRaw(4, LIFTED_AT), // 해제 정각 — 구간 밖
      makeRaw(5, ms(LIFTED_AT, 1000)), // 해제 직후
    ])

    expect(filterReasonOf(1)).toBeNull()
    expect(filterReasonOf(2)).toBe('suspended')
    expect(filterReasonOf(3)).toBe('suspended')
    expect(filterReasonOf(4)).toBeNull()
    expect(filterReasonOf(5)).toBeNull()
    // 정산은 인정된 셋(1, 4, 5)만 — 러닝 30분 × 3 = 90씩
    expect(world.rpcCalls.map((c) => c.p_source_activity_id).sort()).toEqual(['act-1', 'act-4', 'act-5'])
    expect(result.settledCount).toBe(3)
    expect(result.jamEarned).toBe(270)
    expect(world.balance).toBe(500 + 270)
  })

  it('걸러진 활동의 행은 남긴다(다시 가져와 처리하지 않도록) — 정산·원장은 만들지 않는다', async () => {
    const result = await process([makeRaw(2, ms(SUSPENDED_AT, 1000)), makeRaw(3, ms(LIFTED_AT, -1000))])

    expect(world.upsertedRows.map((r) => [r.strava_id, r.filter_reason])).toEqual([
      [2, 'suspended'],
      [3, 'suspended'],
    ])
    expect(world.rpcCalls).toEqual([])
    expect(world.ledger.size).toBe(0)
    expect(world.balance).toBe(500)
    expect(result.settledCount).toBe(0)
    expect(result.jamEarned).toBe(0)
    // 활동별 아이템 배지·미션·아이템북 처리도 돌지 않는다
    expect(issueSyncItemBadgesMock).not.toHaveBeenCalled()
    expect(checkMissionsMock).not.toHaveBeenCalled()
  })

  it('정지 구간의 활동은 인정 기준 사유(10분 미만 등)보다 먼저 suspended로 기록된다', async () => {
    const short = { ...makeRaw(2, ms(SUSPENDED_AT, 1000)), moving_time: 60 } as StravaSummaryActivity

    await process([short])

    expect(filterReasonOf(2)).toBe('suspended')
  })

  it('끝없는 정지(해제 없음)는 정지 정각 이후 시작한 활동을 모두 정산하지 않는다', async () => {
    world.suspensions = [{ suspended_at: SUSPENDED_AT, lifted_at: null }]

    await process([makeRaw(1, ms(SUSPENDED_AT, -1000)), makeRaw(2, '2030-01-01T00:00:00Z')])

    expect(filterReasonOf(1)).toBeNull()
    expect(filterReasonOf(2)).toBe('suspended')
  })

  it('구간이 여러 개이면 구간마다 따로 가르고, 풀려 있던 사이에 시작한 활동은 정산한다', async () => {
    world.suspensions = [
      { suspended_at: '2026-09-01T00:00:00.000Z', lifted_at: '2026-09-03T00:00:00.000Z' },
      { suspended_at: SUSPENDED_AT, lifted_at: LIFTED_AT },
    ]

    await process([
      makeRaw(1, '2026-09-02T00:00:00Z'), // 첫 구간 안
      makeRaw(2, '2026-09-20T00:00:00Z'), // 풀려 있던 사이
      makeRaw(3, '2026-10-11T00:00:00Z'), // 두 번째 구간 안
      makeRaw(4, '2026-08-31T00:00:00Z'), // 첫 정지 전
    ])

    expect(filterReasonOf(1)).toBe('suspended')
    expect(filterReasonOf(2)).toBeNull()
    expect(filterReasonOf(3)).toBe('suspended')
    expect(filterReasonOf(4)).toBeNull()
  })

  it('정지 이력이 없는 유저는 평소대로 전부 정산한다', async () => {
    world.suspensions = []

    const result = await process([makeRaw(1, '2026-10-11T00:00:00Z'), makeRaw(2, '2026-10-11T01:00:00Z')])

    expect(result.settledCount).toBe(2)
    expect(world.upsertedRows.every((r) => r.filter_reason === null)).toBe(true)
  })

  it('정지 구간을 읽지 못하면 정산하지 않고 던진다', async () => {
    world.suspensionReadFails = true

    await expect(process([makeRaw(1, '2026-10-11T00:00:00Z')])).rejects.toThrow('user_suspensions 구간 조회 실패')

    expect(world.upsertedRows).toEqual([])
    expect(world.rpcCalls).toEqual([])
  })

  it('새 활동이 0건이면 정지 구간을 읽지 않는다', async () => {
    await process([])

    expect(world.tablesTouched).not.toContain('user_suspensions')
  })
})
