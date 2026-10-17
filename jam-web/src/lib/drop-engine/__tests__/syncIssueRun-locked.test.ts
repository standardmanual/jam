/**
 * 동기화 발급의 잠김 배정 — 지급·보류·발급 기록이 같은 값을 저장한다 (티켓 20261018_0051 1회, 운영 로직 7.5절)
 *
 * 고정하는 것:
 * - 잠김으로 만든 배지(`always_locked`)는 늘 잠기고(`badge_locked`), 필요한 양은 배지 값이다. 값이 없으면 등급 최소값이다.
 * - 그 밖의 배지는 설정 확률(`locked_roll_probability`)로 잠김(`rolled`)을 정한다. 경계: 확률 0은 절대, 1은 늘.
 * - 지급은 `grant_inventory_item_locked`(p_ 인자)로 한다. 옛 `grant_inventory_item`은 부르지 않는다(가짜 DB가 거절한다).
 * - 보류는 `locked`·`lock_reason`·`unlock_required`를 함께 저장하고, 발급 기록 `item_issue_log.locked`는 지급에 쓴 값과 같다.
 * - 잠긴 채 받은 개체는 포인트를 주지 않는다. 열린 개체는 옛 규칙대로 준다.
 *
 * 실제 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/drop-engine/__tests__/syncIssueRun-locked.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/points', () => ({ awardPoints: vi.fn(async () => null) }))
vi.mock('@/lib/notifications/recap', () => ({ recordActivityRecap: vi.fn(async () => {}) }))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: vi.fn(async () => {}) }))

import { issueSyncItemBadges, type SyncIssueTarget } from '@/lib/drop-engine/syncIssueRun'
import { DEFAULT_JAM_POLICY } from '@/lib/jam/policy'
import { awardPoints } from '@/lib/points'
import { recordFeedEvent } from '@/lib/activity-feed'
import { recordActivityRecap } from '@/lib/notifications/recap'

const USER_ID = 'user-1'
const TRIBE = 'tribe-mine'
const NOW = new Date('2026-10-18T00:00:00Z')

interface Badge {
  id: string
  name?: string
  rarity: 'common' | 'rare' | 'epic' | 'mystic'
  point_reward?: number | null
  always_locked?: boolean
  unlock_required?: number | null
}

interface World {
  inventory: { id: string; used_slots: number; max_slots: number }
  badges: Badge[]
  pendingRows: Record<string, unknown>[]
  rpcCalls: { name: string; args: Record<string, unknown> }[]
  logRows: Record<string, unknown>[]
}

function makeWorld(overrides: Partial<World> = {}): World {
  return {
    inventory: { id: 'inv-1', used_slots: 0, max_slots: 100 },
    badges: [{ id: 'b-common', rarity: 'common' }],
    pendingRows: [],
    rpcCalls: [],
    logRows: [],
    ...overrides,
  }
}

function makeFakeSupabase(world: World): SupabaseClient {
  let grants = 0
  const from = (table: string) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      in: () => builder,
      order: () => builder,
      range: async () => {
        if (table !== 'badges') return { data: [], error: null }
        return {
          data: world.badges.map((b) => ({
            id: b.id,
            name: b.name ?? `배지 ${b.id}`,
            image_url: null,
            rarity: b.rarity,
            item_book_id: 'book-mine',
            drop_excluded: false,
            valid_from: null,
            valid_until: null,
            deleted_at: null,
            point_reward: b.point_reward ?? null,
            always_locked: b.always_locked ?? false,
            unlock_required: b.unlock_required ?? null,
          })),
          error: null,
        }
      },
      maybeSingle: async () => {
        if (table === 'users') return { data: { tribe_id: TRIBE }, error: null }
        if (table === 'inventory') return { data: world.inventory, error: null }
        if (table === 'user_drop_state') return { data: { common_streak: 0 }, error: null }
        if (table === 'tribes') return { data: { name: '내 트라이브' }, error: null }
        if (table === 'inventory_items') return { data: { serial_number: 1 }, error: null }
        return { data: null, error: null }
      },
      upsert: async () => ({ error: null }),
      insert: async (payload: Record<string, unknown> | Record<string, unknown>[]) => {
        if (table === 'sync_pending_items') world.pendingRows.push(...(Array.isArray(payload) ? payload : [payload]))
        if (table === 'item_issue_log' && !Array.isArray(payload)) world.logRows.push(payload)
        return { error: null }
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        const data =
          table === 'item_books'
            ? [{ id: 'book-mine', tribe_id: TRIBE, is_active: true, drop_excluded: false, valid_from: null, valid_until: null }]
            : []
        return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected)
      },
    }
    return builder
  }

  const rpc = async (name: string, args: Record<string, unknown>) => {
    // 옛 지급 함수를 직접 부르면 잠김이 저장되지 않는다 — 가짜 DB가 거절해 시험이 실패하게 한다
    if (name !== 'grant_inventory_item_locked') return { data: null, error: { message: `알 수 없는 rpc ${name}` } }
    grants += 1
    world.rpcCalls.push({ name, args })
    world.inventory.used_slots += 1
    return { data: { ok: true, itemId: `item-${grants}`, usedSlots: world.inventory.used_slots }, error: null }
  }

  return { from, rpc } as unknown as SupabaseClient
}

/** 활동마다 확정 1개, 보너스 없음, 등급은 `rarity` 100% */
function policyWith(rarity: Badge['rarity'] = 'common', overrides: Partial<typeof DEFAULT_JAM_POLICY> = {}) {
  return {
    ...DEFAULT_JAM_POLICY,
    sync_item_guaranteed: 1,
    sync_item_guaranteed_hiking: 1,
    sync_item_bonus_rolls: 0,
    sync_rarity_common: rarity === 'common' ? 100 : 0,
    sync_rarity_rare: rarity === 'rare' ? 100 : 0,
    sync_rarity_epic: rarity === 'epic' ? 100 : 0,
    sync_rarity_mystic: rarity === 'mystic' ? 100 : 0,
    ...overrides,
  }
}

function target(n: number): SyncIssueTarget {
  return {
    stravaId: n,
    activityId: `act-${n}`,
    startDate: `2026-10-${String(10 + n).padStart(2, '0')}T00:00:00Z`,
    jam: 90,
    isHiking: false,
  }
}

const run = (world: World, targets: SyncIssueTarget[], policy: ReturnType<typeof policyWith>, rand: () => number) =>
  issueSyncItemBadges(makeFakeSupabase(world), USER_ID, policy, targets, { rand, now: NOW })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('바로 지급 — 잠김을 개체에 저장한다', () => {
  it('잠김으로 만든 배지는 확률이 0이어도 잠긴 채 지급하고 필요한 양은 배지 값이다', async () => {
    const world = makeWorld({ badges: [{ id: 'b-locked', rarity: 'rare', always_locked: true, unlock_required: 90 }] })

    await run(world, [target(1)], policyWith('rare', { locked_roll_probability: 0 }), () => 0.99)

    expect(world.rpcCalls).toEqual([
      {
        name: 'grant_inventory_item_locked',
        args: {
          p_inventory_id: 'inv-1',
          p_badge_id: 'b-locked',
          p_obtained_by: 'drop',
          p_expires_at: null,
          p_locked: true,
          p_lock_reason: 'badge_locked',
          p_unlock_required: 90,
        },
      },
    ])
  })

  it('잠김으로 만든 배지에 필요한 양이 없으면 등급 최소값을 쓴다', async () => {
    for (const [rarity, min] of [['common', 30], ['rare', 60], ['epic', 120], ['mystic', 240]] as const) {
      const world = makeWorld({ badges: [{ id: `b-${rarity}`, rarity, always_locked: true }] })
      await run(world, [target(1)], policyWith(rarity), () => 0.99)
      expect(world.rpcCalls[0].args).toMatchObject({ p_locked: true, p_lock_reason: 'badge_locked', p_unlock_required: min })
    }
  })

  it('열린 배지는 난수가 확률보다 작으면 잠긴 채(rolled) 지급한다', async () => {
    const world = makeWorld({ badges: [{ id: 'b-epic', rarity: 'epic' }] })

    await run(world, [target(1)], policyWith('epic'), () => 0.1)

    expect(world.rpcCalls[0].args).toMatchObject({ p_locked: true, p_lock_reason: 'rolled', p_unlock_required: 120 })
  })

  it('열린 배지는 난수가 확률 이상이면 열린 채 지급한다 (뒷 인자는 비워 보낸다)', async () => {
    const world = makeWorld()

    await run(world, [target(1)], policyWith(), () => 0.25)

    expect(world.rpcCalls[0].args).toMatchObject({ p_locked: false, p_lock_reason: null, p_unlock_required: null })
  })

  it('확률 0%는 절대 잠그지 않고 100%는 늘 잠근다', async () => {
    const zero = makeWorld()
    await run(zero, [target(1), target(2)], policyWith('common', { locked_roll_probability: 0 }), () => 0)
    expect(zero.rpcCalls.map((c) => c.args.p_locked)).toEqual([false, false])

    const one = makeWorld()
    await run(one, [target(1), target(2)], policyWith('common', { locked_roll_probability: 1 }), () => 0.999999)
    expect(one.rpcCalls.map((c) => c.args.p_locked)).toEqual([true, true])
  })

  it('발급 기록의 locked는 지급에 쓴 값과 같다', async () => {
    const world = makeWorld({
      badges: [
        { id: 'b-open', rarity: 'common' },
        { id: 'b-locked', rarity: 'common', always_locked: true },
      ],
    })
    // 후보 선정은 균등 무작위라 난수를 고정하기 어렵다 — 정책 확률 0으로 두고 always_locked 여부만 지급·기록이 같은지 본다
    await run(world, [target(1), target(2), target(3), target(4), target(5), target(6)], policyWith('common', { locked_roll_probability: 0 }), (() => {
      let i = 0
      return () => (i++ % 7) / 7
    })())

    expect(world.rpcCalls.length).toBe(6)
    expect(world.logRows.map((r) => r.locked)).toEqual(world.rpcCalls.map((c) => c.args.p_locked))
    for (const [i, call] of world.rpcCalls.entries()) {
      expect(call.args.p_locked).toBe(call.args.p_badge_id === 'b-locked')
      expect(world.logRows[i].badge_id).toBe(call.args.p_badge_id)
    }
  })
})

describe('보류 — 잠김을 함께 저장한다', () => {
  it('보류 행에 locked·lock_reason·unlock_required가 들어간다 (잠긴 것과 열린 것)', async () => {
    const world = makeWorld({
      inventory: { id: 'inv-1', used_slots: 10, max_slots: 10 },
      badges: [{ id: 'b-locked', rarity: 'rare', always_locked: true, unlock_required: 100 }],
    })

    const outcome = await run(world, [target(1)], policyWith('rare'), () => 0.9)
    expect(outcome.pendingCount).toBe(1)
    expect(world.pendingRows).toEqual([
      {
        user_id: USER_ID,
        source_activity_id: 'act-1',
        badge_id: 'b-locked',
        rarity: 'rare',
        rolled_rarity: 'rare',
        locked: true,
        lock_reason: 'badge_locked',
        unlock_required: 100,
      },
    ])
    expect(world.rpcCalls).toEqual([])
    expect(world.logRows).toEqual([])
  })

  it('확률로 잠기면 rolled와 등급 최소값을 저장한다', async () => {
    const world = makeWorld({ inventory: { id: 'inv-1', used_slots: 10, max_slots: 10 }, badges: [{ id: 'b-mystic', rarity: 'mystic' }] })

    await run(world, [target(1)], policyWith('mystic'), () => 0)

    expect(world.pendingRows[0]).toMatchObject({ locked: true, lock_reason: 'rolled', unlock_required: 240 })
  })

  it('열린 것은 locked false와 빈 까닭·필요한 양을 저장한다', async () => {
    const world = makeWorld({ inventory: { id: 'inv-1', used_slots: 10, max_slots: 10 } })

    await run(world, [target(1)], policyWith(), () => 0.9)

    expect(world.pendingRows[0]).toMatchObject({ locked: false, lock_reason: null, unlock_required: null })
  })
})

describe('피드·결산 알림 가림 (운영 로직 7.3절)', () => {
  it('잠긴 채 받은 개체는 활동 피드에 올리지 않고 결산에 이름·배지·등급 없이 담는다', async () => {
    const world = makeWorld({ badges: [{ id: 'b-locked', name: '비밀 배지', rarity: 'rare', always_locked: true }] })

    await run(world, [target(1)], policyWith('rare', { locked_roll_probability: 0 }), () => 0.9)

    expect(recordFeedEvent).not.toHaveBeenCalled()
    expect(recordActivityRecap).toHaveBeenCalledTimes(1)
    const fragment = vi.mocked(recordActivityRecap).mock.calls[0][1] as { item_badges: Record<string, unknown>[] }
    expect(fragment.item_badges).toHaveLength(1)
    expect(fragment.item_badges[0]).toMatchObject({ badge_id: '', name: '', rarity: null, locked: true })
    expect(JSON.stringify(fragment)).not.toContain('비밀 배지')
  })

  it('열린 채 받은 개체는 기존처럼 피드와 결산에 이름을 싣는다', async () => {
    const world = makeWorld({ badges: [{ id: 'b-open', name: '열린 배지', rarity: 'common' }] })

    await run(world, [target(1)], policyWith('common', { locked_roll_probability: 0 }), () => 0.9)

    expect(recordFeedEvent).toHaveBeenCalledTimes(1)
    const fragment = vi.mocked(recordActivityRecap).mock.calls[0][1] as { item_badges: Record<string, unknown>[] }
    expect(fragment.item_badges[0]).toMatchObject({ badge_id: 'b-open', name: '열린 배지', rarity: 'common' })
    expect(fragment.item_badges[0]).not.toHaveProperty('locked')
  })
})

describe('포인트', () => {
  it('잠긴 채 받은 개체는 포인트를 주지 않는다', async () => {
    const world = makeWorld({ badges: [{ id: 'b-locked', rarity: 'common', point_reward: 5, always_locked: true }] })

    await run(world, [target(1)], policyWith(), () => 0.9)

    expect(awardPoints).not.toHaveBeenCalled()
  })

  it('열린 채 받은 개체는 옛 규칙대로 포인트를 준다', async () => {
    const world = makeWorld({ badges: [{ id: 'b-open', rarity: 'common', point_reward: 5 }] })

    await run(world, [target(1)], policyWith('common', { locked_roll_probability: 0 }), () => 0.9)

    expect(awardPoints).toHaveBeenCalledWith(USER_ID, 5, 'badge_point_reward', { sourceBadgeId: 'b-open' })
  })
})
