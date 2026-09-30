/**
 * combineRecipeAttempt() v5 — 레시피 선택형 단일 검증 (티켓 20260917_1427)
 *
 * 검증 대상:
 *  1) 아이템 슬롯 대응 + 조건 슬롯(액티비티·체크인) 보유 → reward_points·reward_badge_ids 전부 지급
 *  2) 슬롯 하나라도 미충족 → 실패로 처리되고 **아이템만 소각**되며 실패 로그가 1건 쌓인다
 *  3) 존재하지 않는 recipe_id → recipe_not_found로 거부(소각 없음)
 *  4) 전체 레시피 스캔이 사라졌으므로 선택되지 않은 레시피가 매칭되지 않는다
 *  5) 성공 기록(티켓 20261001_0631) — 성공 갈래에서만 `record_combine_success` RPC를 1회 부른다(빈손 성공 포함).
 *     소각 전 실패·`no_recipe_match`는 성공 기록을 남기지 않고, RPC 오류·예외가 나도 응답과 보상은 그대로다
 *  6) `jamTriggersForCombineResult` — 결과별로 다시 판정할 JAM! 행동 지표
 *
 * 실행: cd jam-web && npx vitest run src/lib/combine/__tests__/combine-engine.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const INVENTORY_ID = 'inv-1'
const USER = 'user-1'
const ITEM_1 = 'item-1'
const ITEM_2 = 'item-2'
const BADGE_A = 'badge-a'
const BADGE_B = 'badge-b'
const REQ_ACT = 'badge-req-activity'
const REWARD = 'badge-reward'

interface RecipeStub {
  id: string
  reward_points: number
  reward_badge_ids: string[]
  created_at: string
}

interface SlotStub {
  recipe_id: string
  slot_order: number
  badge_type: 'item' | 'activity' | 'checkin'
  allowed_badge_ids: string[]
}

const stub = vi.hoisted(() => ({
  recipes: [] as unknown[],
  slots: [] as SlotStub[],
  /** 유저가 보유한 액티비티 배지 id */
  ownedActivityBadgeIds: [] as string[],
  ownedCheckinBadgeIds: [] as string[],
  failLogs: [] as Record<string, unknown>[],
  grantedBadgeIds: [] as string[],
  destroyedItemIds: [] as string[],
  failRewardPoints: 0,
  /** inventory.used_slots — 조합 전 초기값. 소각/지급마다 이 값이 갱신된다(20260912_2101). */
  usedSlots: 5,
  maxSlots: 10,
  usedSlotsHistory: [] as number[],
  // ── 성공 기록(record_combine_success, 티켓 20261001_0631) ────────────────
  successRpcCalls: [] as Record<string, unknown>[],
  /** RPC가 돌려줄 오류. null이면 정상 */
  successRpcError: null as { message: string } | null,
  /** true면 RPC 호출이 예외로 거부된다 */
  successRpcThrows: false,
  /** 이미 «최초 성공자»가 생긴 레시피 id — DB의 (recipe_id) WHERE is_recipe_first 부분 유니크를 흉내낸다 */
  firstSuccessRecipeIds: [] as string[],
  /** RPC가 돌려준 «이 호출이 최초 성공인가» 값 모음 */
  successRpcResults: [] as boolean[],
  /** RPC·포인트 지급 호출 순서 — 성공 기록이 보상 지급 뒤에 남는지 본다 */
  callOrder: [] as string[],
}))

const awardPointsMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/points', () => ({
  awardPoints: (userId: string, amount: number, reason: string) => {
    stub.callOrder.push('award_points')
    return awardPointsMock(userId, amount, reason)
  },
}))

vi.mock('@/lib/combine/policy', () => ({
  getCombinePolicy: async () => ({ fail_reward_points: stub.failRewardPoints }),
}))

/**
 * 티켓 20260914_1813 — 지급/소각+카운터 갱신이 grant_inventory_item()·
 * release_inventory_slots() RPC(마이그레이션 173)로 원자화되면서, 이 스텁도 `.from().update()`
 * 대신 `.rpc()` 호출을 시뮬레이션한다. 두 RPC 모두 "inventory 행을 잠근 뒤 재확인 →
 * 반영"을 한 트랜잭션으로 하므로, 스텁은 그 최종 결과(성공/슬롯 가득 참)만 흉내낸다.
 */
async function rpcStub(fnName: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> {
  stub.callOrder.push(fnName)
  if (fnName === 'record_combine_success') {
    stub.successRpcCalls.push(args)
    if (stub.successRpcThrows) throw new Error('RPC 예외')
    if (stub.successRpcError) return { data: null, error: stub.successRpcError }
    // 최초 표시 선점은 한 번의 동기 확인·기록이라 동시 호출에서도 정확히 한 번만 true다(DB는 부분 유니크 인덱스가 보장)
    const recipeId = args.p_recipe_id as string
    const isFirst = !stub.firstSuccessRecipeIds.includes(recipeId)
    if (isFirst) stub.firstSuccessRecipeIds.push(recipeId)
    stub.successRpcResults.push(isFirst)
    return { data: isFirst, error: null }
  }
  if (fnName === 'grant_inventory_item') {
    if (stub.usedSlots >= stub.maxSlots) {
      return { data: { ok: false, reason: 'slot_full' }, error: null }
    }
    stub.usedSlots += 1
    stub.usedSlotsHistory.push(stub.usedSlots)
    stub.grantedBadgeIds.push(args.p_badge_id as string)
    return {
      data: { ok: true, itemId: `generated-item-${stub.grantedBadgeIds.length}`, usedSlots: stub.usedSlots },
      error: null,
    }
  }
  if (fnName === 'release_inventory_slots') {
    stub.usedSlots = Math.max(0, stub.usedSlots - (args.p_count as number))
    stub.usedSlotsHistory.push(stub.usedSlots)
    return { data: { ok: true, usedSlots: stub.usedSlots }, error: null }
  }
  return { data: null, error: null }
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: (): SupabaseClient => ({
    from: (table: string) => makeBuilder(table),
    rpc: (fnName: string, args: Record<string, unknown>) => rpcStub(fnName, args),
  }) as unknown as SupabaseClient,
}))

/**
 * `.from(t).select().eq()...`를 자유롭게 이어 붙일 수 있고, await 시점에 테이블·연산에 맞는
 * 결과를 돌려주는 최소 스텁. 체이닝 순서는 검증하지 않는다(엔진의 결과 분기만 본다).
 */
function makeBuilder(table: string) {
  const state: { op: 'select' | 'insert' | 'update'; payload?: unknown; eqFilters: Record<string, unknown> } = {
    op: 'select',
    eqFilters: {},
  }

  const resolve = async (): Promise<{ data: unknown; error: unknown }> => {
    if (state.op === 'insert') {
      if (table === 'user_combine_fail_logs') {
        stub.failLogs.push(state.payload as Record<string, unknown>)
      }
      return { data: null, error: null }
    }
    if (state.op === 'update' && table === 'inventory_items') {
      // 소각 — 요청한 개체 전부가 파괴된 정상 경로
      stub.destroyedItemIds = [ITEM_1, ITEM_2]
      return { data: [{ id: ITEM_1 }, { id: ITEM_2 }], error: null }
    }
    switch (table) {
      case 'inventory':
        return { data: { id: INVENTORY_ID, used_slots: stub.usedSlots, max_slots: stub.maxSlots }, error: null }
      case 'inventory_items':
        return {
          data: [
            { id: ITEM_1, badge_id: BADGE_A },
            { id: ITEM_2, badge_id: BADGE_B },
          ],
          error: null,
        }
      case 'combination_recipes': {
        // `.eq('id', recipeId).maybeSingle()` — 티켓 20260917_1427: 선택된 레시피 하나만 조회
        if ('id' in state.eqFilters) {
          const found = (stub.recipes as RecipeStub[]).find((r) => r.id === state.eqFilters.id)
          return { data: found ?? null, error: null }
        }
        return { data: stub.recipes, error: null }
      }
      case 'combination_recipe_slots': {
        if ('recipe_id' in state.eqFilters) {
          return { data: stub.slots.filter((s) => s.recipe_id === state.eqFilters.recipe_id), error: null }
        }
        return { data: stub.slots, error: null }
      }
      case 'user_activity_badges':
        return { data: stub.ownedActivityBadgeIds.map((badge_id) => ({ badge_id })), error: null }
      case 'user_checkin_badge_earns':
        return { data: stub.ownedCheckinBadgeIds.map((badge_id) => ({ badge_id })), error: null }
      case 'users':
        return { data: { username: '테스터' }, error: null }
      case 'badges':
        return { data: { id: REWARD, name: '보상 배지', rarity: 'rare' }, error: null }
      default:
        return { data: null, error: null }
    }
  }

  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      state.eqFilters[column] = value
      return builder
    },
    in: () => builder,
    is: () => builder,
    order: () => builder,
    limit: () => builder,
    single: resolve,
    maybeSingle: resolve,
    insert: (payload: unknown) => {
      state.op = 'insert'
      state.payload = payload
      return builder
    },
    update: (payload: unknown) => {
      state.op = 'update'
      state.payload = payload
      return builder
    },
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      resolve().then(onFulfilled, onRejected),
  }
  return builder
}

import { combineRecipeAttempt, jamTriggersForCombineResult, type CombineResult } from '../index'

function recipe(overrides: Partial<RecipeStub> = {}): RecipeStub {
  return {
    id: 'recipe-1',
    reward_points: 0,
    reward_badge_ids: [REWARD],
    created_at: '2026-09-10T00:00:00.000Z',
    ...overrides,
  }
}

/** 아이템 슬롯 2개(BADGE_A, BADGE_B)만 있는 기본 슬롯 구성 — 조건 슬롯은 옵션으로 덧붙인다. */
function itemSlots(recipeId = 'recipe-1'): SlotStub[] {
  return [
    { recipe_id: recipeId, slot_order: 0, badge_type: 'item', allowed_badge_ids: [BADGE_A] },
    { recipe_id: recipeId, slot_order: 1, badge_type: 'item', allowed_badge_ids: [BADGE_B] },
  ]
}

beforeEach(() => {
  stub.recipes = []
  stub.slots = []
  stub.ownedActivityBadgeIds = []
  stub.ownedCheckinBadgeIds = []
  stub.failLogs = []
  stub.grantedBadgeIds = []
  stub.destroyedItemIds = []
  stub.failRewardPoints = 0
  stub.usedSlots = 5
  stub.maxSlots = 10
  stub.usedSlotsHistory = []
  stub.successRpcCalls = []
  stub.successRpcError = null
  stub.successRpcThrows = false
  stub.firstSuccessRecipeIds = []
  stub.successRpcResults = []
  stub.callOrder = []
  awardPointsMock.mockReset()
  awardPointsMock.mockResolvedValue({ id: 'tx-1' })
})

describe('슬롯 전체 충족 → 확정 보상', () => {
  it('아이템 슬롯만 있는 레시피는 투입 배지가 슬롯 후보와 대응되면 매칭된다', async () => {
    stub.recipes = [recipe({ reward_points: 120, reward_badge_ids: [REWARD] })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.path).toBe('recipe')
      expect(result.resultBadges.map((b) => b.id)).toEqual([REWARD])
      expect(result.pointsAwarded).toBe(120)
    }
    expect(stub.grantedBadgeIds).toEqual([REWARD])
    expect(awardPointsMock).toHaveBeenCalledWith(USER, 120, 'combine_recipe_reward')
    // 성공은 실패 이력에 남지 않는다
    expect(stub.failLogs).toHaveLength(0)
    // 재료는 항상 소각된다
    expect(stub.destroyedItemIds).toEqual([ITEM_1, ITEM_2])
  })

  it('포인트만 지정한 레시피는 배지 없이 포인트만 지급한다', async () => {
    stub.recipes = [recipe({ reward_points: 30, reward_badge_ids: [] })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.resultBadges).toHaveLength(0)
      expect(result.pointsAwarded).toBe(30)
    }
    expect(stub.grantedBadgeIds).toEqual([])
  })

  it('액티비티 조건 슬롯을 보유한 유저는 매칭된다', async () => {
    stub.recipes = [recipe()]
    stub.slots = [...itemSlots(), { recipe_id: 'recipe-1', slot_order: 2, badge_type: 'activity', allowed_badge_ids: [REQ_ACT] }]
    stub.ownedActivityBadgeIds = [REQ_ACT]

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])
    expect(result.success).toBe(true)
  })

  it('체크인 조건 슬롯을 보유해도 매칭된다', async () => {
    stub.recipes = [recipe()]
    stub.slots = [...itemSlots(), { recipe_id: 'recipe-1', slot_order: 2, badge_type: 'checkin', allowed_badge_ids: [REQ_ACT] }]
    stub.ownedCheckinBadgeIds = [REQ_ACT]

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])
    expect(result.success).toBe(true)
  })

  it('조건 슬롯 후보(OR) 중 하나만 보유해도 충족된다', async () => {
    const OTHER_CANDIDATE = 'badge-other-candidate'
    stub.recipes = [recipe()]
    stub.slots = [
      ...itemSlots(),
      { recipe_id: 'recipe-1', slot_order: 2, badge_type: 'activity', allowed_badge_ids: [REQ_ACT, OTHER_CANDIDATE] },
    ]
    stub.ownedActivityBadgeIds = [OTHER_CANDIDATE]

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])
    expect(result.success).toBe(true)
  })
})

describe('슬롯 미충족 → 실패', () => {
  it('조건 슬롯을 보유하지 못하면 아이템만 소각되고 실패 로그가 1건 쌓인다', async () => {
    stub.recipes = [recipe({ reward_points: 500 })]
    stub.slots = [...itemSlots(), { recipe_id: 'recipe-1', slot_order: 2, badge_type: 'activity', allowed_badge_ids: [REQ_ACT] }]
    // 보유하지 않음

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(false)
    if (!result.success) expect(result.reason).toBe('no_recipe_match')
    expect(stub.grantedBadgeIds).toEqual([])
    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(stub.destroyedItemIds).toEqual([ITEM_1, ITEM_2])
    expect(stub.failLogs).toHaveLength(1)
    expect(stub.failLogs[0].fail_reason).toBe('no_recipe_match')
    expect(stub.failLogs[0].ingredient_badge_ids).toEqual([BADGE_A, BADGE_B])
  })

  it('아이템 슬롯 후보와 투입 배지가 대응되지 않으면 미매칭된다', async () => {
    stub.recipes = [recipe()]
    stub.slots = [
      { recipe_id: 'recipe-1', slot_order: 0, badge_type: 'item', allowed_badge_ids: [BADGE_A] },
      { recipe_id: 'recipe-1', slot_order: 1, badge_type: 'item', allowed_badge_ids: ['badge-c'] },
    ]

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])
    expect(result.success).toBe(false)
  })

  it('아이템 슬롯 개수와 투입 개수가 다르면 미매칭된다', async () => {
    stub.recipes = [recipe()]
    stub.slots = [
      { recipe_id: 'recipe-1', slot_order: 0, badge_type: 'item', allowed_badge_ids: [BADGE_A] },
      { recipe_id: 'recipe-1', slot_order: 1, badge_type: 'item', allowed_badge_ids: [BADGE_B] },
      { recipe_id: 'recipe-1', slot_order: 2, badge_type: 'item', allowed_badge_ids: ['badge-c'] },
    ]

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])
    expect(result.success).toBe(false)
  })
})

describe('레시피 슬롯 미충족 → 고정 포인트만', () => {
  it('배지를 전혀 지급하지 않고 정책 포인트만 지급하며 실패 로그를 남긴다', async () => {
    stub.recipes = [recipe()]
    stub.slots = [] // 슬롯이 없어 어떤 투입도 충족될 수 없다
    stub.failRewardPoints = 5

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.reason).toBe('no_recipe_match')
      expect(result.pointsAwarded).toBe(5)
    }
    expect(stub.grantedBadgeIds).toEqual([])
    expect(awardPointsMock).toHaveBeenCalledWith(USER, 5, 'combine_fail_reward')
    expect(stub.failLogs).toHaveLength(1)
    expect(stub.failLogs[0].points_awarded).toBe(5)
  })

  it('fail_reward_points가 0이면 포인트도 지급하지 않는다', async () => {
    stub.recipes = [recipe()]
    stub.slots = []
    stub.failRewardPoints = 0

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])
    expect(result.success).toBe(false)
    expect(awardPointsMock).not.toHaveBeenCalled()
  })
})

describe('선택된 레시피가 존재하지 않음 (티켓 20260917_1427)', () => {
  it('recipe_id가 존재하지 않으면 recipe_not_found로 거부하고 소각하지 않는다', async () => {
    stub.recipes = [] // 요청한 레시피가 DB에 없음

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(false)
    if (!result.success) expect(result.reason).toBe('recipe_not_found')
    expect(stub.destroyedItemIds).toEqual([])
    expect(stub.failLogs).toHaveLength(1)
    expect(stub.failLogs[0].fail_reason).toBe('recipe_not_found')
  })

  it('다른 레시피(recipe-2)의 슬롯 구성은 선택되지 않은 레시피라 검증 대상이 아니다', async () => {
    // recipe-1은 슬롯이 없어 미충족, recipe-2는 투입 배지와 완전히 대응되지만 선택 대상이 아니므로 무시된다.
    stub.recipes = [recipe({ id: 'recipe-1' }), recipe({ id: 'recipe-2', reward_points: 999 })]
    stub.slots = itemSlots('recipe-2')

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(false)
    if (!result.success) expect(result.reason).toBe('no_recipe_match')
    expect(awardPointsMock).not.toHaveBeenCalledWith(USER, 999, 'combine_recipe_reward')
  })
})

describe('재료 개수 오류', () => {
  it('10개를 초과해 넣으면 invalid_count로 거부하고 소각하지 않는다(레시피 조회 이전에 차단)', async () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => `item-${i}`)
    const result = await combineRecipeAttempt(USER, 'recipe-1', tooMany)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.reason).toBe('invalid_count')
    expect(stub.destroyedItemIds).toEqual([])
    expect(stub.failLogs).toHaveLength(1)
    expect(stub.failLogs[0].fail_reason).toBe('invalid_count')
  })

  it('같은 아이템 id를 중복 투입하면 invalid_count로 거부한다', async () => {
    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_1])
    expect(result.success).toBe(false)
    if (!result.success) expect(result.reason).toBe('invalid_count')
    expect(stub.destroyedItemIds).toEqual([])
  })
})

describe('인벤토리 used_slots 카운터 (티켓 20260912_2101)', () => {
  it('레시피 매칭 성공 시 소각(-2)과 보상 지급(+1)이 모두 반영된다', async () => {
    stub.usedSlots = 5
    stub.maxSlots = 10
    stub.recipes = [recipe({ reward_badge_ids: [REWARD] })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(true)
    // 소각 직후 5 - 2 = 3, 보상 1개 지급으로 3 + 1 = 4
    expect(stub.usedSlotsHistory).toEqual([3, 4])
    expect(stub.usedSlots).toBe(4)
  })

  it('미매칭(보상 배지 없음) 시 소각분만 반영되고 지급으로 인한 증가는 없다', async () => {
    stub.usedSlots = 5
    stub.maxSlots = 10
    stub.recipes = [recipe()]
    stub.slots = [] // 슬롯이 없어 매칭되지 않음(레시피 자체는 존재)

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(false)
    // 소각 직후 5 - 2 = 3, 지급이 없으므로 추가 반영 없음
    expect(stub.usedSlotsHistory).toEqual([3])
    expect(stub.usedSlots).toBe(3)
  })

  it('소각으로 반환된 칸보다 보상 배지가 많으면 칸이 찬 시점부터 지급을 생략한다', async () => {
    // 조합 전 이미 가득 찬 인벤토리(7/7) — 재료 2개를 소각해 5/7로 여유가 2칸 생기지만,
    // 레시피가 보상 배지 3개를 지정해 세 번째 지급 시점엔 다시 가득 차 지급을 생략해야 한다.
    stub.usedSlots = 7
    stub.maxSlots = 7
    const REWARD_2 = 'badge-reward-2'
    const REWARD_3 = 'badge-reward-3'
    stub.recipes = [recipe({ reward_badge_ids: [REWARD, REWARD_2, REWARD_3] })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(true)
    // 소각 직후 7 - 2 = 5 → 지급 1(=6) → 지급 2(=7, 가득 참) → 지급 3은 생략(칸 미소비)
    expect(stub.usedSlotsHistory).toEqual([5, 6, 7])
    expect(stub.usedSlots).toBe(7)
    expect(stub.grantedBadgeIds).toEqual([REWARD, REWARD_2])
    if (result.success) {
      expect(result.resultBadges).toHaveLength(2)
    }
  })

  it('재료보다 적은 보상 배지는 소각 전보다 used_slots가 순감소한다', async () => {
    stub.usedSlots = 6
    stub.maxSlots = 10
    stub.recipes = [recipe({ reward_badge_ids: [] })] // 배지 없이 포인트만 지급하는 레시피
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(true)
    expect(stub.usedSlotsHistory).toEqual([4])
    expect(stub.usedSlots).toBe(4)
  })
})

describe('성공 기록 — record_combine_success (티켓 20261001_0631)', () => {
  it('레시피가 일치하면 성공 기록 RPC를 1회 부르고 인자에 유저·레시피·재료·결과·포인트를 담는다', async () => {
    stub.recipes = [recipe({ reward_points: 120, reward_badge_ids: [REWARD] })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(true)
    expect(stub.successRpcCalls).toEqual([
      {
        p_user_id: USER,
        p_recipe_id: 'recipe-1',
        p_ingredient_badge_ids: [BADGE_A, BADGE_B],
        p_result_badge_ids: [REWARD],
        p_points_awarded: 120,
      },
    ])
  })

  it('성공 기록은 재료 소각과 보상·포인트 지급이 끝난 뒤에 남는다 — 기존 순서는 그대로다', async () => {
    stub.recipes = [recipe({ reward_points: 120, reward_badge_ids: [REWARD] })]
    stub.slots = itemSlots()

    await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(stub.callOrder).toEqual(['release_inventory_slots', 'grant_inventory_item', 'award_points', 'record_combine_success'])
  })

  it('빈손 성공(보상 배지·포인트가 없는 레시피)도 성공 1건으로 기록한다', async () => {
    stub.recipes = [recipe({ reward_points: 0, reward_badge_ids: [] })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(true)
    expect(stub.successRpcCalls).toHaveLength(1)
    expect(stub.successRpcCalls[0]).toMatchObject({ p_result_badge_ids: [], p_points_awarded: 0 })
  })

  it('보상 배지 지급이 전부 생략된 빈손 성공(인벤토리가 가득 참)도 성공 1건으로 기록한다', async () => {
    // 재료 2개를 소각해도 10 - 2 = 8칸이 차 있어 한도 2를 넘으므로 보상 배지 지급이 생략된다
    stub.usedSlots = 10
    stub.maxSlots = 2
    stub.recipes = [recipe({ reward_badge_ids: [REWARD] })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(true)
    if (result.success) expect(result.resultBadges).toHaveLength(0)
    expect(stub.successRpcCalls).toHaveLength(1)
    expect(stub.successRpcCalls[0]).toMatchObject({ p_result_badge_ids: [] })
  })

  it('레시피가 일치하지 않으면(no_recipe_match) 성공 기록을 남기지 않는다', async () => {
    stub.recipes = [recipe()]
    stub.slots = [] // 어떤 투입도 충족될 수 없다

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(false)
    expect(stub.successRpcCalls).toHaveLength(0)
    expect(stub.failLogs).toHaveLength(1)
  })

  it('소각 전에 끝난 실패(invalid_count·recipe_not_found·items_not_found)는 성공 기록을 남기지 않는다', async () => {
    // invalid_count — 같은 아이템 중복 투입
    const invalid = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_1])
    expect(invalid.success).toBe(false)
    if (!invalid.success) expect(invalid.reason).toBe('invalid_count')

    // recipe_not_found — 없는 레시피
    stub.recipes = []
    const notFound = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])
    expect(notFound.success).toBe(false)
    if (!notFound.success) expect(notFound.reason).toBe('recipe_not_found')

    // items_not_found — 조회된 재료 수가 요청한 수보다 적다(스텁은 항상 2개만 돌려준다)
    stub.recipes = [recipe()]
    stub.slots = itemSlots()
    const missing = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2, 'item-3'])
    expect(missing.success).toBe(false)
    if (!missing.success) expect(missing.reason).toBe('items_not_found')

    expect(stub.successRpcCalls).toHaveLength(0)
    expect(stub.destroyedItemIds).toEqual([])
  })

  it('성공 기록 RPC가 오류를 돌려줘도 success: true와 보상은 그대로다', async () => {
    stub.successRpcError = { message: 'function record_combine_success does not exist' }
    stub.recipes = [recipe({ reward_points: 120, reward_badge_ids: [REWARD] })]
    stub.slots = itemSlots()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.resultBadges.map((b) => b.id)).toEqual([REWARD])
      expect(result.pointsAwarded).toBe(120)
    }
    expect(stub.grantedBadgeIds).toEqual([REWARD])
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('성공 기록 RPC 호출이 예외로 거부돼도 success: true와 보상은 그대로다', async () => {
    stub.successRpcThrows = true
    stub.recipes = [recipe({ reward_points: 120, reward_badge_ids: [REWARD] })]
    stub.slots = itemSlots()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(true)
    if (result.success) expect(result.pointsAwarded).toBe(120)
    expect(stub.grantedBadgeIds).toEqual([REWARD])
    consoleError.mockRestore()
  })

  it('같은 레시피를 동시에 성공해도 최초 성공(true)은 1개다', async () => {
    stub.recipes = [recipe({ reward_badge_ids: [REWARD] })]
    stub.slots = itemSlots()
    const [a, b] = await Promise.all([
      combineRecipeAttempt('user-a', 'recipe-1', [ITEM_1, ITEM_2]),
      combineRecipeAttempt('user-b', 'recipe-1', [ITEM_1, ITEM_2]),
    ])

    expect(a.success && b.success).toBe(true)
    expect(stub.successRpcCalls).toHaveLength(2)
    expect(stub.successRpcResults).toHaveLength(2)
    expect(stub.successRpcResults.filter(Boolean)).toHaveLength(1)
    expect(stub.firstSuccessRecipeIds).toEqual(['recipe-1'])
  })
})

describe('jamTriggersForCombineResult — 결과별로 다시 판정할 지표', () => {
  it('성공은 시도·성공·레시피 최초 성공', () => {
    const result: CombineResult = { success: true, path: 'recipe', resultBadges: [], pointsAwarded: 0 }
    expect(jamTriggersForCombineResult(result)).toEqual([
      'combine_attempt_count',
      'combine_success_count',
      'recipe_first_success',
    ])
  })

  it('no_recipe_match는 시도·실패', () => {
    expect(jamTriggersForCombineResult({ success: false, reason: 'no_recipe_match', pointsAwarded: 5 })).toEqual([
      'combine_attempt_count',
      'combine_fail_count',
    ])
  })

  it.each(['invalid_count', 'items_not_found', 'recipe_not_found'] as const)(
    '%s는 재료가 소각되기 전에 끝난 실패라 판정하지 않는다',
    (reason) => {
      expect(jamTriggersForCombineResult({ success: false, reason, pointsAwarded: 0 })).toEqual([])
    }
  )
})
