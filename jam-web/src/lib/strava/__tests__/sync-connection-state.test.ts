/**
 * strava/sync — 연결 끊김 표시와 첫 동기화 대기 (티켓 20261017_1422, 운영 로직 3.2·3.4절)
 *
 * 고정하는 것:
 * - 끊김 상태(`disconnected_at`)의 연결은 동기화하지 않고 `StravaDisconnectedError`를 던진다(Strava 조회·잠금 없음).
 * - 토큰 갱신이 실패하면 기존 소식·실패 기록은 그대로 두고 끊김(`token_refresh_failed`)을 저장한다.
 * - Strava가 활동 조회에서 401로 철회를 알리면 끊김(`token_revoked`)을 저장한다. 다른 오류는 끊김으로 보지 않는다.
 * - `first_sync_pending`이 true면 커서(strava_activities 최신 시각)를 읽지 않고, `users.initial_sync_done`이
 *   true여도 첫 동기화 규칙(인정 활동 가운데 최근 1건)을 쓴다. 정산한 동기화가 끝나면 false로 돌린다.
 *   정산이 0건이면 그대로 둔다. false이면 옛 동작 그대로다(커서를 읽고 전부 정산, 해제 update 없음).
 *
 * 실제 Strava·공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-connection-state.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StravaSummaryActivity } from '@/types/strava'
import type { StravaConnectionRow } from '@/types/database'

const { createServiceClientMock, getAllActivitiesMock, refreshMock, createNotificationMock } = vi.hoisted(() => ({
  createServiceClientMock: vi.fn(),
  getAllActivitiesMock: vi.fn(),
  refreshMock: vi.fn(),
  createNotificationMock: vi.fn(async () => {}),
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
    refreshStravaToken: refreshMock,
  }
})
vi.mock('@/lib/badge-engine/index', () => ({ evaluateBadges: vi.fn(async () => []) }))
vi.mock('@/lib/drop-engine/index', () => ({ tryItemDrop: vi.fn(async () => []) }))
vi.mock('@/lib/poi/matcher', () => ({ matchPoisForActivity: vi.fn(async () => []) }))
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
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications', () => ({
  createNotification: createNotificationMock,
  dailyGroupKey: vi.fn(() => 'group-key'),
}))
vi.mock('@/lib/notifications/recap', () => ({ recordActivityRecap: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications/batch/collections', () => ({ selectCompletableDrafts: vi.fn(() => []) }))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: vi.fn(async () => {}) }))

import { syncStravaActivities } from '../sync'
import { StravaApiError } from '../api'
import { StravaDisconnectedError } from '../connection-state'

const USER_ID = 'user-conn-state'
const ATHLETE_ID = 503337
const FUTURE = '2099-01-01T00:00:00.000Z'
const PAST = '2020-01-01T00:00:00.000Z'

interface ConnectionUpdate {
  payload: Record<string, unknown>
  eqs: Record<string, unknown>
}

interface FakeOptions {
  connection: Partial<StravaConnectionRow>
  initialSyncDone?: boolean
  latestActivityStartDate?: string | null
}

interface FakeRecord {
  connectionUpdates: ConnectionUpdate[]
  cursorQueries: number
  failureInserts: Record<string, unknown>[]
}

function makeFake(opts: FakeOptions): { supabase: SupabaseClient; record: FakeRecord } {
  const record: FakeRecord = { connectionUpdates: [], cursorQueries: 0, failureInserts: [] }
  const connection: StravaConnectionRow = {
    id: 'conn-1',
    user_id: USER_ID,
    strava_athlete_id: ATHLETE_ID,
    access_token: 'enc-access',
    refresh_token: 'enc-refresh',
    token_expires_at: FUTURE,
    last_synced_at: null,
    backfill_completed: true,
    first_sync_pending: false,
    disconnected_at: null,
    disconnect_reason: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...opts.connection,
  }

  const from = (table: string) => {
    if (table === 'strava_connections') {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: connection, error: null }) }) }),
        update: (payload: Record<string, unknown>) => {
          const entry: ConnectionUpdate = { payload, eqs: {} }
          record.connectionUpdates.push(entry)
          const chain: Record<string, unknown> = {
            eq: (col: string, val: unknown) => {
              entry.eqs[col] = val
              return chain
            },
            is: () => chain,
            // 낙관적 잠금(last_synced_at 선점) — 항상 성공으로 돌려준다
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
          eq: () => ({
            maybeSingle: async () => ({ data: { initial_sync_done: opts.initialSyncDone ?? true }, error: null }),
          }),
        }),
      }
    }
    // 그 밖의 테이블은 빈 결과를 돌려주는 최소 빌더 — 실패 기록 insert만 모아 둔다
    const builder: Record<string, unknown> = {
      select: (..._args: unknown[]) => {
        if (table === 'strava_activities') record.cursorQueries += 1
        return builder
      },
      eq: () => builder,
      in: () => builder,
      is: () => builder,
      not: () => builder,
      order: () => builder,
      limit: () => builder,
      upsert: async () => ({ error: null }),
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({
        data:
          table === 'strava_activities' && opts.latestActivityStartDate
            ? { start_date: opts.latestActivityStartDate }
            : null,
        error: null,
      }),
      insert: async (payload: Record<string, unknown>) => {
        if (table === 'strava_sync_failures') record.failureInserts.push(payload)
        return { error: null }
      },
      then(onFulfilled: (v: { data: unknown; error: unknown }) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected)
      },
    }
    return builder
  }

  return { supabase: { from } as unknown as SupabaseClient, record }
}

/** 인정 기준을 모두 갖춘 활동. id가 클수록 최근이다 */
function makeRaw(id: number): StravaSummaryActivity {
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
    start_latlng: [37.5, 127.0],
    end_latlng: [37.6, 127.1],
    average_speed: 2.8,
    max_speed: 4,
    has_heartrate: false,
    heartrate_opt_out: false,
    display_hide_heartrate_option: false,
    upload_id: 1,
    external_id: null,
    from_accepted_tag: false,
    pr_count: 0,
    total_photo_count: 0,
    has_kudoed: false,
  } as unknown as StravaSummaryActivity
}

const pendingUpdates = (record: FakeRecord) =>
  record.connectionUpdates.filter((u) => 'first_sync_pending' in u.payload)
const disconnectUpdates = (record: FakeRecord) =>
  record.connectionUpdates.filter((u) => 'disconnected_at' in u.payload)

beforeEach(() => {
  vi.clearAllMocks()
  getAllActivitiesMock.mockResolvedValue([])
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('syncStravaActivities — 끊김 상태의 연결', () => {
  it('disconnected_at이 있으면 Strava를 조회하지 않고 StravaDisconnectedError를 던진다', async () => {
    const { supabase, record } = makeFake({
      connection: { disconnected_at: '2026-10-01T00:00:00.000Z', disconnect_reason: 'user_disconnected' },
    })
    createServiceClientMock.mockReturnValue(supabase)

    const run = syncStravaActivities(USER_ID)

    await expect(run).rejects.toBeInstanceOf(StravaDisconnectedError)
    await expect(run).rejects.toMatchObject({ reason: 'user_disconnected' })
    expect(getAllActivitiesMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
    expect(record.connectionUpdates).toHaveLength(0)
  })
})

describe('syncStravaActivities — 토큰 갱신 실패는 끊김이다', () => {
  it('갱신이 실패하면 소식·실패 기록을 남기고 token_refresh_failed로 끊김을 저장한다', async () => {
    const { supabase, record } = makeFake({ connection: { token_expires_at: PAST } })
    createServiceClientMock.mockReturnValue(supabase)
    refreshMock.mockRejectedValue(new StravaApiError('Strava 토큰 갱신 실패 400: invalid_grant', 400))

    await expect(syncStravaActivities(USER_ID)).rejects.toMatchObject({
      name: 'StravaDisconnectedError',
      reason: 'token_refresh_failed',
    })

    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, type: 'strava_disconnected', mode: 'once' })
    )
    expect(record.failureInserts).toEqual([
      expect.objectContaining({ user_id: USER_ID, failure_type: 'token_refresh_failed' }),
    ])
    const saved = disconnectUpdates(record)
    expect(saved).toHaveLength(1)
    expect(saved[0].payload).toMatchObject({ disconnect_reason: 'token_refresh_failed' })
    expect(typeof saved[0].payload.disconnected_at).toBe('string')
    expect(saved[0].eqs).toEqual({ user_id: USER_ID })
    expect(getAllActivitiesMock).not.toHaveBeenCalled()
  })

  it.each([
    ['401(철회)', new StravaApiError('Strava 토큰 갱신 실패 401: Authorization Error', 401)],
    ['403(권한 해제)', new StravaApiError('Strava 토큰 갱신 실패 403: forbidden', 403)],
  ])('인증 오류 %s도 끊김으로 저장한다', async (_label, upstream) => {
    const { supabase, record } = makeFake({ connection: { token_expires_at: PAST } })
    createServiceClientMock.mockReturnValue(supabase)
    refreshMock.mockRejectedValue(upstream)

    await expect(syncStravaActivities(USER_ID)).rejects.toBeInstanceOf(StravaDisconnectedError)

    expect(disconnectUpdates(record)).toHaveLength(1)
  })

  it.each([
    ['5xx', new StravaApiError('Strava 토큰 갱신 실패 503: unavailable', 503)],
    ['네트워크 오류', new TypeError('fetch failed')],
    ['시간 초과', Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })],
  ])('일시 실패(%s)는 끊김으로 저장하지 않고 실패 기록·소식은 남기며 원래 오류를 던진다', async (_label, upstream) => {
    const { supabase, record } = makeFake({ connection: { token_expires_at: PAST } })
    createServiceClientMock.mockReturnValue(supabase)
    refreshMock.mockRejectedValue(upstream)

    await expect(syncStravaActivities(USER_ID)).rejects.toBe(upstream)

    expect(disconnectUpdates(record)).toHaveLength(0)
    expect(record.failureInserts).toEqual([
      expect.objectContaining({ user_id: USER_ID, failure_type: 'token_refresh_failed' }),
    ])
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, type: 'strava_disconnected' })
    )
    expect(getAllActivitiesMock).not.toHaveBeenCalled()
  })

  it('끊김을 저장한 뒤에는 다음 동기화가 갱신을 다시 시도하지 않는다', async () => {
    const { supabase } = makeFake({
      connection: { token_expires_at: PAST, disconnected_at: '2026-10-01T00:00:00.000Z', disconnect_reason: 'token_refresh_failed' },
    })
    createServiceClientMock.mockReturnValue(supabase)

    await expect(syncStravaActivities(USER_ID)).rejects.toBeInstanceOf(StravaDisconnectedError)

    expect(refreshMock).not.toHaveBeenCalled()
  })
})

describe('syncStravaActivities — Strava 401(철회)은 끊김이다', () => {
  it('활동 조회가 401이면 token_revoked로 끊김을 저장하고 마지막 동기화 시각을 되돌린다', async () => {
    const { supabase, record } = makeFake({ connection: { last_synced_at: '2026-10-01T00:00:00.000Z' } })
    createServiceClientMock.mockReturnValue(supabase)
    getAllActivitiesMock.mockRejectedValue(new StravaApiError('Strava API 오류 401: Authorization Error', 401))

    await expect(syncStravaActivities(USER_ID)).rejects.toMatchObject({
      name: 'StravaDisconnectedError',
      reason: 'token_revoked',
    })

    const saved = disconnectUpdates(record)
    expect(saved).toHaveLength(1)
    expect(saved[0].payload).toMatchObject({ disconnect_reason: 'token_revoked' })
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, type: 'strava_disconnected' })
    )
    // 잠금 갱신 + 롤백 update는 그대로 일어난다
    expect(record.connectionUpdates.some((u) => 'last_synced_at' in u.payload)).toBe(true)
  })

  it('401이 아닌 오류(500)는 끊김으로 저장하지 않고 원래 오류를 던진다', async () => {
    const { supabase, record } = makeFake({ connection: {} })
    createServiceClientMock.mockReturnValue(supabase)
    const upstream = new StravaApiError('Strava API 오류 500: oops', 500)
    getAllActivitiesMock.mockRejectedValue(upstream)

    await expect(syncStravaActivities(USER_ID)).rejects.toBe(upstream)

    expect(disconnectUpdates(record)).toHaveLength(0)
    expect(createNotificationMock).not.toHaveBeenCalled()
  })
})

describe('syncStravaActivities — first_sync_pending', () => {
  it('true이면 커서를 읽지 않고 after 없이 조회한다 (이전 계정 이력에 끌려가지 않는다)', async () => {
    const { supabase, record } = makeFake({
      connection: { first_sync_pending: true },
      latestActivityStartDate: '2026-09-14T10:00:00.000Z', // 이전 계정의 최신 활동
    })
    createServiceClientMock.mockReturnValue(supabase)

    await syncStravaActivities(USER_ID)

    expect(getAllActivitiesMock).toHaveBeenCalledTimes(1)
    expect(getAllActivitiesMock.mock.calls[0]).toEqual(['enc-access', undefined])
    expect(record.cursorQueries).toBe(0)
  })

  it('false이면 옛 동작 그대로 커서를 읽어 after를 계산한다', async () => {
    const latest = '2026-09-14T10:00:00.000Z'
    const { supabase, record } = makeFake({
      connection: { first_sync_pending: false },
      latestActivityStartDate: latest,
    })
    createServiceClientMock.mockReturnValue(supabase)

    await syncStravaActivities(USER_ID)

    expect(record.cursorQueries).toBeGreaterThan(0)
    expect(getAllActivitiesMock.mock.calls[0]).toEqual([
      'enc-access',
      Math.floor(new Date(latest).getTime() / 1000) - 15 * 60,
    ])
  })

  it('true이면 initial_sync_done이 true여도 인정 활동 최근 1건만 정산하고, 정산 뒤 false로 돌린다', async () => {
    const { supabase, record } = makeFake({
      connection: { first_sync_pending: true },
      initialSyncDone: true,
    })
    createServiceClientMock.mockReturnValue(supabase)
    getAllActivitiesMock.mockResolvedValue([makeRaw(1), makeRaw(2), makeRaw(3)])

    const result = await syncStravaActivities(USER_ID)

    expect(result.synced).toBe(1)
    const cleared = pendingUpdates(record)
    expect(cleared).toHaveLength(1)
    expect(cleared[0].payload).toEqual({ first_sync_pending: false })
    expect(cleared[0].eqs).toEqual({ user_id: USER_ID, strava_athlete_id: ATHLETE_ID })
  })

  it('정산한 활동이 없으면 true를 그대로 둔다 (다음 동기화에서 다시 찾는다)', async () => {
    const { supabase, record } = makeFake({ connection: { first_sync_pending: true } })
    createServiceClientMock.mockReturnValue(supabase)
    getAllActivitiesMock.mockResolvedValue([])

    const result = await syncStravaActivities(USER_ID)

    expect(result.synced).toBe(0)
    expect(pendingUpdates(record)).toHaveLength(0)
  })

  it('false이고 initial_sync_done이 true면 옛 동작대로 전부 정산하고 해제 update를 하지 않는다', async () => {
    const { supabase, record } = makeFake({
      connection: { first_sync_pending: false },
      initialSyncDone: true,
    })
    createServiceClientMock.mockReturnValue(supabase)
    getAllActivitiesMock.mockResolvedValue([makeRaw(1), makeRaw(2), makeRaw(3)])

    const result = await syncStravaActivities(USER_ID)

    expect(result.synced).toBe(3)
    expect(pendingUpdates(record)).toHaveLength(0)
  })
})
