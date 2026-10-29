/**
 * checkMissions의 checkin·item_collect 판정이 체크인 배지 이력(`user_checkin_badge_earns`)을 보는지
 * 확인한다(티켓 20260930_0014).
 *
 * 체크인 배지 획득은 `sync.ts`가 `user_checkin_badge_earns`에만 기록한다(`user_activity_badges.
 * triggered_by_poi_id`는 레거시 경로에서만 채워진다). 그래서 이력만 있는 사용자의 미션이 달성돼야 한다.
 * DB는 테이블별 응답을 돌려주고 호출을 기록하는 대역이다 — `.eq`·`.in` 필터는 실제로 적용한다.
 * 완료 처리는 `mission_complete` RPC(티켓 20261019_1311)와 서비스 활동 잼(`awardServiceJam`)를 거치므로 둘도 대역으로 바꾼다.
 *
 * 이 파일은 `__tests__/` 밖에 둔다 — 그 폴더는 vitest 제외 대상이고 `test:node`가 tsx로 돌려서
 * `vi.mock`이 깨진다.
 * 실행: cd jam-web && npx vitest run src/lib/missions/checker-ownership.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Row = Record<string, unknown>
type Filter = { op: 'eq' | 'in'; column: string; value: unknown }

interface TableFake {
  rows?: Row[]
  /** `.maybeSingle()` 응답 — inventory처럼 한 행을 읽는 조회용 */
  single?: Row | null
  error?: { message: string }
}

interface CallLog {
  table: string
  filters: Filter[]
}

const state = vi.hoisted(() => ({
  tables: {} as Record<string, TableFake>,
  reads: [] as CallLog[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const filters: Filter[] = []
      const fake = state.tables[table] ?? {}
      let isRead = false

      const resolveRows = () => {
        if (fake.error) return { data: null, error: fake.error }
        const rows = (fake.rows ?? []).filter((row) =>
          filters.every((f) =>
            f.op === 'eq' ? row[f.column] === f.value : (f.value as unknown[]).includes(row[f.column])
          )
        )
        return { data: rows, error: null }
      }

      const builder = {
        select: () => {
          isRead = true
          return builder
        },
        eq: (column: string, value: unknown) => {
          filters.push({ op: 'eq', column, value })
          return builder
        },
        in: (column: string, value: unknown[]) => {
          filters.push({ op: 'in', column, value })
          return builder
        },
        lte: () => builder,
        or: () => builder,
        update: () => builder,
        insert: () => Promise.resolve({ error: null }),
        maybeSingle: () => {
          state.reads.push({ table, filters })
          return Promise.resolve(fake.error ? { data: null, error: fake.error } : { data: fake.single ?? null, error: null })
        },
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          if (isRead) state.reads.push({ table, filters })
          return Promise.resolve(isRead ? resolveRows() : { error: null }).then(resolve, reject)
        },
      }
      return builder
    },
    // 달성한 미션은 완료 RPC가 완료 기록 id를 돌려준다 — 이 시험의 관심은 «달성으로 판정되는가»이므로 항상 completed로 답한다
    rpc: async (_fn: string, args: { p_mission_id: string }) => ({
      data: { ok: true, status: 'completed', completion_id: `completion-${args.p_mission_id}` },
      error: null,
    }),
  }),
}))

vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => undefined) }))
vi.mock('@/lib/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/notifications')>()
  return { ...actual, createNotification: vi.fn(async () => undefined) }
})
vi.mock('@/lib/missions/rewards', () => ({
  grantMissionRewards: vi.fn(async () => ({
    awardedBadgeIds: [],
    awardedBadgeNames: [],
    totalAwardedPoints: 0,
    pendingItemBadgeIds: [],
    pendingLockedBadgeIds: [],
  })),
}))
vi.mock('@/lib/jam/serviceActivity', () => ({ awardServiceJam: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/lib/strava/activity-history', () => ({
  getSignupAnchorDate: vi.fn(async () => null),
  getActivityHistory: vi.fn(async () => []),
  mergeActivityHistory: vi.fn(() => []),
}))

import { checkMissions } from './checker'

const USER = 'user-1'
const OTHER_USER = 'user-2'
const POI_A = 'poi-a'
const POI_B = 'poi-b'
const BADGE_A = 'badge-a'
const BADGE_B = 'badge-b'

const checkinMission = { id: 'm-checkin', title: '체크인 미션', mission_type: 'checkin', condition_json: { poi_id: POI_A } }
const itemMission = { id: 'm-item', title: '수집 미션', mission_type: 'item_collect', condition_json: { badge_id: BADGE_A } }
const distanceMission = { id: 'm-distance', title: '거리 미션', mission_type: 'distance', condition_json: { distance_km: 1000 } }

function setup(opts: {
  missions: Row[]
  joined: string[]
  earns?: Row[]
  earnsError?: { message: string }
  activityBadges?: Row[]
  inventoryItems?: Row[]
}) {
  state.tables = {
    missions: {
      rows: opts.missions.map((m) => ({
        max_completions: null,
        starts_at: '2026-01-01T00:00:00Z',
        ends_at: null,
        ...m,
      })),
    },
    user_mission_completions: { rows: [] },
    user_mission_participations: {
      rows: opts.joined.map((id) => ({ user_id: USER, mission_id: id, joined_at: '2026-01-01T00:00:00Z' })),
    },
    user_activity_badges: { rows: opts.activityBadges ?? [] },
    inventory: { single: opts.inventoryItems ? { inventory_items: opts.inventoryItems } : null },
    user_checkin_badge_earns: { rows: opts.earns ?? [], error: opts.earnsError },
  }
  state.reads = []
}

const earnsReads = (): CallLog[] => state.reads.filter((r) => r.table === 'user_checkin_badge_earns')

describe('checkMissions — 체크인 배지 이력으로 checkin·item_collect 판정', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('체크인 배지 이력에만 대상 지점이 있으면 checkin 미션이 달성된다', async () => {
    setup({
      missions: [checkinMission],
      joined: [checkinMission.id],
      earns: [{ user_id: USER, badge_id: BADGE_A, poi_id: POI_A }],
    })
    const result = await checkMissions(USER, [])
    expect(result.completedMissionIds).toEqual([checkinMission.id])
  })

  it('체크인 배지 이력에만 대상 배지가 있으면 item_collect 미션이 달성된다', async () => {
    setup({
      missions: [itemMission],
      joined: [itemMission.id],
      earns: [{ user_id: USER, badge_id: BADGE_A, poi_id: POI_A }],
    })
    const result = await checkMissions(USER, [])
    expect(result.completedMissionIds).toEqual([itemMission.id])
  })

  it('대상이 아닌 지점·배지의 이력, 다른 사용자의 이력은 달성으로 치지 않는다', async () => {
    setup({
      missions: [checkinMission, itemMission],
      joined: [checkinMission.id, itemMission.id],
      earns: [
        { user_id: USER, badge_id: BADGE_B, poi_id: POI_B },
        { user_id: OTHER_USER, badge_id: BADGE_A, poi_id: POI_A },
      ],
    })
    const result = await checkMissions(USER, [])
    expect(result.completedMissionIds).toEqual([])
  })

  it('레거시 triggered_by_poi_id만 있는 경우 checkin 미션이 그대로 달성된다', async () => {
    setup({
      missions: [checkinMission],
      joined: [checkinMission.id],
      activityBadges: [{ user_id: USER, badge_id: BADGE_B, triggered_by_poi_id: POI_A }],
    })
    const result = await checkMissions(USER, [])
    expect(result.completedMissionIds).toEqual([checkinMission.id])
  })

  it('활동 배지 보유·인벤토리 보유로 item_collect 미션이 그대로 달성된다', async () => {
    setup({
      missions: [itemMission],
      joined: [itemMission.id],
      activityBadges: [{ user_id: USER, badge_id: BADGE_A, triggered_by_poi_id: null }],
    })
    expect((await checkMissions(USER, [])).completedMissionIds).toEqual([itemMission.id])

    setup({
      missions: [itemMission],
      joined: [itemMission.id],
      inventoryItems: [{ badge_id: BADGE_A }],
    })
    expect((await checkMissions(USER, [])).completedMissionIds).toEqual([itemMission.id])
  })

  it('checkin·item_collect 미션에 참가하지 않았으면 체크인 배지 이력을 조회하지 않는다', async () => {
    setup({
      missions: [checkinMission, itemMission, distanceMission],
      joined: [distanceMission.id],
      earns: [{ user_id: USER, badge_id: BADGE_A, poi_id: POI_A }],
    })
    const result = await checkMissions(USER, [])
    expect(result.completedMissionIds).toEqual([])
    expect(earnsReads()).toEqual([])
  })

  it('대상 id로 좁혀 조회한다 — checkin은 poi_id, item_collect는 badge_id', async () => {
    setup({
      missions: [checkinMission],
      joined: [checkinMission.id],
      earns: [{ user_id: USER, badge_id: BADGE_A, poi_id: POI_A }],
    })
    await checkMissions(USER, [])
    expect(earnsReads()).toEqual([
      {
        table: 'user_checkin_badge_earns',
        filters: [
          { op: 'eq', column: 'user_id', value: USER },
          { op: 'in', column: 'poi_id', value: [POI_A] },
        ],
      },
    ])

    setup({
      missions: [itemMission],
      joined: [itemMission.id],
      earns: [{ user_id: USER, badge_id: BADGE_A, poi_id: POI_A }],
    })
    await checkMissions(USER, [])
    expect(earnsReads()).toEqual([
      {
        table: 'user_checkin_badge_earns',
        filters: [
          { op: 'eq', column: 'user_id', value: USER },
          { op: 'in', column: 'badge_id', value: [BADGE_A] },
        ],
      },
    ])
  })

  it('체크인 배지 이력 조회가 오류를 내면 예외 없이 끝나고 미션은 미달성이다', async () => {
    setup({
      missions: [checkinMission, itemMission],
      joined: [checkinMission.id, itemMission.id],
      earns: [{ user_id: USER, badge_id: BADGE_A, poi_id: POI_A }],
      earnsError: { message: 'boom' },
    })
    const result = await checkMissions(USER, [])
    expect(result.completedMissionIds).toEqual([])
    expect(console.error).toHaveBeenCalled()
  })
})
