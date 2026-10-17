/**
 * 동기화 아이템 배지 발급 — 계획 → 지급 또는 보류 (티켓 20261017_1425, 운영 로직 6.4절)
 *
 * 고정하는 것:
 * - 이번 동기화의 발급 목록 **전체**가 빈칸(`max_slots - used_slots`) 이하이면 지금처럼 바로 지급하고 보류는 없다(경계: 빈칸과 같음).
 * - 전체가 빈칸보다 많으면(활동 하나는 빈칸 이하여도 합이 넘는 경우 포함) 하나도 지급하지 않고 **전부** 보류한다. 빈칸 0도 같다.
 * - 보류 행은 대상 활동·배지·실제 등급·뽑힌 등급·잠김 false를 담고 상태는 DB 기본값(pending)에 맡긴다. 결산·피드·포인트·발급 기록은 만들지 않는다.
 * - 지급 도중 경합으로 `slot_full`이 나면 그 개체와 남은 개체(뒤 활동 포함)를 보류한다. 이미 준 것은 그대로다.
 * - 후보 없는 개체는 목록에 들어가지 않는다(개수 비교에서 빠진다). 소속 트라이브 없음은 보류도 없다.
 * - `common_streak`는 목록 순서대로 이어 세고, 보류한 개체도 센다.
 * - 보류 저장이 실패하면 던지지 않고 `onActivityError`로 알리며 보류 개수는 0이고 연속 값을 쓰지 않는다.
 *
 * 실제 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/drop-engine/__tests__/syncIssueRun-pending.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/points', () => ({ awardPoints: vi.fn(async () => null) }))
vi.mock('@/lib/notifications/recap', () => ({ recordActivityRecap: vi.fn(async () => {}) }))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: vi.fn(async () => {}) }))

import { issueSyncItemBadges, type SyncIssueTarget } from '@/lib/drop-engine/syncIssueRun'
import { DEFAULT_JAM_POLICY } from '@/lib/jam/policy'
import { recordFeedEvent } from '@/lib/activity-feed'
import { awardPoints } from '@/lib/points'
import { recordActivityRecap } from '@/lib/notifications/recap'

const USER_ID = 'user-1'
const TRIBE = 'tribe-mine'
const NOW = new Date('2026-10-17T00:00:00Z')

interface Badge {
  id: string
  rarity: 'common' | 'rare' | 'epic' | 'mystic'
  point_reward?: number | null
}

interface World {
  inventory: { id: string; used_slots: number; max_slots: number } | null
  tribeId: string | null
  badges: Badge[]
  streak: number | null
  /** n번째(1부터) 지급 호출을 slot_full로 바꾼다 */
  slotFullAt: number | null
  pendingInsert: 'ok' | 'error' | 'throw'
  pendingRows: Record<string, unknown>[]
  rpcCalls: Record<string, unknown>[]
  logRows: Record<string, unknown>[]
  streakUpserts: Record<string, unknown>[]
}

function makeWorld(overrides: Partial<World> = {}): World {
  return {
    inventory: { id: 'inv-1', used_slots: 0, max_slots: 100 },
    tribeId: TRIBE,
    badges: [{ id: 'b-common', rarity: 'common' }],
    streak: 0,
    slotFullAt: null,
    pendingInsert: 'ok',
    pendingRows: [],
    rpcCalls: [],
    logRows: [],
    streakUpserts: [],
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
            name: `배지 ${b.id}`,
            image_url: null,
            rarity: b.rarity,
            item_book_id: 'book-mine',
            drop_excluded: false,
            valid_from: null,
            valid_until: null,
            deleted_at: null,
            point_reward: b.point_reward ?? null,
          })),
          error: null,
        }
      },
      maybeSingle: async () => {
        if (table === 'users') return { data: { tribe_id: world.tribeId }, error: null }
        if (table === 'inventory') return { data: world.inventory, error: null }
        if (table === 'user_drop_state') return { data: world.streak === null ? null : { common_streak: world.streak }, error: null }
        if (table === 'tribes') return { data: { name: '내 트라이브' }, error: null }
        if (table === 'inventory_items') return { data: { serial_number: 1 }, error: null }
        return { data: null, error: null }
      },
      upsert: async (payload: Record<string, unknown>) => {
        if (table === 'user_drop_state') world.streakUpserts.push(payload)
        return { error: null }
      },
      insert: async (payload: Record<string, unknown> | Record<string, unknown>[]) => {
        if (table === 'sync_pending_items') {
          if (world.pendingInsert === 'throw') throw new Error('보류 insert 예외')
          if (world.pendingInsert === 'error') return { error: { message: '보류 insert 오류' } }
          world.pendingRows.push(...(Array.isArray(payload) ? payload : [payload]))
        }
        if (table === 'item_issue_log' && !Array.isArray(payload)) world.logRows.push(payload)
        return { error: null }
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        const data = table === 'item_books' ? [{ id: 'book-mine', tribe_id: TRIBE, is_active: true, drop_excluded: false, valid_from: null, valid_until: null }] : []
        return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected)
      },
    }
    return builder
  }

  const rpc = async (name: string, args: Record<string, unknown>) => {
    if (name !== 'grant_inventory_item_locked') return { data: null, error: { message: `알 수 없는 rpc ${name}` } }
    grants += 1
    world.rpcCalls.push(args)
    const inventory = world.inventory
    if (grants === world.slotFullAt || (inventory && inventory.used_slots >= inventory.max_slots)) {
      return { data: { ok: false, reason: 'slot_full' }, error: null }
    }
    if (inventory) inventory.used_slots += 1
    return { data: { ok: true, itemId: `item-${grants}`, usedSlots: inventory?.used_slots ?? 0 }, error: null }
  }

  return { from, rpc } as unknown as SupabaseClient
}

/** 활동마다 확정 `perActivity`개, 보너스 없음, 등급은 Common 100% */
function policyWith(perActivity = 1, overrides: Partial<typeof DEFAULT_JAM_POLICY> = {}) {
  return {
    ...DEFAULT_JAM_POLICY,
    sync_item_guaranteed: perActivity,
    sync_item_guaranteed_hiking: perActivity,
    sync_item_bonus_rolls: 0,
    sync_rarity_common: 100,
    sync_rarity_rare: 0,
    sync_rarity_epic: 0,
    sync_rarity_mystic: 0,
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

const rand = () => 0.3

const run = (world: World, targets: SyncIssueTarget[], policy = policyWith(), onActivityError?: (t: SyncIssueTarget, e: unknown) => void) =>
  issueSyncItemBadges(makeFakeSupabase(world), USER_ID, policy, targets, { rand, now: NOW, onActivityError })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('전체 개수와 빈칸 비교', () => {
  it('받을 개수가 빈칸과 정확히 같으면 바로 지급하고 보류는 없다', async () => {
    const world = makeWorld({ inventory: { id: 'inv-1', used_slots: 8, max_slots: 10 } })

    const outcome = await run(world, [target(1), target(2)])

    expect(outcome.issuedBadgeIds).toEqual(['b-common', 'b-common'])
    expect(outcome.pendingCount).toBe(0)
    expect(world.rpcCalls).toHaveLength(2)
    expect(world.pendingRows).toEqual([])
  })

  it('받을 개수가 빈칸보다 하나 많으면 하나도 지급하지 않고 전부 보류한다', async () => {
    const world = makeWorld({ inventory: { id: 'inv-1', used_slots: 8, max_slots: 10 } })

    const outcome = await run(world, [target(1), target(2), target(3)])

    expect(outcome).toEqual({ issuedBadgeIds: [], pendingCount: 3 })
    expect(world.rpcCalls).toEqual([])
    expect(world.logRows).toEqual([])
    expect(world.pendingRows).toHaveLength(3)
  })

  it('활동 하나는 빈칸 이하여도 이번 동기화 전체의 합이 넘으면 전부 보류한다', async () => {
    const world = makeWorld({ inventory: { id: 'inv-1', used_slots: 9, max_slots: 10 } })

    // 활동마다 1개 → 활동 단위로는 모두 빈칸(1) 이하지만 합 3개가 빈칸 1개를 넘는다
    const outcome = await run(world, [target(1), target(2), target(3)])

    expect(outcome.pendingCount).toBe(3)
    expect(outcome.issuedBadgeIds).toEqual([])
    expect(world.rpcCalls).toEqual([])
  })

  it('빈칸이 0이면 받을 것이 전부 보류된다', async () => {
    const world = makeWorld({ inventory: { id: 'inv-1', used_slots: 10, max_slots: 10 } })

    const outcome = await run(world, [target(1)])

    expect(outcome).toEqual({ issuedBadgeIds: [], pendingCount: 1 })
    expect(world.rpcCalls).toEqual([])
  })

  it('사용 칸이 한도를 넘어도(빈칸은 0으로 본다) 전부 보류한다', async () => {
    const world = makeWorld({ inventory: { id: 'inv-1', used_slots: 12, max_slots: 10 } })

    await expect(run(world, [target(1)])).resolves.toEqual({ issuedBadgeIds: [], pendingCount: 1 })
  })
})

describe('보류 행', () => {
  it('대상 활동·배지·실제 등급·뽑힌 등급·잠김 false를 담고 상태는 기본값에 맡긴다', async () => {
    const world = makeWorld({
      inventory: { id: 'inv-1', used_slots: 10, max_slots: 10 },
      badges: [{ id: 'b-rare', rarity: 'rare' }],
    })

    // Mystic을 뽑았지만 Mystic·Epic 후보가 없어 Rare로 내려간다
    await run(world, [target(1), target(2)], policyWith(1, { sync_rarity_common: 0, sync_rarity_mystic: 100 }))

    expect(world.pendingRows).toEqual([
      {
        user_id: USER_ID,
        source_activity_id: 'act-1',
        badge_id: 'b-rare',
        rarity: 'rare',
        rolled_rarity: 'mystic',
        locked: false,
        lock_reason: null,
        unlock_required: null,
      },
      {
        user_id: USER_ID,
        source_activity_id: 'act-2',
        badge_id: 'b-rare',
        rarity: 'rare',
        rolled_rarity: 'mystic',
        locked: false,
        lock_reason: null,
        unlock_required: null,
      },
    ])
    expect(world.pendingRows[0]).not.toHaveProperty('status')
  })

  it('활동은 오래된 순서로 보류된다 — 입력 순서와 무관하다', async () => {
    const world = makeWorld({ inventory: { id: 'inv-1', used_slots: 10, max_slots: 10 } })

    await run(world, [target(3), target(1), target(2)])

    expect(world.pendingRows.map((r) => r.source_activity_id)).toEqual(['act-1', 'act-2', 'act-3'])
  })

  it('보류한 개체는 포인트·피드·결산·발급 기록을 만들지 않는다(받을 때 정해진다)', async () => {
    const world = makeWorld({
      inventory: { id: 'inv-1', used_slots: 10, max_slots: 10 },
      badges: [{ id: 'b-common', rarity: 'common', point_reward: 5 }],
    })

    await run(world, [target(1)])

    expect(awardPoints).not.toHaveBeenCalled()
    expect(recordFeedEvent).not.toHaveBeenCalled()
    expect(recordActivityRecap).not.toHaveBeenCalled()
    expect(world.logRows).toEqual([])
  })
})

describe('지급 도중 경합', () => {
  it('중간에 slot_full이 나면 그 개체와 남은 개체를 보류하고 이미 준 것은 그대로 둔다', async () => {
    // 활동 2건 × 2개. 세 번째 지급이 경합으로 slot_full
    const world = makeWorld({ slotFullAt: 3 })

    const outcome = await run(world, [target(1), target(2)], policyWith(2))

    expect(outcome.issuedBadgeIds).toHaveLength(2)
    expect(outcome.pendingCount).toBe(2)
    expect(world.rpcCalls).toHaveLength(3)
    expect(world.logRows.map((r) => r.source_activity_id)).toEqual(['act-1', 'act-1'])
    expect(world.pendingRows.map((r) => r.source_activity_id)).toEqual(['act-2', 'act-2'])
  })

  it('활동 한가운데에서 slot_full이 나면 그 활동의 남은 개체와 뒤 활동을 보류한다', async () => {
    const world = makeWorld({ slotFullAt: 2 })

    const outcome = await run(world, [target(1), target(2)], policyWith(2))

    expect(outcome.issuedBadgeIds).toHaveLength(1)
    expect(outcome.pendingCount).toBe(3)
    expect(world.pendingRows.map((r) => r.source_activity_id)).toEqual(['act-1', 'act-2', 'act-2'])
  })

  it('첫 지급부터 slot_full이면 받을 것 전부를 보류한다', async () => {
    const world = makeWorld({ slotFullAt: 1 })

    const outcome = await run(world, [target(1), target(2)])

    expect(outcome).toEqual({ issuedBadgeIds: [], pendingCount: 2 })
  })
})

describe('건너뛰는 경우', () => {
  it('소속 트라이브가 없으면 보류도 없다', async () => {
    const world = makeWorld({ tribeId: null, inventory: { id: 'inv-1', used_slots: 10, max_slots: 10 } })

    await expect(run(world, [target(1)])).resolves.toEqual({ issuedBadgeIds: [], pendingCount: 0 })
    expect(world.pendingRows).toEqual([])
  })

  it('인벤토리가 없으면 보류도 지급도 없다', async () => {
    const world = makeWorld({ inventory: null })

    await expect(run(world, [target(1)])).resolves.toEqual({ issuedBadgeIds: [], pendingCount: 0 })
    expect(world.pendingRows).toEqual([])
  })

  it('모든 등급에 후보가 없는 개체는 목록에 들어가지 않는다 — 가득 차 있어도 보류가 생기지 않는다', async () => {
    const world = makeWorld({ inventory: { id: 'inv-1', used_slots: 10, max_slots: 10 }, badges: [] })

    await expect(run(world, [target(1)])).resolves.toEqual({ issuedBadgeIds: [], pendingCount: 0 })
    expect(world.pendingRows).toEqual([])
    expect(world.streakUpserts).toEqual([])
  })

  it('확정 개수 0 설정이면 보류도 없다', async () => {
    const world = makeWorld({ inventory: { id: 'inv-1', used_slots: 10, max_slots: 10 } })

    await expect(run(world, [target(1)], policyWith(0))).resolves.toEqual({ issuedBadgeIds: [], pendingCount: 0 })
  })
})

describe('common_streak', () => {
  it('전부 보류해도 목록 순서대로 이어 세어 한 번 저장한다', async () => {
    const world = makeWorld({ streak: 2, inventory: { id: 'inv-1', used_slots: 10, max_slots: 10 } })

    await run(world, [target(1), target(2), target(3)])

    expect(world.streakUpserts).toEqual([expect.objectContaining({ user_id: USER_ID, common_streak: 5 })])
  })

  it('일부는 지급하고 나머지는 보류해도 최종 값은 목록 전체를 센 값이다', async () => {
    const world = makeWorld({ streak: 0, slotFullAt: 2 })

    await run(world, [target(1), target(2), target(3)])

    // 지급 1개 뒤 1, 보류 저장 뒤 3
    expect(world.streakUpserts.map((u) => u.common_streak)).toEqual([1, 3])
  })
})

describe('보류 저장 실패', () => {
  it.each(['error', 'throw'] as const)('보류 insert가 %s여도 던지지 않고 onActivityError로 알린다(보류 0, 연속 값 저장 없음)', async (mode) => {
    const world = makeWorld({ inventory: { id: 'inv-1', used_slots: 10, max_slots: 10 }, pendingInsert: mode })
    const onActivityError = vi.fn()

    const outcome = await run(world, [target(1), target(2)], policyWith(), onActivityError)

    expect(outcome).toEqual({ issuedBadgeIds: [], pendingCount: 0 })
    expect(onActivityError).toHaveBeenCalledTimes(1)
    expect(onActivityError).toHaveBeenCalledWith(expect.objectContaining({ stravaId: 1 }), expect.any(Error))
    expect(world.streakUpserts).toEqual([])
  })

  it('onActivityError가 던져도 흐름은 이어진다', async () => {
    const world = makeWorld({ inventory: { id: 'inv-1', used_slots: 10, max_slots: 10 }, pendingInsert: 'error' })

    await expect(
      run(world, [target(1)], policyWith(), () => {
        throw new Error('기록 실패')
      })
    ).resolves.toEqual({ issuedBadgeIds: [], pendingCount: 0 })
  })
})
