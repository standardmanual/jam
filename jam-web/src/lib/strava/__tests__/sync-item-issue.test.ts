/**
 * 동기화 아이템 배지 발급 — 판정 결과를 DB에 잇는 단계 (티켓 20261017_1424 2회, 운영 로직 6.2·6.6절)
 *
 * 고정하는 것:
 * - 소속 트라이브(`users.tribe_id`)가 없으면 아이템 배지만 건너뛴다(지급·기록 없음, 건너뜀 로그).
 * - 대상 활동마다 개수만큼 발급한다(3건 상한 없음). 등산은 별도 확정 개수를 쓴다. 오래된 활동부터 처리한다.
 * - 후보는 소속 트라이브 컬렉션에서만 나온다. 뽑힌 등급에 후보가 없으면 한 등급씩 내려 다시 뽑고(`rolled_rarity` 기록),
 *   모든 등급이 비면 그 개체를 건너뛴다.
 * - `common_streak`는 받은 실제 등급이 Common이면 +1, 아니면 0으로 저장한다(없는 행은 만든다). 못 줬으면 쓰지 않는다.
 * - 줄 때마다 `item_issue_log`에 한 줄(경로 sync, 대상 활동, 배지, 등급, 뽑힌 등급, 잠김 false, 일련번호, 개체 id).
 *   기록 실패는 지급을 막지 않는다.
 * - 이번 동기화로 받을 개수 전체가 빈칸보다 많으면 지급하지 않고 전부 보류한다(보류 계획·지급 시험은 `syncIssueRun-pending.test.ts`).
 *   동기화로 받은 배지의 기한은 공개 종료일로 두지 않고(`p_expires_at` null),
 *   공개 기간이 끝난 배지·컬렉션은 후보가 아니다.
 * - 활동 하나의 실패는 그 활동만 건너뛰고 `onActivityError`로 알린다.
 * - 동기화 경로(`sync.ts`·`syncIssueRun.ts`·`syncIssue.ts`)는 옛 규칙 모듈(트라이브 고르기·등급 보정 셋·컬렉션 보정·
 *   온보딩 제한·`expires_at`)을 가져오지 않는다 — 소스를 읽어 확인한다.
 *
 * 실제 Strava·공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-item-issue.test.ts
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/points', () => ({ awardPoints: vi.fn(async () => null) }))
vi.mock('@/lib/notifications/recap', () => ({ recordActivityRecap: vi.fn(async () => {}) }))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: vi.fn(async () => {}) }))

import { issueSyncItemBadges, type SyncIssueTarget } from '@/lib/drop-engine/syncIssueRun'
import { DEFAULT_JAM_POLICY } from '@/lib/jam/policy'
import { recordFeedEvent } from '@/lib/activity-feed'
import { awardPoints } from '@/lib/points'
import { recordActivityRecap } from '@/lib/notifications/recap'
import { logEngineDecision } from '@/lib/engine-log'

const USER_ID = 'user-1'
const TRIBE = 'tribe-mine'
const OTHER_TRIBE = 'tribe-other'
const NOW = new Date('2026-10-17T00:00:00Z')

// ── 가짜 DB ─────────────────────────────────────────────────────────────

interface FakeBook {
  id: string
  tribe_id: string | null
  is_active: boolean
  drop_excluded: boolean
  valid_from: string | null
  valid_until: string | null
}
interface FakeBadge {
  id: string
  name: string
  image_url: string | null
  rarity: 'common' | 'rare' | 'epic' | 'mystic'
  item_book_id: string
  drop_excluded: boolean
  valid_from: string | null
  valid_until: string | null
  deleted_at: string | null
  point_reward: number | null
}

interface World {
  tribeId: string | null
  userError: boolean
  inventory: { id: string; used_slots: number; max_slots: number } | null
  books: FakeBook[]
  badges: FakeBadge[]
  /** null이면 user_drop_state 행이 없다 */
  streak: number | null
  streakReadError: boolean
  rpcCalls: Record<string, unknown>[]
  /** n번째(1부터) 지급 호출의 결과를 바꾼다 */
  grantOverride: (n: number) => 'slot_full' | 'throw' | null
  logRows: Record<string, unknown>[]
  pendingRows: Record<string, unknown>[]
  logInsert: 'ok' | 'error' | 'throw'
  streakUpserts: Record<string, unknown>[]
  /** item_books 조회에 건 tribe_id 조건 */
  bookTribeFilters: unknown[]
}

function makeWorld(overrides: Partial<World> = {}): World {
  return {
    tribeId: TRIBE,
    userError: false,
    inventory: { id: 'inv-1', used_slots: 0, max_slots: 100 },
    books: [book('book-mine')],
    badges: [badge('b-common-1', 'common'), badge('b-common-2', 'common'), badge('b-rare-1', 'rare')],
    streak: 0,
    streakReadError: false,
    rpcCalls: [],
    grantOverride: () => null,
    logRows: [],
    pendingRows: [],
    logInsert: 'ok',
    streakUpserts: [],
    bookTribeFilters: [],
    ...overrides,
  }
}

function book(id: string, overrides: Partial<FakeBook> = {}): FakeBook {
  return { id, tribe_id: TRIBE, is_active: true, drop_excluded: false, valid_from: null, valid_until: null, ...overrides }
}

function badge(id: string, rarity: FakeBadge['rarity'], overrides: Partial<FakeBadge> = {}): FakeBadge {
  return {
    id,
    name: `배지 ${id}`,
    image_url: null,
    rarity,
    item_book_id: 'book-mine',
    drop_excluded: false,
    valid_from: null,
    valid_until: null,
    deleted_at: null,
    point_reward: null,
    ...overrides,
  }
}

function makeFakeSupabase(world: World): SupabaseClient {
  let grantCount = 0
  const from = (table: string) => {
    const eqs: Record<string, unknown> = {}
    let inList: unknown[] = []
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (col: string, value: unknown) => {
        eqs[col] = value
        return builder
      },
      is: () => builder,
      in: (_col: string, values: unknown[]) => {
        inList = values
        return builder
      },
      order: () => builder,
      range: async () => {
        if (table === 'badges') return { data: world.badges.filter((b) => inList.includes(b.item_book_id)), error: null }
        return { data: [], error: null }
      },
      maybeSingle: async () => {
        switch (table) {
          case 'users':
            return world.userError
              ? { data: null, error: { message: 'users 조회 실패' } }
              : { data: { tribe_id: world.tribeId }, error: null }
          case 'inventory':
            return { data: world.inventory, error: null }
          case 'user_drop_state':
            if (world.streakReadError) return { data: null, error: { message: 'state 조회 실패' } }
            return { data: world.streak === null ? null : { common_streak: world.streak }, error: null }
          case 'tribes':
            return { data: { name: '내 트라이브' }, error: null }
          case 'inventory_items':
            return { data: { serial_number: 1000 + Number(String(eqs.id).replace('item-', '')) }, error: null }
          default:
            return { data: null, error: null }
        }
      },
      upsert: async (payload: Record<string, unknown>) => {
        if (table === 'user_drop_state') world.streakUpserts.push(payload)
        return { error: null }
      },
      insert: async (payload: Record<string, unknown> | Record<string, unknown>[]) => {
        if (table === 'sync_pending_items') world.pendingRows.push(...(Array.isArray(payload) ? payload : [payload]))
        if (table === 'item_issue_log' && !Array.isArray(payload)) {
          if (world.logInsert === 'throw') throw new Error('기록 insert 예외')
          if (world.logInsert === 'error') return { error: { message: '기록 insert 오류' } }
          world.logRows.push(payload)
        }
        return { error: null }
      },
      then(onFulfilled: (v: { data: unknown; error: unknown }) => unknown, onRejected?: (e: unknown) => unknown) {
        if (table === 'item_books') {
          world.bookTribeFilters.push(eqs.tribe_id)
          // 가짜 DB도 서버처럼 tribe_id 조건을 지킨다 — 다른 트라이브 컬렉션은 아예 돌아오지 않는다
          const data = world.books.filter((b) => b.tribe_id === eqs.tribe_id)
          return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected)
        }
        return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected)
      },
    }
    return builder
  }

  const rpc = async (name: string, args: Record<string, unknown>) => {
    if (name !== 'grant_inventory_item_locked') return { data: null, error: { message: `알 수 없는 rpc ${name}` } }
    grantCount += 1
    world.rpcCalls.push(args)
    const override = world.grantOverride(grantCount)
    if (override === 'throw') throw new Error('지급 RPC 예외')
    const inventory = world.inventory
    if (override === 'slot_full' || (inventory && inventory.used_slots >= inventory.max_slots)) {
      return { data: { ok: false, reason: 'slot_full' }, error: null }
    }
    if (inventory) inventory.used_slots += 1
    return { data: { ok: true, itemId: `item-${grantCount}`, usedSlots: inventory?.used_slots ?? 0 }, error: null }
  }

  return { from, rpc } as unknown as SupabaseClient
}

/** 개수·등급을 정책으로 고정한다 — 보너스 없음, 확정 개수, 등급 100% */
function policyWith(overrides: Partial<typeof DEFAULT_JAM_POLICY> = {}) {
  return {
    ...DEFAULT_JAM_POLICY,
    sync_item_guaranteed: 1,
    sync_item_guaranteed_hiking: 2,
    sync_item_bonus_rolls: 0,
    sync_rarity_common: 100,
    sync_rarity_rare: 0,
    sync_rarity_epic: 0,
    sync_rarity_mystic: 0,
    ...overrides,
  }
}

function target(n: number, overrides: Partial<SyncIssueTarget> = {}): SyncIssueTarget {
  return {
    stravaId: n,
    activityId: `act-${n}`,
    startDate: `2026-10-${String(10 + n).padStart(2, '0')}T00:00:00Z`,
    jam: 90,
    isHiking: false,
    ...overrides,
  }
}

const rand = () => 0.3

const runOutcome = (world: World, targets: SyncIssueTarget[], policy = policyWith(), onActivityError?: (t: SyncIssueTarget, e: unknown) => void) =>
  issueSyncItemBadges(makeFakeSupabase(world), USER_ID, policy, targets, { rand, now: NOW, onActivityError })

/** 지급한 배지 id만 돌려준다 — 보류 개수가 필요한 시험은 `runOutcome`을 쓴다 */
const run = async (...args: Parameters<typeof runOutcome>) => (await runOutcome(...args)).issuedBadgeIds

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('소속 트라이브', () => {
  it('소속 트라이브가 없으면 아이템 배지만 건너뛴다 — 지급·기록 없음, 건너뜀 로그', async () => {
    const world = makeWorld({ tribeId: null })

    const ids = await run(world, [target(1), target(2)])

    expect(ids).toEqual([])
    expect(world.rpcCalls).toEqual([])
    expect(world.logRows).toEqual([])
    expect(world.streakUpserts).toEqual([])
    expect(logEngineDecision).toHaveBeenCalledWith('drop', 'drop_attempt', USER_ID, expect.objectContaining({ outcome: 'no_tribe', activities: 2 }))
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('소속 트라이브 없음'))
  })

  it('소속 트라이브 조회가 실패하면 발급을 건너뛰고 던지지 않는다', async () => {
    const world = makeWorld({ userError: true })

    await expect(run(world, [target(1)])).resolves.toEqual([])
    expect(world.rpcCalls).toEqual([])
  })

  it('대상 활동이 없으면 아무것도 읽지 않는다', async () => {
    const world = makeWorld()
    const supabase = makeFakeSupabase(world)
    const fromSpy = vi.spyOn(supabase, 'from')

    await expect(issueSyncItemBadges(supabase, USER_ID, policyWith(), [], { rand, now: NOW })).resolves.toEqual({ issuedBadgeIds: [], pendingCount: 0 })
    expect(fromSpy).not.toHaveBeenCalled()
  })
})

describe('개수와 순서', () => {
  it('대상 활동마다 확정 개수만큼 발급한다 — 최근 3건 상한이 없다', async () => {
    const world = makeWorld()

    const ids = await run(world, [target(1), target(2), target(3), target(4), target(5)], policyWith({ sync_item_guaranteed: 2 }))

    expect(ids).toHaveLength(10)
    expect(world.rpcCalls).toHaveLength(10)
    expect(world.logRows).toHaveLength(10)
    const perActivity = new Map<string, number>()
    for (const row of world.logRows) {
      const key = String(row.source_activity_id)
      perActivity.set(key, (perActivity.get(key) ?? 0) + 1)
    }
    expect([...perActivity.entries()].sort()).toEqual([
      ['act-1', 2],
      ['act-2', 2],
      ['act-3', 2],
      ['act-4', 2],
      ['act-5', 2],
    ])
  })

  it('등산 활동은 등산 확정 개수를 쓴다', async () => {
    const world = makeWorld()

    await run(world, [target(1, { isHiking: true }), target(2)], policyWith({ sync_item_guaranteed: 1, sync_item_guaranteed_hiking: 3 }))

    expect(world.logRows.filter((r) => r.source_activity_id === 'act-1')).toHaveLength(3)
    expect(world.logRows.filter((r) => r.source_activity_id === 'act-2')).toHaveLength(1)
  })

  it('확정 개수 0 설정이면 드랍이 없고 아무것도 쓰지 않는다', async () => {
    const world = makeWorld()

    const ids = await run(world, [target(1)], policyWith({ sync_item_guaranteed: 0 }))

    expect(ids).toEqual([])
    expect(world.rpcCalls).toEqual([])
    expect(world.streakUpserts).toEqual([])
  })

  it('오래된 활동부터 처리한다 — 입력 순서와 무관하다', async () => {
    const world = makeWorld()

    await run(world, [target(3), target(1), target(2)])

    expect(world.logRows.map((r) => r.source_activity_id)).toEqual(['act-1', 'act-2', 'act-3'])
  })
})

describe('후보와 등급', () => {
  it('후보는 소속 트라이브 컬렉션에서만 나온다 — 다른 트라이브의 배지는 받지 못한다', async () => {
    const world = makeWorld({
      books: [book('book-mine'), book('book-other', { tribe_id: OTHER_TRIBE })],
      badges: [badge('b-mine', 'common'), badge('b-other', 'common', { item_book_id: 'book-other' })],
    })

    const ids = await run(world, [target(1), target(2), target(3), target(4)])

    expect(ids).toEqual(['b-mine', 'b-mine', 'b-mine', 'b-mine'])
    expect(world.bookTribeFilters).toEqual([TRIBE])
  })

  it('뽑힌 등급에 후보가 없으면 한 등급 내려 다시 뽑고, 뽑힌 등급과 실제 등급을 함께 기록한다', async () => {
    const world = makeWorld({
      badges: [badge('b-rare-1', 'rare'), badge('b-common-1', 'common')],
    })

    const ids = await run(world, [target(1)], policyWith({ sync_rarity_common: 0, sync_rarity_mystic: 100 }))

    expect(ids).toEqual(['b-rare-1'])
    expect(world.logRows).toEqual([
      expect.objectContaining({ badge_id: 'b-rare-1', rarity: 'rare', rolled_rarity: 'mystic' }),
    ])
  })

  it('후보가 있는 등급까지 내려가도 위쪽 등급으로는 올라가지 않는다', async () => {
    const world = makeWorld({ badges: [badge('b-mystic-1', 'mystic')] })

    const ids = await run(world, [target(1)], policyWith({ sync_rarity_common: 100 }))

    // common을 뽑았지만 common 아래는 없고 위로는 올라가지 않는다 — 건너뜀
    expect(ids).toEqual([])
    expect(world.rpcCalls).toEqual([])
  })

  it('모든 등급에 후보가 없으면 그 개체를 건너뛰고(로그) 기록·지급·연속 값 저장이 없다', async () => {
    const world = makeWorld({ badges: [] })

    const ids = await run(world, [target(1)], policyWith({ sync_item_guaranteed: 2 }))

    expect(ids).toEqual([])
    expect(world.rpcCalls).toEqual([])
    expect(world.logRows).toEqual([])
    expect(world.streakUpserts).toEqual([])
    expect(logEngineDecision).toHaveBeenCalledWith('drop', 'drop_attempt', USER_ID, expect.objectContaining({ outcome: 'no_candidate' }))
  })

  it('소속 트라이브의 컬렉션이 하나도 없어도 던지지 않고 건너뛴다', async () => {
    const world = makeWorld({ books: [], badges: [] })

    await expect(run(world, [target(1)])).resolves.toEqual([])
  })
})

describe('공개 기간·기한', () => {
  it('공개 기간이 끝난 배지와 컬렉션은 발급하지 않는다', async () => {
    const past = '2026-10-01T00:00:00Z'
    const future = '2026-12-01T00:00:00Z'
    const world = makeWorld({
      books: [book('book-mine'), book('book-ended', { valid_until: past })],
      badges: [
        badge('b-ended', 'common', { valid_until: past }),
        badge('b-in-ended-book', 'common', { item_book_id: 'book-ended' }),
        badge('b-ok', 'common', { valid_until: future }),
      ],
    })

    const ids = await run(world, [target(1), target(2), target(3)])

    expect(ids).toEqual(['b-ok', 'b-ok', 'b-ok'])
  })

  it('공개 종료일이 남은 배지도 기한(p_expires_at)을 두지 않고 지급한다', async () => {
    const world = makeWorld({ badges: [badge('b-ok', 'common', { valid_until: '2026-12-01T00:00:00Z' })] })

    await run(world, [target(1)])

    expect(world.rpcCalls).toEqual([
      {
        p_inventory_id: 'inv-1',
        p_badge_id: 'b-ok',
        p_obtained_by: 'drop',
        p_expires_at: null,
        p_locked: false,
        p_lock_reason: null,
        p_unlock_required: null,
      },
    ])
  })
})

describe('common_streak', () => {
  it('Common을 받으면 +1로 저장한다', async () => {
    const world = makeWorld({ streak: 3 })

    await run(world, [target(1)], policyWith({ sync_item_guaranteed: 2 }))

    expect(world.streakUpserts).toEqual([expect.objectContaining({ user_id: USER_ID, common_streak: 5 })])
  })

  it('Common이 아닌 등급을 받으면 0으로 저장한다', async () => {
    const world = makeWorld({ streak: 7 })

    await run(world, [target(1)], policyWith({ sync_rarity_common: 0, sync_rarity_rare: 100 }))

    expect(world.streakUpserts).toEqual([expect.objectContaining({ common_streak: 0 })])
  })

  it('행이 없으면(null) 0에서 시작해 행을 만든다(upsert)', async () => {
    const world = makeWorld({ streak: null })

    await run(world, [target(1)])

    expect(world.streakUpserts).toEqual([expect.objectContaining({ user_id: USER_ID, common_streak: 1 })])
  })

  it('임계값에 닿은 상태에서는 Common이 나오지 않고 Rare 이상을 받는다', async () => {
    const world = makeWorld({ streak: 10 })

    const ids = await run(world, [target(1)], policyWith({ sync_rarity_common: 90, sync_rarity_rare: 10 }))

    expect(ids).toEqual(['b-rare-1'])
    expect(world.streakUpserts).toEqual([expect.objectContaining({ common_streak: 0 })])
  })

  it('받은 실제 등급을 기준으로 센다 — Rare를 뽑았지만 Common을 받았다면 연속은 이어진다', async () => {
    const world = makeWorld({ streak: 4, badges: [badge('b-common-1', 'common')] })

    await run(world, [target(1)], policyWith({ sync_rarity_common: 0, sync_rarity_rare: 100 }))

    expect(world.streakUpserts).toEqual([expect.objectContaining({ common_streak: 5 })])
  })

  it('값을 읽지 못하면 이번 동기화에서 값을 쓰지 않는다(0으로 덮어쓰지 않는다) — 발급은 계속한다', async () => {
    const world = makeWorld({ streakReadError: true })

    const ids = await run(world, [target(1)])

    expect(ids).toHaveLength(1)
    expect(world.streakUpserts).toEqual([])
  })
})

describe('발급 기록(item_issue_log)', () => {
  it('줄 때마다 경로·대상 활동·배지·등급·뽑힌 등급·잠김 false·일련번호·개체 id를 한 줄 남긴다', async () => {
    const world = makeWorld({ badges: [badge('b-common-1', 'common')] })

    await run(world, [target(1), target(2)])

    expect(world.logRows).toEqual([
      {
        user_id: USER_ID,
        inventory_item_id: 'item-1',
        route: 'sync',
        source_activity_id: 'act-1',
        badge_id: 'b-common-1',
        rarity: 'common',
        rolled_rarity: 'common',
        locked: false,
        serial_number: 1001,
      },
      {
        user_id: USER_ID,
        inventory_item_id: 'item-2',
        route: 'sync',
        source_activity_id: 'act-2',
        badge_id: 'b-common-1',
        rarity: 'common',
        rolled_rarity: 'common',
        locked: false,
        serial_number: 1002,
      },
    ])
  })

  it.each(['error', 'throw'] as const)('기록 insert가 %s여도 지급과 연속 값 저장은 계속된다', async (mode) => {
    const world = makeWorld({ logInsert: mode })

    const ids = await run(world, [target(1), target(2)])

    expect(ids).toHaveLength(2)
    expect(world.rpcCalls).toHaveLength(2)
    expect(world.streakUpserts).toHaveLength(2)
  })
})

describe('인벤토리 가득 참 (보류 — 티켓 20261017_1425)', () => {
  it('받을 개수 전체가 빈칸보다 많으면 하나도 지급하지 않고 전부 보류한다', async () => {
    const world = makeWorld({ inventory: { id: 'inv-1', used_slots: 3, max_slots: 4 } })

    const outcome = await runOutcome(world, [target(1), target(2), target(3)], policyWith({ sync_item_guaranteed: 2 }))

    expect(outcome).toEqual({ issuedBadgeIds: [], pendingCount: 6 })
    expect(world.rpcCalls).toEqual([])
    expect(world.logRows).toEqual([])
    expect(world.pendingRows).toHaveLength(6)
    expect(logEngineDecision).toHaveBeenCalledWith('drop', 'drop_attempt', USER_ID, expect.objectContaining({ outcome: 'pending', pendingCount: 6 }))
    // 받을 개체가 정해졌으므로 보류한 6개도 연속 값에 반영된다
    expect(world.streakUpserts).toEqual([expect.objectContaining({ common_streak: 6 })])
  })

  it('RPC가 slot_full을 돌려주면(동시 요청) 그 개체와 남은 개체를 보류한다', async () => {
    const world = makeWorld({ grantOverride: (n) => (n === 2 ? 'slot_full' : null) })

    const outcome = await runOutcome(world, [target(1), target(2), target(3)])

    expect(outcome.issuedBadgeIds).toHaveLength(1)
    expect(outcome.pendingCount).toBe(2)
    expect(world.rpcCalls).toHaveLength(2)
    expect(world.logRows).toHaveLength(1)
    expect(world.pendingRows.map((r) => r.source_activity_id)).toEqual(['act-2', 'act-3'])
  })
})

describe('실패 격리와 곁다리', () => {
  it('활동 하나의 지급이 던지면 그 활동만 건너뛰고 onActivityError로 알린 뒤 다음 활동을 이어 간다', async () => {
    const world = makeWorld({ grantOverride: (n) => (n === 2 ? 'throw' : null) })
    const onActivityError = vi.fn()

    const ids = await run(world, [target(1), target(2), target(3)], policyWith(), onActivityError)

    expect(ids).toHaveLength(2)
    expect(onActivityError).toHaveBeenCalledTimes(1)
    expect(onActivityError).toHaveBeenCalledWith(expect.objectContaining({ stravaId: 2 }), expect.any(Error))
    expect(world.logRows.map((r) => r.source_activity_id)).toEqual(['act-1', 'act-3'])
  })

  it('onActivityError가 던져도 다음 활동은 이어진다', async () => {
    const world = makeWorld({ grantOverride: (n) => (n === 1 ? 'throw' : null) })

    const ids = await run(world, [target(1), target(2)], policyWith(), () => {
      throw new Error('기록 실패')
    })

    expect(ids).toHaveLength(1)
  })

  it('잼 연계 포인트(point_reward)·피드·결산은 옛 지급과 같은 규칙으로 남긴다', async () => {
    const world = makeWorld({ badges: [badge('b-common-1', 'common', { point_reward: 5 })] })

    await run(world, [target(1)])

    expect(awardPoints).toHaveBeenCalledWith(USER_ID, 5, 'badge_point_reward', { sourceBadgeId: 'b-common-1' })
    expect(recordFeedEvent).toHaveBeenCalledWith(
      USER_ID,
      'item_dropped',
      expect.objectContaining({
        inventory_item_id: 'item-1',
        badge_id: 'b-common-1',
        rarity: 'common',
        tribe_name: '내 트라이브',
        is_last_piece: false,
        point_reward: 5,
      }),
      '2026-10-11T00:00:00Z',
      1
    )
    expect(recordActivityRecap).toHaveBeenCalledWith(USER_ID, {
      activity_ids: [1],
      item_badges: [{ inventory_item_id: 'item-1', badge_id: 'b-common-1', name: '배지 b-common-1', rarity: 'common' }],
    })
  })

  it('point_reward가 없으면 포인트를 지급하지 않는다', async () => {
    const world = makeWorld()

    await run(world, [target(1)])

    expect(awardPoints).not.toHaveBeenCalled()
  })
})

describe('동기화 경로는 옛 규칙을 쓰지 않는다 (소스 검색)', () => {
  const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
  const syncTs = read('../sync.ts')
  const runTs = read('../../drop-engine/syncIssueRun.ts')
  const pureTs = read('../../drop-engine/syncIssue.ts')

  /** 옛 규칙이 들어 있는 모듈 — 트라이브 고르기·등급 보정 셋·컬렉션 보정·온보딩 제한·맥락 규칙·고정 트라이브 */
  const OLD_RULE_MODULES = [
    /from ['"]@\/lib\/drop-engine\/index['"]/,
    /from ['"]@\/lib\/drop-engine\/layers['"]/,
    /from ['"]@\/lib\/drop-engine\/context['"]/,
    /from ['"]@\/lib\/drop-engine\/constants['"]/,
    /from ['"]@\/lib\/drop-engine\/policy['"]/,
    /from ['"]\.\/(index|layers|context|constants|policy)['"]/,
  ]
  const OLD_RULE_SYMBOLS = [
    'tryItemDrop',
    'selectBadge',
    'pickTribe',
    'pickBook',
    'rollRarityV2',
    'rollBonusDrop',
    'isComebackActivity',
    'isWeeklyFirstActivity',
    'matchContextTribes',
    'applyShadowBanCap',
    'ONBOARDING_DROP_COUNT',
    'MYSTERY_TRIBE_ID',
    'RESOLUTION_TRIBE_ID',
    'MAX_DROP_ACTIVITIES_PER_SYNC',
    'getDropPolicy',
  ]

  for (const [name, source] of [
    ['strava/sync.ts', syncTs],
    ['drop-engine/syncIssueRun.ts', runTs],
    ['drop-engine/syncIssue.ts', pureTs],
  ] as const) {
    it(`${name}은 옛 규칙 모듈을 가져오지 않는다`, () => {
      for (const pattern of OLD_RULE_MODULES) expect(source).not.toMatch(pattern)
    })

    it(`${name}의 코드에는 옛 규칙 함수·상수가 나오지 않는다`, () => {
      // 주석의 설명은 제외하고 코드 줄만 본다
      const code = source
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
        .join('\n')
      for (const symbol of OLD_RULE_SYMBOLS) expect(code).not.toContain(symbol)
    })
  }

  it('동기화 발급기는 공개 종료일을 기한으로 넘기지 않는다(p_expires_at null)', () => {
    expect(runTs).toContain('p_expires_at: null')
    expect(runTs).not.toMatch(/valid_until\s*\?\?\s*null/)
  })

  it('순수 판정 모듈은 서버 모듈을 가져오지 않는다(클라이언트 번들 경계)', () => {
    expect(pureTs).not.toMatch(/from ['"]@\/lib\/supabase\/server['"]/)
    expect(pureTs).not.toMatch(/from ['"]next\/headers['"]/)
    expect(pureTs).not.toMatch(/from ['"]\.\/syncIssueRun['"]/)
  })
})
