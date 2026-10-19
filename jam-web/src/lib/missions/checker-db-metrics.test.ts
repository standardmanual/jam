/**
 * checkMissions — DB 기록 조건(믹스·드랍·캡슐 등) 연결 시험 (티켓 20261019_1445 1회)
 *
 * 로더·지표 함수·판정 함수는 각자 시험이 있다. 이 파일은 `checkMissions`가 그 조각을 실제로 이어 붙여
 *  ① 참가 전·미션 시작 전·종료 뒤 기록을 세지 않고 기간 안 기록으로 판정하는지
 *  ② 로더가 던지면 그 미션만 건너뛰고(완료도 0 폴백도 아님) 나머지 미션은 계속 판정하는지
 *  ③ 같은 동기화에서 먼저 완료된 미션이 뒤 미션의 `mission_complete_count`에 잡히는지
 *  ④ DB 키가 없는 미션은 DB 지표를 읽지 않는지
 * 를 한 번에 고정한다. DB는 메모리 모조(`fakeSupabase.ts`)이고 `mission_complete` RPC는 완료 기록을 실제로 쌓는다.
 *
 * 위치: `__tests__/`는 vitest에서 제외돼 있어(node assert 시험 전용) 모킹이 필요한 이 파일은 옆에 둔다
 * (`checker-window.test.ts`와 같은 이유와 같은 모킹).
 * 실행: cd jam-web && npx vitest run src/lib/missions/checker-db-metrics.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NormalizedActivity } from '@/types/strava'
import type { FakeDb, FakeRow } from '@/lib/badge-engine/__tests__/fakeSupabase'

const USER = 'user-1'

const holder = vi.hoisted(() => ({ db: null as unknown as FakeDb }))

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => holder.db.client }))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/notifications')>()
  return { ...actual, createNotification: vi.fn(async () => {}) }
})
vi.mock('@/lib/missions/rewards', () => ({
  grantMissionRewards: vi.fn(async () => ({ awardedBadgeIds: [], awardedBadgeNames: [], totalAwardedPoints: 0, pendingItemBadgeIds: [], pendingLockedBadgeIds: [] })),
}))
vi.mock('@/lib/strava/activity-history', () => ({
  getSignupAnchorDate: async () => null,
  getActivityHistory: async () => [],
  mergeActivityHistory: (_history: unknown, activities: unknown) => activities,
}))

import { checkMissions } from '@/lib/missions/checker'
import { makeFakeDb } from '@/lib/badge-engine/__tests__/fakeSupabase'

const STARTS = '2026-10-01T00:00:00.000Z'
const JOINED = '2026-10-10T00:00:00.000Z'
const BEFORE_JOIN = '2026-10-08T00:00:00.000Z'
const AFTER_JOIN = '2026-10-12T00:00:00.000Z'
const ENDS = '2026-10-15T00:00:00.000Z'
const AFTER_END = '2026-10-18T00:00:00.000Z'
// 완료 기록의 시각은 RPC 모조가 «지금»으로 쌓는다 — 시험을 돌리는 날짜와 상관없이 기간 안에 들도록 일찍 시작·참가한 미션을 쓴다
const LONG_AGO = '2026-01-01T00:00:00.000Z'

function activity(startDate: string): NormalizedActivity {
  return {
    stravaId: 1,
    name: 'Test',
    distanceKm: 10,
    movingTimeSec: 3600,
    elevationGainM: 100,
    jamActivityType: 'running',
    startDate,
    startDateLocal: startDate.replace('Z', ''),
    averageSpeedKmh: 10,
    startLatLng: null,
  } as unknown as NormalizedActivity
}

const engineMission = (id: string, condition: Record<string, unknown>, overrides: Record<string, unknown> = {}) => ({
  id,
  title: `미션 ${id}`,
  mission_type: 'engine_condition',
  condition_json: condition,
  starts_at: STARTS,
  ends_at: null,
  max_completions: null,
  reward_badge_ids: [],
  status_display_type: 'achievement',
  ...overrides,
})

const successLog = (id: string, at: string): FakeRow => ({
  id,
  user_id: USER,
  recipe_id: 'r1',
  is_recipe_first: false,
  attempted_at: at,
  ingredient_badge_ids: [],
})

/** 모조 DB를 세운다. `missions`는 조회 필터(시작·종료)를 적용하지 않고 전부 활성으로 돌려준다 */
function setup(
  missions: Record<string, unknown>[],
  extra: Record<string, FakeRow[]> = {},
  errors: Record<string, string> = {},
  joinedAt = JOINED
) {
  const rpcCalls: { fn: string; args: { p_mission_id: string } }[] = []
  const tables: Record<string, FakeRow[]> = {
    missions: missions as FakeRow[],
    user_mission_completions: [],
    user_mission_participations: missions.map((m) => ({ user_id: USER, mission_id: m.id, joined_at: joinedAt })),
    ...extra,
  }
  holder.db = makeFakeDb(tables, {
    errors,
    passthroughTables: ['missions'],
    rpc: (fn, args) => {
      const typed = args as { p_mission_id: string }
      rpcCalls.push({ fn, args: typed })
      // 실제 RPC(마이그레이션 249)처럼 완료 기록을 쌓는다 — 뒤 미션의 mission_complete_count가 이를 읽는다
      tables.user_mission_completions.push({
        id: `c-${typed.p_mission_id}`,
        user_id: USER,
        mission_id: typed.p_mission_id,
        completed_at: new Date().toISOString(),
      })
      return { ok: true, status: 'completed', completion_id: `c-${typed.p_mission_id}` }
    },
  })
  return { rpcCalls }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('checkMissions — DB 기록 조건은 참가한 뒤, 기간 안의 값으로 판정한다', () => {
  it('참가 전 기록은 세지 않는다 — 참가 뒤 기록이 모자라면 완료되지 않는다', async () => {
    const { rpcCalls } = setup(
      [engineMission('m1', { combine_success_count: 2 })],
      { user_combine_success_logs: [successLog('a', BEFORE_JOIN), successLog('b', BEFORE_JOIN), successLog('c', AFTER_JOIN)] }
    )
    const result = await checkMissions(USER, [])
    expect(result.completedMissionIds).toEqual([])
    expect(rpcCalls).toEqual([])
  })

  it('참가 뒤 기록이 조건만큼 쌓이면 완료한다', async () => {
    const { rpcCalls } = setup(
      [engineMission('m1', { combine_success_count: 2 })],
      { user_combine_success_logs: [successLog('a', BEFORE_JOIN), successLog('b', AFTER_JOIN), successLog('c', AFTER_JOIN)] }
    )
    const result = await checkMissions(USER, [])
    expect(result.completedMissionIds).toEqual(['m1'])
    expect(rpcCalls).toHaveLength(1)
  })

  it('종료 뒤 기록은 세지 않는다', async () => {
    setup(
      [engineMission('m1', { combine_success_count: 2 }, { ends_at: ENDS })],
      { user_combine_success_logs: [successLog('a', AFTER_JOIN), successLog('b', AFTER_END)] }
    )
    const result = await checkMissions(USER, [])
    expect(result.completedMissionIds).toEqual([])
  })

  it('미션 시작 전에 참가했어도 시작 전 기록은 세지 않는다', async () => {
    setup(
      [engineMission('m1', { combine_success_count: 2 }, { starts_at: '2026-10-09T00:00:00.000Z' })],
      { user_combine_success_logs: [successLog('a', '2026-10-06T00:00:00.000Z'), successLog('b', '2026-10-11T00:00:00.000Z')] },
      {},
      '2026-10-05T00:00:00.000Z'
    )
    const result = await checkMissions(USER, [])
    expect(result.completedMissionIds).toEqual([])
  })

  it('DB 조건과 활동 조건은 AND다 — 활동 조건을 못 채우면 DB 조건이 충분해도 완료하지 않는다', async () => {
    setup(
      [engineMission('m1', { combine_success_count: 1, distance_km: 5 })],
      { user_combine_success_logs: [successLog('a', AFTER_JOIN)] }
    )
    expect((await checkMissions(USER, [])).completedMissionIds).toEqual([])
    expect((await checkMissions(USER, [activity(AFTER_JOIN)])).completedMissionIds).toEqual(['m1'])
  })
})

describe('checkMissions — 로더가 던지면 그 미션만 건너뛴다', () => {
  it('읽지 못한 미션은 완료도 폴백도 없이 건너뛰고, 다른 미션은 계속 판정한다', async () => {
    const { rpcCalls } = setup(
      [
        engineMission('m-db-fail', { capsule_open_count: 0 }), // 0 이상이면 항상 충족 — 폴백(0)으로 읽었다면 완료됐을 조건
        engineMission('m-plain', { distance_km: 5 }),
      ],
      {},
      { capsule_opens: 'DB 장애' }
    )
    const result = await checkMissions(USER, [activity(AFTER_JOIN)])
    expect(result.completedMissionIds).toEqual(['m-plain'])
    expect(rpcCalls.map((c) => c.args.p_mission_id)).toEqual(['m-plain'])
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('이 미션만 건너뛰었어요'), expect.any(Error))
  })
})

describe('checkMissions — 같은 동기화에서 먼저 완료된 미션이 mission_complete_count에 잡힌다', () => {
  it('앞 미션이 완료되면 뒤 미션의 완료 수 조건이 충족된다', async () => {
    const { rpcCalls } = setup(
      [
        engineMission('m-first', { distance_km: 5 }, { starts_at: LONG_AGO }),
        engineMission('m-second', { mission_complete_count: 1 }, { starts_at: LONG_AGO }),
      ],
      {},
      {},
      LONG_AGO
    )
    const result = await checkMissions(USER, [activity(AFTER_JOIN)])
    expect(result.completedMissionIds).toEqual(['m-first', 'm-second'])
    expect(rpcCalls.map((c) => c.args.p_mission_id)).toEqual(['m-first', 'm-second'])
  })

  it('앞 미션이 완료되지 않으면 뒤 미션은 완료되지 않는다', async () => {
    setup(
      [
        engineMission('m-first', { distance_km: 50 }, { starts_at: LONG_AGO }),
        engineMission('m-second', { mission_complete_count: 1 }, { starts_at: LONG_AGO }),
      ],
      {},
      {},
      LONG_AGO
    )
    const result = await checkMissions(USER, [activity(AFTER_JOIN)])
    expect(result.completedMissionIds).toEqual([])
  })

  it('참가 전에 완료한 미션은 세지 않는다', async () => {
    setup(
      [engineMission('m1', { mission_complete_count: 1 })],
      { user_mission_completions: [{ id: 'old', user_id: USER, mission_id: 'm-old', completed_at: BEFORE_JOIN }] }
    )
    const result = await checkMissions(USER, [])
    expect(result.completedMissionIds).toEqual([])
  })
})

describe('checkMissions — DB 키가 없는 미션은 DB 지표를 읽지 않는다', () => {
  it('활동 기록 조건만 든 engine_condition 미션과 distance 미션은 지표 표를 건드리지 않는다', async () => {
    setup([
      engineMission('m-engine', { distance_km: 5 }),
      engineMission('m-distance', { distance_km: 5 }, { mission_type: 'distance' }),
    ])
    const result = await checkMissions(USER, [activity(AFTER_JOIN)])
    expect(result.completedMissionIds).toEqual(['m-engine', 'm-distance'])
    const metricTables = ['user_combine_success_logs', 'user_combine_fail_logs', 'poi_drops', 'capsule_opens', 'inventory_item_events', 'user_item_book_completions']
    for (const table of metricTables) expect(holder.db.queried).not.toContain(table)
  })
})
