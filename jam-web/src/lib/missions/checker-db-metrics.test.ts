/**
 * checkMissions — DB 기록 조건(믹스·드랍·캡슐 등, 2회: 날짜·체크인) 연결 시험 (티켓 20261019_1445 1·2회)
 *
 * 로더·지표 함수·판정 함수는 각자 시험이 있다. 이 파일은 `checkMissions`가 그 조각을 실제로 이어 붙여
 *  ① 참가 전·미션 시작 전·종료 뒤 기록을 세지 않고 기간 안 기록으로 판정하는지
 *  ② 로더가 던지면 그 미션만 건너뛰고(완료도 0 폴백도 아님) 나머지 미션은 계속 판정하는지
 *  ③ 같은 동기화에서 먼저 완료된 미션이 뒤 미션의 `mission_complete_count`에 잡히는지
 *  ④ DB 키가 없는 미션은 DB 지표를 읽지 않는지
 *  ⑤ 기간 동안 모은 잼(`jam_period_earned`, 3-A회): 활동 시각이 참가 뒤인 정산 잼만 세고, 진행값이 모은 잼으로 기록되며,
 *     활동 피드·소식으로는 그 양이 나가지 않는지
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

const holder = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  /** 날짜 지표가 읽는 가입 시각 — 기본은 못 읽는 상태(null)이고, 날짜 지표 시험이 필요할 때 채운다 */
  signupAt: null as string | null,
}))

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
  getSignupAnchorDate: async () => holder.signupAt,
  getActivityHistory: async () => [],
  mergeActivityHistory: (_history: unknown, activities: unknown) => activities,
}))

import { checkMissions } from '@/lib/missions/checker'
import { recordFeedEvent } from '@/lib/activity-feed'
import { createNotification } from '@/lib/notifications'
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
  holder.signupAt = null
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

// ═══════════════════════════════════════════════════════════════════════
// 날짜·체크인 키 (티켓 20261019_1445 2회)
// ═══════════════════════════════════════════════════════════════════════

describe('checkMissions — 날짜·체크인 키도 참가한 뒤, 기간 안의 값으로 판정한다', () => {
  const RUN = { jamActivityType: 'running', distanceKm: 5, movingTimeSec: 1800, averageSpeedKmh: 10 }
  const day = (d: string) => `2026-10-${d}T03:00:00.000Z` // KST 낮 12시
  // JOINED = 10-10 00:00Z. 월요일은 10-05·10-12
  const act = (id: string, d: string): FakeRow => ({ id, user_id: USER, start_date: day(d), normalized: RUN, filter_reason: null })
  const earn = (id: string, badgeId: string, d: string): FakeRow => ({
    id,
    user_id: USER,
    badge_id: badgeId,
    poi_id: `poi-${badgeId}`,
    triggered_by_activity_date: day(d),
    earned_at: '2026-10-31T00:00:00Z',
  })

  beforeEach(() => {
    holder.signupAt = '2026-09-01T00:00:00.000Z'
  })

  it('weekly_active_days: 참가 전 활동일은 세지 않는다 — 참가 뒤 같은 주의 날이 모자라면 완료되지 않는다', async () => {
    // 참가 전(10-06·07·08) 3일 + 참가 뒤 1일(10-12). 세는 날은 참가 뒤 1일뿐이다
    const { rpcCalls } = setup(
      [engineMission('m1', { weekly_active_days: 3 })],
      { strava_activities: [act('a1', '06'), act('a2', '07'), act('a3', '08'), act('a4', '12')] }
    )
    expect((await checkMissions(USER, [])).completedMissionIds).toEqual([])
    expect(rpcCalls).toEqual([])
  })

  it('weekly_active_days: 참가 뒤 같은 주에 조건만큼 활동하면 완료한다', async () => {
    const { rpcCalls } = setup(
      [engineMission('m1', { weekly_active_days: 3 })],
      { strava_activities: [act('a1', '06'), act('a2', '12'), act('a3', '13'), act('a4', '14')] }
    )
    expect((await checkMissions(USER, [])).completedMissionIds).toEqual(['m1'])
    expect(rpcCalls).toHaveLength(1)
  })

  it('same_spot_checkin_days: 참가 전 체크인 날은 합치지 않는다', async () => {
    const sameSpot = (id: string, d: string): FakeRow => ({ ...earn(id, 'b', d), poi_id: 'p1' })
    setup(
      [engineMission('m1', { same_spot_checkin_days: 2 })],
      { user_checkin_badge_earns: [sameSpot('c1', '06'), sameSpot('c2', '07'), sameSpot('c3', '12')] }
    )
    expect((await checkMissions(USER, [])).completedMissionIds).toEqual([])

    setup(
      [engineMission('m1', { same_spot_checkin_days: 2 })],
      { user_checkin_badge_earns: [sameSpot('c1', '06'), sameSpot('c3', '12'), sameSpot('c4', '13')] }
    )
    expect((await checkMissions(USER, [])).completedMissionIds).toEqual(['m1'])
  })

  it('new_checkin_badge_count: 참가 전에 처음 받은 배지는 참가 뒤에 다시 받아도 새 배지로 세지 않는다', async () => {
    setup(
      [engineMission('m1', { new_checkin_badge_count: 1 })],
      { user_checkin_badge_earns: [earn('c1', 'old', '06'), earn('c2', 'old', '12')] }
    )
    expect((await checkMissions(USER, [])).completedMissionIds).toEqual([])

    // 참가 뒤에 처음 받은 배지가 하나 있으면 완료한다
    setup(
      [engineMission('m1', { new_checkin_badge_count: 1 })],
      { user_checkin_badge_earns: [earn('c1', 'old', '06'), earn('c2', 'old', '12'), earn('c3', 'fresh', '13')] }
    )
    expect((await checkMissions(USER, [])).completedMissionIds).toEqual(['m1'])
  })

  it('checkin_category_count: 참가 뒤 처음 받은 배지의 장소 종류 수로 판정한다', async () => {
    const badges: FakeRow[] = [
      { id: 'old', type: 'checkin', name: 'O', category: 'train_subway' },
      { id: 'fresh', type: 'checkin', name: 'F', category: 'train_subway' },
    ]
    const condition = { checkin_category_count: { category: 'train_subway', count: 2 } }
    setup([engineMission('m1', condition)], {
      user_checkin_badge_earns: [earn('c1', 'old', '06'), earn('c2', 'old', '12'), earn('c3', 'fresh', '13')],
      badges,
    })
    // old는 참가 전에 처음 받았으니 fresh 하나뿐이다
    expect((await checkMissions(USER, [])).completedMissionIds).toEqual([])

    // 조건이 1개면 fresh 하나로 충족한다
    setup([engineMission('m1', { checkin_category_count: { category: 'train_subway', count: 1 } })], {
      user_checkin_badge_earns: [earn('c1', 'old', '06'), earn('c2', 'old', '12'), earn('c3', 'fresh', '13')],
      badges,
    })
    expect((await checkMissions(USER, [])).completedMissionIds).toEqual(['m1'])
  })

  it('checkin_badge_count: 참가 뒤 처음 받은 배지 가운데 지정 이름의 수로 판정한다', async () => {
    const badges: FakeRow[] = [
      { id: 'old', type: 'checkin', name: '왕십리역' },
      { id: 'fresh', type: 'checkin', name: '성수역' },
    ]
    const condition = { checkin_badge_count: { checkin_badge_names: ['성수역', '왕십리역'], count: 1 } }
    const { rpcCalls } = setup([engineMission('m1', condition)], {
      user_checkin_badge_earns: [earn('c1', 'old', '06'), earn('c2', 'fresh', '13')],
      badges,
    })
    expect((await checkMissions(USER, [])).completedMissionIds).toEqual(['m1'])
    expect(rpcCalls).toHaveLength(1)
  })

  it('체크인 표를 읽지 못하면 그 미션만 건너뛴다 (완료도 0 폴백도 아니다)', async () => {
    const { rpcCalls } = setup(
      [
        engineMission('m-db-fail', { new_checkin_badge_count: 0 }), // 0 이상이면 항상 충족 — 폴백(0)이었다면 완료됐을 조건
        engineMission('m-plain', { distance_km: 5 }),
      ],
      {},
      { user_checkin_badge_earns: 'DB 장애' }
    )
    const result = await checkMissions(USER, [activity(AFTER_JOIN)])
    expect(result.completedMissionIds).toEqual(['m-plain'])
    expect(rpcCalls.map((c) => c.args.p_mission_id)).toEqual(['m-plain'])
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('이 미션만 건너뛰었어요'), expect.any(Error))
  })

  it('가입 시각을 읽지 못하면 날짜 지표 미션만 건너뛴다', async () => {
    holder.signupAt = null
    const { rpcCalls } = setup(
      [
        engineMission('m-date', { weekly_active_days: 0 }), // 0 이상이면 항상 충족
        engineMission('m-plain', { distance_km: 5 }),
      ],
      { strava_activities: [act('a1', '12')] }
    )
    const result = await checkMissions(USER, [activity(AFTER_JOIN)])
    expect(result.completedMissionIds).toEqual(['m-plain'])
    expect(rpcCalls.map((c) => c.args.p_mission_id)).toEqual(['m-plain'])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 기간 동안 모은 잼 (티켓 20261019_1445 3-A회)
// ═══════════════════════════════════════════════════════════════════════

describe('checkMissions — 기간 동안 모은 잼(jam_period_earned)', () => {
  const SYNCED_AT = '2026-10-13T00:00:00.000Z' // 정산(동기화) 시각 — 모든 줄이 참가 뒤다. 활동 시각과 상관없다
  const jamActivity = (id: string, startDate: string): FakeRow => ({ id, user_id: USER, start_date: startDate })
  const settlement = (activityId: string, amount: number): FakeRow => ({
    id: `tx-${activityId}`,
    user_id: USER,
    amount,
    reason: 'activity_settlement',
    source_activity_id: activityId,
    created_at: SYNCED_AT,
  })
  const jamMission = (condition: Record<string, unknown>, overrides: Record<string, unknown> = {}) =>
    engineMission('m-jam', condition, { status_display_type: 'ranking', ...overrides })

  /** `user_mission_participations.update(...)`에 실린 값을 모은다 — 진행값이 어떻게 기록되는지 본다 */
  function captureProgressWrites(): { progress_value: number }[] {
    const writes: { progress_value: number }[] = []
    const client = holder.db.client
    const originalFrom = client.from.bind(client)
    client.from = ((table: string) => {
      const builder = originalFrom(table) as unknown as Record<string, (...args: unknown[]) => unknown>
      if (table === 'user_mission_participations') {
        const originalUpdate = builder.update
        builder.update = (payload: unknown) => {
          if (payload && typeof payload === 'object' && 'progress_value' in payload) writes.push(payload as { progress_value: number })
          return originalUpdate(payload)
        }
      }
      return builder
    }) as unknown as typeof client.from
    return writes
  }

  beforeEach(() => {
    vi.mocked(recordFeedEvent).mockClear()
    vi.mocked(createNotification).mockClear()
  })

  it('참가 전 활동의 잼은 늦게 정산돼도 세지 않는다 — 참가 뒤 활동의 잼이 모자라면 완료되지 않는다', async () => {
    const { rpcCalls } = setup([jamMission({ jam_period_earned: 100 })], {
      strava_activities: [jamActivity('a-before', BEFORE_JOIN), jamActivity('a-after', AFTER_JOIN)],
      jam_transactions: [settlement('a-before', 100), settlement('a-after', 30)],
    })
    expect((await checkMissions(USER, [])).completedMissionIds).toEqual([])
    expect(rpcCalls).toEqual([])
  })

  it('참가 뒤 활동의 잼이 조건만큼 쌓이면 완료한다', async () => {
    const { rpcCalls } = setup([jamMission({ jam_period_earned: 100 })], {
      strava_activities: [jamActivity('a-before', BEFORE_JOIN), jamActivity('a-after1', AFTER_JOIN), jamActivity('a-after2', AFTER_JOIN)],
      jam_transactions: [settlement('a-before', 1000), settlement('a-after1', 30), settlement('a-after2', 70)],
    })
    expect((await checkMissions(USER, [])).completedMissionIds).toEqual(['m-jam'])
    expect(rpcCalls).toHaveLength(1)
  })

  it('종료 뒤 활동의 잼은 세지 않는다', async () => {
    setup([jamMission({ jam_period_earned: 100 }, { ends_at: ENDS })], {
      strava_activities: [jamActivity('a-in', AFTER_JOIN), jamActivity('a-late', AFTER_END)],
      jam_transactions: [settlement('a-in', 60), settlement('a-late', 500)],
    })
    expect((await checkMissions(USER, [])).completedMissionIds).toEqual([])
  })

  it('못 채운 동안의 진행값은 모은 잼이다 (순위형이 모은 양 순으로 세울 수 있다)', async () => {
    setup([jamMission({ jam_period_earned: 100 })], {
      strava_activities: [jamActivity('a1', AFTER_JOIN)],
      jam_transactions: [settlement('a1', 60)],
    })
    const writes = captureProgressWrites()
    expect((await checkMissions(USER, [])).completedMissionIds).toEqual([])
    expect(writes).toEqual([{ progress_value: 60 }])
  })

  it('활동 조건이 함께 있으면 잼을 채워도 활동 조건을 못 채우면 완료하지 않는다 (진행값은 모은 잼 그대로)', async () => {
    setup([jamMission({ jam_period_earned: 100, distance_km: 50 })], {
      strava_activities: [jamActivity('a1', AFTER_JOIN)],
      jam_transactions: [settlement('a1', 150)],
    })
    const writes = captureProgressWrites()
    expect((await checkMissions(USER, [activity(AFTER_JOIN)])).completedMissionIds).toEqual([])
    expect(writes).toEqual([{ progress_value: 150 }])
  })

  it('완료한 활동 피드에는 모은 잼이 실리지 않는다 — final_progress_value는 1, target_value는 0', async () => {
    setup([jamMission({ jam_period_earned: 100 })], {
      strava_activities: [jamActivity('a1', AFTER_JOIN)],
      jam_transactions: [settlement('a1', 137)],
    })
    expect((await checkMissions(USER, [])).completedMissionIds).toEqual(['m-jam'])
    const feedCalls = vi.mocked(recordFeedEvent).mock.calls.filter(([, type]) => type === 'mission_completed')
    expect(feedCalls).toHaveLength(1)
    const payload = feedCalls[0][2] as Record<string, unknown>
    expect(payload.final_progress_value).toBe(1)
    expect(payload.target_value).toBe(0)
    expect(JSON.stringify(payload)).not.toContain('137')
  })

  it('새 키가 없는 engine_condition 미션의 피드도 final_progress_value는 1이다 (예전과 같다)', async () => {
    setup([engineMission('m-plain', { distance_km: 5 })])
    expect((await checkMissions(USER, [activity(AFTER_JOIN)])).completedMissionIds).toEqual(['m-plain'])
    const feedCalls = vi.mocked(recordFeedEvent).mock.calls.filter(([, type]) => type === 'mission_completed')
    expect((feedCalls[0][2] as Record<string, unknown>).final_progress_value).toBe(1)
  })

  it('다른 미션 타입의 피드는 진행값을 그대로 싣는다 (distance 미션: 10km)', async () => {
    setup([engineMission('m-distance', { distance_km: 5 }, { mission_type: 'distance' })])
    expect((await checkMissions(USER, [activity(AFTER_JOIN)])).completedMissionIds).toEqual(['m-distance'])
    const feedCalls = vi.mocked(recordFeedEvent).mock.calls.filter(([, type]) => type === 'mission_completed')
    expect((feedCalls[0][2] as Record<string, unknown>).final_progress_value).toBe(10)
  })

  it('절반을 넘게 모아도 마일스톤 소식이 나가지 않는다 (양이 소식으로 새지 않는다)', async () => {
    setup([jamMission({ jam_period_earned: 100 })], {
      strava_activities: [jamActivity('a1', AFTER_JOIN)],
      jam_transactions: [settlement('a1', 85)], // 85/100 — 단위가 있는 미션이면 80% 마일스톤이 나갔을 양이다
    })
    expect((await checkMissions(USER, [])).completedMissionIds).toEqual([])
    expect(vi.mocked(createNotification)).not.toHaveBeenCalled()
  })

  it('잼 원장을 읽지 못하면 그 미션만 건너뛴다 (완료도 0 폴백도 아니다)', async () => {
    const { rpcCalls } = setup(
      [
        jamMission({ jam_period_earned: 0 }), // 0 이상이면 항상 충족 — 폴백(0)으로 읽었다면 완료됐을 조건
        engineMission('m-plain', { distance_km: 5 }),
      ],
      { strava_activities: [jamActivity('a1', AFTER_JOIN)] },
      { jam_transactions: '원장 장애' }
    )
    const result = await checkMissions(USER, [activity(AFTER_JOIN)])
    expect(result.completedMissionIds).toEqual(['m-plain'])
    expect(rpcCalls.map((c) => c.args.p_mission_id)).toEqual(['m-plain'])
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('이 미션만 건너뛰었어요'), expect.any(Error))
  })

  it('새 키가 없는 미션은 잼 원장을 읽지 않는다', async () => {
    setup([engineMission('m-plain', { distance_km: 5 })])
    await checkMissions(USER, [activity(AFTER_JOIN)])
    expect(holder.db.queried).not.toContain('jam_transactions')
  })
})
