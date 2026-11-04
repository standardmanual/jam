/**
 * strava/sync — 동기화 기록(`user_sync_events`) 훅 회귀 테스트 (티켓 20261104_2234)
 *
 * 미션 전용 조건 `sync_count`의 원천인 동기화 기록이 ① 미션 판정(`checkMissions`)보다 **앞에서** 남고(뒤에 두면 이번 동기화가 세어지지 않아
 * 미션이 한 번 늦게 완료된다), ② 저장이 실패해도(오류 응답·예외) 동기화가 계속되고, ③ 새 활동이 없는 경로에서는 남기지 않는지 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-event-record.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StravaSummaryActivity } from '@/types/strava'

/** 호출 순서 기록 — 'sync_event_insert'(동기화 기록)와 'checkMissions'(미션 판정)가 순서대로 쌓인다 */
const { callOrder, checkMissionsSpy } = vi.hoisted(() => {
  const order: string[] = []
  return {
    callOrder: order,
    checkMissionsSpy: vi.fn(async () => {
      order.push('checkMissions')
      return { completedMissionIds: [] as string[], awardedBadgeIds: [] as string[] }
    }),
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))
vi.mock('@/lib/drop-engine/syncIssueRun', () => ({ issueSyncItemBadges: vi.fn(async () => ({ issuedBadgeIds: [], pendingCount: 0 })) }))
vi.mock('@/lib/badge-engine/index', () => ({ evaluateBadges: vi.fn(async () => []) }))
vi.mock('@/lib/badge-engine/jamActionBadges', () => ({ evaluateJamActionBadges: vi.fn(async () => []) })) // JAM! 행동 지표 판정은 sync-jam-action-hook.test.ts가 따로 확인한다 (티켓 20261001_0633)
vi.mock('@/lib/badge-engine/usageBadges', () => ({
  recordDailySyncAndEvaluate: vi.fn(async () => []),
}))
vi.mock('@/lib/poi/matcher', () => ({ matchPoisForActivity: vi.fn(async () => []) }))
vi.mock('@/lib/itembook/checker', () => ({
  checkItemBookCompletion: vi.fn(async () => ({ completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] })),
}))
vi.mock('@/lib/itembook/completable', () => ({ findCompletableItemBooks: vi.fn(async () => []) }))
vi.mock('@/lib/missions/checker', () => ({
  checkMissions: checkMissionsSpy,
}))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn(async () => {}),
  dailyGroupKey: vi.fn(() => 'group-key'),
}))
vi.mock('@/lib/notifications/recap', () => ({ recordActivityRecap: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications/batch/collections', () => ({ selectCompletableDrafts: vi.fn(() => []) }))
vi.mock('@/lib/strava/api', () => ({
  getActivityStreams: vi.fn(async () => null),
  getActivities: vi.fn(),
  refreshStravaToken: vi.fn(),
}))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: vi.fn(async () => {}) }))

import { processFetchedActivities } from '../sync'

type InsertResult = { error: { message: string } | null }

interface FakeOptions {
  /** `user_sync_events` insert의 결과 — 기본은 성공 */
  syncEventInsert?: () => Promise<InsertResult>
}

/** `user_sync_events` insert만 기록하는 최소 페이크 supabase — 그 외 테이블은 빈 결과로 폴백한다 */
function makeFakeSupabase(options: FakeOptions = {}) {
  const syncEventRows: Record<string, unknown>[] = []
  const from = (table: string) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      is: () => builder,
      not: () => builder,
      limit: () => builder,
      order: () => builder,
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      upsert: async () => ({ error: null }),
      insert: async (row: Record<string, unknown>) => {
        if (table === 'user_sync_events') {
          callOrder.push('sync_event_insert')
          syncEventRows.push(row)
          return options.syncEventInsert ? options.syncEventInsert() : { error: null }
        }
        return { error: null }
      },
      then(onFulfilled: (v: { data: unknown; error: unknown }) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected)
      },
    }
    return builder
  }
  return { client: { from } as unknown as SupabaseClient, syncEventRows }
}

function makeRawActivity(id: number): StravaSummaryActivity {
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
    start_date: '2026-09-10T00:00:00Z',
    start_date_local: '2026-09-10T09:00:00',
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
    map: { id: `m${id}`, summary_polyline: 'encoded-polyline', resource_state: 2 },
    trainer: false,
    commute: false,
    manual: false,
    private: false,
    visibility: 'everyone',
    flagged: false,
    gear_id: null,
    start_latlng: [37.5, 127.0],
    end_latlng: [],
    average_speed: 2.7,
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
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  callOrder.length = 0
})

describe('processFetchedActivities — 동기화 기록(user_sync_events)', () => {
  it('새 활동을 받은 동기화마다 그 유저의 기록 한 줄을 남긴다', async () => {
    const db = makeFakeSupabase()
    await processFetchedActivities(db.client, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(db.syncEventRows).toEqual([{ user_id: 'user-1' }])
  })

  it('기록은 미션 판정(checkMissions)보다 앞에서 남는다 — 이번 동기화가 판정에 세어진다', async () => {
    const db = makeFakeSupabase()
    await processFetchedActivities(db.client, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(callOrder).toEqual(['sync_event_insert', 'checkMissions'])
  })

  it('기록 저장이 오류를 돌려줘도 동기화는 계속되고 미션 판정까지 간다', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = makeFakeSupabase({ syncEventInsert: async () => ({ error: { message: 'DB 장애' } }) })

    const result = await processFetchedActivities(db.client, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(result).toBeDefined()
    expect(checkMissionsSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('기록 저장이 예외를 던져도 동기화는 계속되고 미션 판정까지 간다', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = makeFakeSupabase({
      syncEventInsert: async () => {
        throw new Error('네트워크 끊김')
      },
    })

    const result = await processFetchedActivities(db.client, 'user-1', 'token', [makeRawActivity(1)], false, 'sync')

    expect(result).toBeDefined()
    expect(checkMissionsSpy).toHaveBeenCalledTimes(1)
    errorSpy.mockRestore()
  })

  it('새 활동이 없는 동기화(빈 배치)에서는 기록을 남기지 않는다', async () => {
    const db = makeFakeSupabase()
    await processFetchedActivities(db.client, 'user-1', 'token', [], false, 'sync')

    expect(db.syncEventRows).toEqual([])
    expect(checkMissionsSpy).not.toHaveBeenCalled()
  })
})
