/**
 * 미션 보상 지급 — 아이템 배지 보상 시험 (티켓 20261019_1313, 마이그레이션 250, 운영 로직 13.2절·6.4절)
 *
 * 검증 대상:
 *  - 아이템 배지는 `mission_grant_item_rewards` 한 번으로 준다. 이미 가진 배지도 그대로 넘기고(앱이 먼저 건너뛰지 않는다) 옛 `grant_inventory_item`은 부르지 않는다
 *  - `granted`면 열린 개체의 배지 포인트를 한 번 주고(`sourceMissionId` 포함) 받은 배지로 올린다. 잠긴 개체는 포인트·이름 없이 올리지 않는다. 이미 포인트를 준 개체는 다시 주지 않는다
 *  - `pending`이면 아무것도 주지 않고 `pendingItemBadgeIds`로 돌려준다(잠긴 배지는 `pendingLockedBadgeIds`에도). `none`이면 아무것도 하지 않는다
 *  - 숨김 배지와 체크인 배지는 지급하지 않고 경고를 남긴다
 *  - RPC 오류·계약 밖 응답·`inventory_not_found`는 던지지 않고 기록한 뒤 나머지 보상을 이어 준다
 *  - 활동 배지는 지금처럼 `user_activity_badges`에 넣고 이미 가졌으면 건너뛴다
 *
 * 위치: `__tests__/`는 vitest에서 제외돼 있어(node assert 시험 전용) 모킹이 필요한 이 파일은 옆에 둔다.
 * 실행: cd jam-web && npx vitest run src/lib/missions/rewards-item.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const USER = 'user-1'
const MISSION = 'mission-1'

interface BadgeFixture {
  id: string
  name: string
  type: 'activity' | 'item' | 'checkin'
  point_reward: number
  is_hidden: boolean
  always_locked: boolean
}

const state = vi.hoisted(() => ({
  badges: [] as Record<string, unknown>[],
  ownedActivity: [] as { badge_id: string }[],
  items: [] as Record<string, unknown>[],
  rpcResult: { data: null, error: null } as { data: unknown; error: unknown },
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
  activityInserts: [] as Record<string, unknown>[],
  itemUpdates: [] as { values: Record<string, unknown>; id: unknown }[],
}))

const awardPointsMock = vi.hoisted(() => vi.fn(async () => ({ id: 'tx' })))
const logEngineMock = vi.hoisted(() => vi.fn(async () => {}))
const slotAlertMock = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      let inIds: string[] = []
      let updateValues: Record<string, unknown> | null = null
      let insertValues: Record<string, unknown> | null = null
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.is = () => builder
      builder.in = (_col: string, ids: string[]) => {
        inIds = ids
        return builder
      }
      builder.eq = (_col: string, value: unknown) => {
        if (updateValues) state.itemUpdates.push({ values: updateValues, id: value })
        return builder
      }
      builder.update = (values: Record<string, unknown>) => {
        updateValues = values
        return builder
      }
      builder.insert = (values: Record<string, unknown>) => {
        insertValues = values
        if (table === 'user_activity_badges') state.activityInserts.push(values)
        return builder
      }
      builder.then = (resolve: (v: unknown) => unknown) => {
        if (insertValues || updateValues) return resolve({ error: null })
        const data =
          table === 'badges'
            ? state.badges.filter((b) => inIds.includes(b.id as string))
            : table === 'user_activity_badges'
              ? state.ownedActivity
              : table === 'inventory_items'
                ? state.items.filter((i) => inIds.includes(i.id as string))
                : []
        return resolve({ data, error: null })
      }
      return builder
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args })
      return state.rpcResult
    },
  }),
}))

vi.mock('@/lib/points', () => ({ awardPoints: awardPointsMock }))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: logEngineMock }))
vi.mock('@/lib/inventory/slotAlert', () => ({ notifyInventorySlotsLow: slotAlertMock }))

import { grantMissionRewards } from '@/lib/missions/rewards'

function badge(id: string, overrides: Partial<BadgeFixture> = {}): BadgeFixture {
  return { id, name: `배지 ${id}`, type: 'item', point_reward: 0, is_hidden: false, always_locked: false, ...overrides }
}

function setBadges(...badges: BadgeFixture[]) {
  state.badges = badges as unknown as Record<string, unknown>[]
}

function mission(badgeIds: string[], rewardPoints = 0) {
  return { id: MISSION, reward_badge_ids: badgeIds, reward_points: rewardPoints }
}

function rpcReturns(data: unknown) {
  state.rpcResult = { data, error: null }
}

let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  state.badges = []
  state.ownedActivity = []
  state.items = []
  state.rpcResult = { data: null, error: null }
  state.rpcCalls = []
  state.activityInserts = []
  state.itemUpdates = []
  awardPointsMock.mockClear()
  logEngineMock.mockClear()
  slotAlertMock.mockClear()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('grantMissionRewards — 아이템 배지 지급', () => {
  it('아이템 배지를 RPC 한 번으로 주고 옛 grant_inventory_item은 부르지 않는다', async () => {
    setBadges(badge('item-1'), badge('item-2'))
    rpcReturns({ ok: true, status: 'granted', itemIds: ['ii-1', 'ii-2'], pendingCount: 0 })
    state.items = [
      { id: 'ii-1', badge_id: 'item-1', locked: false, point_awarded_at: null },
      { id: 'ii-2', badge_id: 'item-2', locked: false, point_awarded_at: null },
    ]

    const result = await grantMissionRewards(USER, mission(['item-1', 'item-2']))

    expect(state.rpcCalls).toEqual([
      { fn: 'mission_grant_item_rewards', args: { p_user_id: USER, p_mission_id: MISSION, p_badge_ids: ['item-1', 'item-2'] } },
    ])
    expect(result.awardedBadgeIds).toEqual(['item-1', 'item-2'])
    expect(result.awardedBadgeNames).toEqual(['배지 item-1', '배지 item-2'])
    expect(result.pendingItemBadgeIds).toEqual([])
    expect(slotAlertMock).toHaveBeenCalledTimes(1)
  })

  it('이미 가진 아이템 배지도 건너뛰지 않고 그대로 RPC에 넘긴다', async () => {
    // 앱은 보유 여부를 보지 않는다 — 인벤토리에 같은 배지가 있어도 새 개체로 준다(DB 함수 몫)
    setBadges(badge('item-owned'))
    state.items = [{ id: 'ii-new', badge_id: 'item-owned', locked: false, point_awarded_at: null }]
    rpcReturns({ ok: true, status: 'granted', itemIds: ['ii-new'], pendingCount: 0 })

    const result = await grantMissionRewards(USER, mission(['item-owned']))

    expect(state.rpcCalls).toHaveLength(1)
    expect(state.rpcCalls[0].args.p_badge_ids).toEqual(['item-owned'])
    expect(result.awardedBadgeIds).toEqual(['item-owned'])
  })

  it('열린 개체는 배지 포인트를 한 번 주고 미션 귀속과 지급 표시를 남긴다', async () => {
    setBadges(badge('item-1', { point_reward: 30 }))
    state.items = [{ id: 'ii-1', badge_id: 'item-1', locked: false, point_awarded_at: null }]
    rpcReturns({ ok: true, status: 'granted', itemIds: ['ii-1'], pendingCount: 0 })

    const result = await grantMissionRewards(USER, mission(['item-1'], 100))

    expect(awardPointsMock).toHaveBeenCalledWith(USER, 30, 'badge_point_reward', { sourceBadgeId: 'item-1', sourceMissionId: MISSION })
    expect(awardPointsMock).toHaveBeenCalledWith(USER, 100, 'mission_point_reward', { sourceMissionId: MISSION })
    expect(result.totalAwardedPoints).toBe(130)
    expect(state.itemUpdates).toHaveLength(1)
    expect(state.itemUpdates[0].id).toBe('ii-1')
    expect(state.itemUpdates[0].values.point_awarded_at).toEqual(expect.any(String))
  })

  it('잠긴 개체는 포인트를 주지 않고 받은 배지로도 올리지 않는다', async () => {
    setBadges(badge('item-locked', { point_reward: 50, always_locked: true }))
    state.items = [{ id: 'ii-1', badge_id: 'item-locked', locked: true, point_awarded_at: null }]
    rpcReturns({ ok: true, status: 'granted', itemIds: ['ii-1'], pendingCount: 0 })

    const result = await grantMissionRewards(USER, mission(['item-locked']))

    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(state.itemUpdates).toEqual([])
    expect(result.awardedBadgeIds).toEqual([])
    expect(result.awardedBadgeNames).toEqual([])
    expect(result.totalAwardedPoints).toBe(0)
    // 개체는 인벤토리에 들어갔으니 남은 칸 알림은 검사한다
    expect(slotAlertMock).toHaveBeenCalledTimes(1)
  })

  it('이미 포인트를 준 개체(point_awarded_at 있음)에는 다시 주지 않는다', async () => {
    setBadges(badge('item-1', { point_reward: 30 }))
    state.items = [{ id: 'ii-1', badge_id: 'item-1', locked: false, point_awarded_at: '2026-10-19T00:00:00Z' }]
    rpcReturns({ ok: true, status: 'granted', itemIds: ['ii-1'], pendingCount: 0 })

    const result = await grantMissionRewards(USER, mission(['item-1']))

    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(result.totalAwardedPoints).toBe(0)
    expect(result.awardedBadgeIds).toEqual(['item-1'])
  })

  it('포인트 지급이 실패하면(awardPoints가 null) 지급 표시를 남기지 않는다', async () => {
    setBadges(badge('item-1', { point_reward: 30 }))
    state.items = [{ id: 'ii-1', badge_id: 'item-1', locked: false, point_awarded_at: null }]
    rpcReturns({ ok: true, status: 'granted', itemIds: ['ii-1'], pendingCount: 0 })
    awardPointsMock.mockResolvedValueOnce(null as unknown as { id: string })

    const result = await grantMissionRewards(USER, mission(['item-1']))

    expect(result.totalAwardedPoints).toBe(0)
    expect(state.itemUpdates).toEqual([])
  })
})

describe('grantMissionRewards — 가득 참 보류', () => {
  it('pending이면 아무것도 주지 않고 받지 않은 보상 배지 id로 돌려준다', async () => {
    setBadges(badge('item-1', { point_reward: 30 }), badge('item-2', { always_locked: true }))
    rpcReturns({ ok: true, status: 'pending', itemIds: [], pendingCount: 2, free: 1, needed: 2 })

    const result = await grantMissionRewards(USER, mission(['item-1', 'item-2'], 100))

    expect(result.pendingItemBadgeIds).toEqual(['item-1', 'item-2'])
    expect(result.pendingLockedBadgeIds).toEqual(['item-2'])
    expect(result.awardedBadgeIds).toEqual([])
    // 배지 포인트는 받을 때 준다. 미션 포인트는 지금 방식 그대로 바로 준다.
    expect(awardPointsMock).toHaveBeenCalledTimes(1)
    expect(awardPointsMock).toHaveBeenCalledWith(USER, 100, 'mission_point_reward', { sourceMissionId: MISSION })
    expect(slotAlertMock).not.toHaveBeenCalled()
  })

  it('none이면 아무것도 하지 않는다(이미 기록된 재호출)', async () => {
    setBadges(badge('item-1', { point_reward: 30 }))
    rpcReturns({ ok: true, status: 'none', itemIds: [], pendingCount: 0 })

    const result = await grantMissionRewards(USER, mission(['item-1']))

    expect(result.awardedBadgeIds).toEqual([])
    expect(result.pendingItemBadgeIds).toEqual([])
    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(slotAlertMock).not.toHaveBeenCalled()
  })
})

describe('grantMissionRewards — 줄 수 없는 배지', () => {
  it('숨김 배지와 체크인 배지는 지급하지 않고 경고를 남긴다', async () => {
    setBadges(
      badge('item-hidden', { is_hidden: true }),
      badge('checkin-1', { type: 'checkin' }),
      badge('activity-hidden', { type: 'activity', is_hidden: true })
    )

    const result = await grantMissionRewards(USER, mission(['item-hidden', 'checkin-1', 'activity-hidden']))

    expect(state.rpcCalls).toEqual([])
    expect(state.activityInserts).toEqual([])
    expect(result.awardedBadgeIds).toEqual([])
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0][0])).toContain('item-hidden')
    expect(String(warnSpy.mock.calls[0][0])).toContain('checkin-1')
    expect(logEngineMock).toHaveBeenCalledWith(
      'badge',
      'reward_badge_skipped',
      USER,
      expect.objectContaining({ hiddenBadgeIds: ['item-hidden', 'activity-hidden'], unsupportedTypeBadgeIds: ['checkin-1'] })
    )
  })

  it('줄 수 없는 배지가 섞여도 나머지 아이템 배지는 준다', async () => {
    setBadges(badge('item-1'), badge('checkin-1', { type: 'checkin' }))
    state.items = [{ id: 'ii-1', badge_id: 'item-1', locked: false, point_awarded_at: null }]
    rpcReturns({ ok: true, status: 'granted', itemIds: ['ii-1'], pendingCount: 0 })

    const result = await grantMissionRewards(USER, mission(['item-1', 'checkin-1']))

    expect(state.rpcCalls[0].args.p_badge_ids).toEqual(['item-1'])
    expect(result.awardedBadgeIds).toEqual(['item-1'])
  })
})

describe('grantMissionRewards — 실패 처리', () => {
  it('RPC 오류는 던지지 않고 기록한 뒤 미션 포인트는 이어 준다', async () => {
    setBadges(badge('item-1'))
    state.rpcResult = { data: null, error: { message: '연결 끊김' } }

    const result = await grantMissionRewards(USER, mission(['item-1'], 100))

    expect(errorSpy).toHaveBeenCalled()
    expect(result.awardedBadgeIds).toEqual([])
    expect(result.pendingItemBadgeIds).toEqual([])
    expect(result.totalAwardedPoints).toBe(100)
  })

  it('계약 밖 응답은 성공으로 보지 않고 기록한다', async () => {
    setBadges(badge('item-1'))
    rpcReturns({ ok: true, status: 'weird', itemIds: [] })

    const result = await grantMissionRewards(USER, mission(['item-1']))

    expect(errorSpy).toHaveBeenCalled()
    expect(result.awardedBadgeIds).toEqual([])
    expect(result.pendingItemBadgeIds).toEqual([])
  })

  it('inventory_not_found는 흔적을 남긴다', async () => {
    setBadges(badge('item-1'))
    rpcReturns({ ok: false, error: 'inventory_not_found' })

    const result = await grantMissionRewards(USER, mission(['item-1']))

    expect(logEngineMock).toHaveBeenCalledWith('drop', 'drop_attempt', USER, expect.objectContaining({ outcome: 'no_inventory', source: 'mission_reward' }))
    expect(result.awardedBadgeIds).toEqual([])
  })
})

describe('grantMissionRewards — 활동 배지', () => {
  it('활동 배지는 user_activity_badges에 넣고 포인트를 주며 이미 가졌으면 건너뛴다', async () => {
    setBadges(badge('act-1', { type: 'activity', point_reward: 20 }), badge('act-owned', { type: 'activity', point_reward: 20 }))
    state.ownedActivity = [{ badge_id: 'act-owned' }]

    const result = await grantMissionRewards(USER, mission(['act-1', 'act-owned']))

    expect(state.rpcCalls).toEqual([])
    expect(state.activityInserts).toEqual([{ user_id: USER, badge_id: 'act-1', triggered_by: `mission_reward:${MISSION}` }])
    expect(result.awardedBadgeIds).toEqual(['act-1'])
    expect(awardPointsMock).toHaveBeenCalledTimes(1)
    expect(awardPointsMock).toHaveBeenCalledWith(USER, 20, 'badge_point_reward', { sourceBadgeId: 'act-1', sourceMissionId: MISSION })
  })
})
