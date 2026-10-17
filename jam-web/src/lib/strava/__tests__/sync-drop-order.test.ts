/**
 * strava/sync — 아이템 배지 발급 단계의 위치·순서·실패 처리 (티켓 20261017_1424 2회, 이전 이름: 드랍 처리 순서 회귀 테스트)
 *
 * 고정하는 것:
 * - 발급은 **잼 정산 뒤**에 돈다(개수가 활동의 잼에 비례하고 발급 기록이 활동 id를 쓴다). 정산한 모든 활동이 대상이다 —
 *   최근 3건 상한은 없다. 첫 동기화는 정산이 최근 1건이라 발급도 1건이다.
 * - 정산하지 못한 활동(정산 RPC 실패)은 발급 대상이 아니다.
 * - 대상에 정산 잼과 등산 여부(`jamActivityType === 'hiking'`)가 실린다.
 * - 발급한 배지 id는 응답 계약의 획득 순서(체크인 → 아이템 배지 → 액티비티 배지 …) 자리에 끼워진다.
 * - 발급 실패는 동기화를 막지 않는다: 활동 단위 실패는 `drop_attempt_failed`로 기록하고(기록이 실패해도 계속),
 *   활동 밖(조회 단계) 실패도 같은 유형으로 기록한 뒤 동기화를 이어 간다.
 *
 * (옛 시험은 `tryItemDrop`이 `user_drop_state.last_activity_at`을 마지막 호출 기준으로 저장하는 순서 역전을 확인했다.
 *  동기화 경로는 더 이상 그 함수를 부르지 않고 `last_activity_at`을 쓰지 않는다.)
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-drop-order.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StravaSummaryActivity } from '@/types/strava'

// 20261014_1320 — strava_sync_failures에 들어간 insert 페이로드를 기록한다. mode로 기록 insert가
// 오류를 돌려주거나 예외를 던지는 상황을 재현한다(기록이 실패해도 다음 활동의 발급이 이어져야 한다).
const failureInserts = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  mode: 'ok' as 'ok' | 'error' | 'throw',
}))
/** 호출 순서: 'upsert'(활동 저장) · 'rpc:<이름>'(RPC 호출) · 'issue'(발급) · 'missions'(미션 판정) */
const events = vi.hoisted(() => ({ list: [] as string[], rpcFail: false }))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))

vi.mock('@/lib/drop-engine/syncIssueRun', () => ({
  issueSyncItemBadges: vi.fn(async () => {
    events.list.push('issue')
    return [] as string[]
  }),
}))
vi.mock('@/lib/badge-engine/index', () => ({ evaluateBadges: vi.fn(async () => []) }))
vi.mock('@/lib/badge-engine/jamActionBadges', () => ({ evaluateJamActionBadges: vi.fn(async () => []) })) // JAM! 행동 지표 판정은 sync-jam-action-hook.test.ts가 따로 확인한다 (티켓 20261001_0633)
vi.mock('@/lib/poi/matcher', () => ({ matchPoisForActivity: vi.fn(async () => []) }))
vi.mock('@/lib/itembook/checker', () => ({
  checkItemBookCompletion: vi.fn(async () => ({ completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] })),
}))
vi.mock('@/lib/itembook/completable', () => ({ findCompletableItemBooks: vi.fn(async () => []) }))
vi.mock('@/lib/missions/checker', () => ({
  checkMissions: vi.fn(async () => {
    events.list.push('missions')
    return { completedMissionIds: [], awardedBadgeIds: [] }
  }),
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
import { issueSyncItemBadges, type SyncIssueTarget } from '@/lib/drop-engine/syncIssueRun'
import { evaluateBadges } from '@/lib/badge-engine/index'

// ── 픽스처 ──────────────────────────────────────────────────────────────

function makeRawActivity(overrides: Partial<StravaSummaryActivity> = {}): StravaSummaryActivity {
  return {
    id: Math.floor(Math.random() * 1_000_000_000),
    resource_state: 2,
    name: 'Test Run',
    distance: 5000,
    moving_time: 1800,
    elapsed_time: 1800,
    total_elevation_gain: 20,
    type: 'Run',
    sport_type: 'Run',
    start_date: '2026-08-01T00:00:00Z',
    start_date_local: '2026-08-01T09:00:00',
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
    map: { id: 'm1', summary_polyline: 'encoded-polyline', resource_state: 2 },
    trainer: false,
    commute: false,
    manual: false,
    private: false,
    visibility: 'everyone',
    flagged: false,
    gear_id: null,
    start_latlng: [37.5, 127.0],
    end_latlng: [],
    average_speed: 2.7, // ≈ 9.7km/h — 차량 속도 필터(기본 60km/h) 통과
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
  }
}

/** `abusing_policy` 행 (id=1, 2026-08-31 운영값) */
const ABUSING_POLICY_ROW: Record<string, unknown> = {
  id: 1,
  soft_common_rate: 1.0,
  soft_rare_rate: 1.0,
  soft_epic_rate: 1.0,
  soft_mystic_rate: 0.0,
  hard_common_rate: 1.0,
  hard_rare_rate: 0.0,
  hard_epic_rate: 1.0,
  hard_mystic_rate: 0.0,
  gps_max_speed_kmh: 300,
  poi_block_hours: 72,
  vehicle_speed_filter_kmh: 60,
  gps_daily_distance_cap_km: 3000,
  transit_walk_max_speed_kmh: 20,
  transit_run_max_speed_kmh: 27,
  transit_cycling_max_speed_kmh: 55,
  transit_segment_min_duration_sec: 30,
  updated_at: '2026-08-31T03:48:29+00:00',
}

/** 최소한의 supabase 클라이언트 스텁 — 활동 저장·정산 RPC·실패 기록만 응답한다. */
function makeFakeSupabase(): SupabaseClient {
  const savedStravaIds: number[] = []
  const from = (table: string) => {
    let selectedCols = ''
    const builder: Record<string, unknown> = {
      select: (cols?: string) => {
        selectedCols = cols ?? ''
        return builder
      },
      eq: () => builder,
      in: () => builder,
      is: () => builder,
      not: () => builder,
      order: () => builder,
      limit: () => builder,
      single: async () => {
        if (table === 'abusing_policy') return { data: { ...ABUSING_POLICY_ROW }, error: null }
        return { data: null, error: null }
      },
      maybeSingle: async () => ({ data: null, error: null }),
      upsert: async (rows?: Record<string, unknown>[]) => {
        if (table === 'strava_activities') {
          events.list.push('upsert')
          for (const row of rows ?? []) savedStravaIds.push(row.strava_id as number)
        }
        return { error: null }
      },
      insert: async (payload?: Record<string, unknown>) => {
        if (table === 'strava_sync_failures') {
          failureInserts.rows.push(payload ?? {})
          if (failureInserts.mode === 'error') return { error: { message: '기록 insert 오류' } }
          if (failureInserts.mode === 'throw') throw new Error('기록 insert 예외')
        }
        return { error: null }
      },
      then(onFulfilled: (v: { data: unknown; error: unknown }) => unknown, onRejected?: (e: unknown) => unknown) {
        if (table === 'strava_activities' && selectedCols === 'id, strava_id') {
          const data = savedStravaIds.map((strava_id) => ({ id: `act-${strava_id}`, strava_id }))
          return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected)
        }
        return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected)
      },
    }
    return builder
  }
  const rpc = async (_name: string, args: Record<string, unknown>) => {
    events.list.push('rpc:' + _name)
    if (events.rpcFail) return { data: null, error: { message: 'rpc failed' } }
    return { data: { amount: args.p_amount }, error: null }
  }
  return { from, rpc } as unknown as SupabaseClient
}

/** 발급기가 마지막으로 받은 대상 목록 */
function lastTargets(): SyncIssueTarget[] {
  const calls = vi.mocked(issueSyncItemBadges).mock.calls
  const last = calls[calls.length - 1]
  return last ? [...last[3]] : []
}

const run = (raws: StravaSummaryActivity[], isFirstSync = false, userId = 'user-1') =>
  processFetchedActivities(makeFakeSupabase(), userId, 'fake-access-token', raws, isFirstSync, 'sync')

/** id가 클수록 최근인 러닝 30분(잼 90) */
const dated = (id: number, overrides: Partial<StravaSummaryActivity> = {}) =>
  makeRawActivity({
    id,
    start_date: `2026-07-${String(10 + id).padStart(2, '0')}T00:00:00Z`,
    start_date_local: `2026-07-${String(10 + id).padStart(2, '0')}T09:00:00`,
    ...overrides,
  })

beforeEach(() => {
  events.list = []
  events.rpcFail = false
  failureInserts.rows = []
  failureInserts.mode = 'ok'
  vi.clearAllMocks()
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

describe('processFetchedActivities — 아이템 배지 발급 대상과 순서', () => {
  it('정산한 활동 5건 모두가 대상이다 — 최근 3건 상한은 없다', async () => {
    await run([dated(1), dated(2), dated(3), dated(4), dated(5)])

    expect(lastTargets().map((t) => t.stravaId).sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('발급은 활동 저장과 정산 뒤에 돈다', async () => {
    await run([dated(1), dated(2)])

    expect(events.list.indexOf('issue')).toBeGreaterThan(events.list.lastIndexOf('rpc:jam_apply'))
    expect(events.list.indexOf('upsert')).toBeLessThan(events.list.indexOf('rpc:jam_apply'))
  })

  it('미션 판정은 발급 뒤에 돈다 — 아이템 수집 미션이 이번에 받은 개체를 보게 한다', async () => {
    await run([dated(1)])

    expect(events.list.indexOf('missions')).toBeGreaterThan(events.list.indexOf('issue'))
  })

  it('대상에 정산 잼과 저장된 활동 id, 시작 시각이 실린다', async () => {
    await run([dated(1)])

    expect(lastTargets()).toEqual([
      { stravaId: 1, activityId: 'act-1', startDate: '2026-07-11T00:00:00Z', jam: 90, isHiking: false },
    ])
  })

  it('등산 활동은 isHiking이 true다', async () => {
    await run([dated(1, { type: 'Hike', sport_type: 'Hike' }), dated(2)])

    expect(Object.fromEntries(lastTargets().map((t) => [t.stravaId, t.isHiking]))).toEqual({ 1: true, 2: false })
  })

  it('첫 동기화는 정산한 최근 1건만 발급 대상이다', async () => {
    await run([dated(1), dated(2), dated(3)], true)

    expect(lastTargets().map((t) => t.stravaId)).toEqual([3])
  })

  it('정산하지 못한 활동(정산 RPC 실패)이면 발급을 부르지 않는다', async () => {
    events.rpcFail = true
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await run([dated(1)])

    expect(issueSyncItemBadges).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('발급한 배지 id는 액티비티 배지 앞 자리에 끼워진다', async () => {
    vi.mocked(issueSyncItemBadges).mockResolvedValueOnce(['item-1', 'item-2'])
    vi.mocked(evaluateBadges).mockResolvedValueOnce(['activity-1'])

    const result = await run([dated(1)])

    expect(result.earnedBadgeIds).toEqual(['item-1', 'item-2', 'activity-1'])
  })
})

describe('processFetchedActivities — 발급 실패 기록 (티켓 20261014_1320)', () => {
  let errorSpy: MockInstance

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('활동 단위 실패는 drop_attempt_failed·stravaId 메시지로 기록하고 반환값은 그대로다', async () => {
    vi.mocked(issueSyncItemBadges).mockImplementationOnce(async (_s, _u, _p, targets, options) => {
      await options?.onActivityError?.(targets[0], new Error('발급 상태 저장 실패'))
      return []
    })

    const result = await run([dated(4)], false, 'user-fail')

    expect(failureInserts.rows).toEqual([
      { user_id: 'user-fail', failure_type: 'drop_attempt_failed', error_message: 'stravaId=4: 발급 상태 저장 실패' },
    ])
    expect(result).toBeDefined()
  })

  it.each(['error', 'throw'] as const)('기록 insert가 %s여도 동기화는 끝까지 간다', async (mode) => {
    failureInserts.mode = mode
    vi.mocked(issueSyncItemBadges).mockImplementationOnce(async (_s, _u, _p, targets, options) => {
      await options?.onActivityError?.(targets[0], new Error('발급 실패'))
      return ['item-1']
    })

    const result = await run([dated(1)])

    expect(failureInserts.rows).toHaveLength(1)
    expect(result.settledCount).toBe(1)
    expect(result.earnedBadgeIds).toContain('item-1')
  })

  it('발급기가 통째로 던져도(조회 단계 실패) 동기화는 계속되고 같은 유형으로 기록한다', async () => {
    vi.mocked(issueSyncItemBadges).mockRejectedValueOnce(new Error('인벤토리 조회 예외'))

    const result = await run([dated(1)], false, 'user-batch')

    expect(failureInserts.rows).toEqual([
      { user_id: 'user-batch', failure_type: 'drop_attempt_failed', error_message: 'batch: 인벤토리 조회 예외' },
    ])
    expect(result.settledCount).toBe(1)
    expect(result.jamEarned).toBe(90)
  })
})
