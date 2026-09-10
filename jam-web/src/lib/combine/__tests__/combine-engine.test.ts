/**
 * combineItems() v3 — 레시피 확정 보상 / 보유 조건 / 미매칭 고정 포인트 (티켓 20260910_1408)
 *
 * 검증 대상:
 *  1) 재료 정확 일치 + 보유 조건 충족 → reward_points와 reward_badge_ids 전부 100% 지급
 *  2) 보유 조건 미충족 → 실패로 처리되고 **아이템만 소각**되며 실패 로그가 1건 쌓인다
 *  3) 미매칭 → 배지 없이 정책의 고정 포인트만 지급 + 실패 로그 적재
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
  ingredient_badge_ids: string[]
  required_badge_ids: string[]
  reward_points: number
  reward_badge_ids: string[]
  hint_text: string | null
  is_public: boolean
  created_at: string
}

const stub = vi.hoisted(() => ({
  recipes: [] as unknown[],
  /** 유저가 보유한 액티비티 배지 id */
  ownedActivityBadgeIds: [] as string[],
  ownedCheckinBadgeIds: [] as string[],
  failLogs: [] as Record<string, unknown>[],
  grantedBadgeIds: [] as string[],
  destroyedItemIds: [] as string[],
  failRewardPoints: 0,
}))

const awardPointsMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/points', () => ({
  awardPoints: (userId: string, amount: number, reason: string) =>
    awardPointsMock(userId, amount, reason),
}))

vi.mock('@/lib/combine/policy', () => ({
  getCombinePolicy: async () => ({ fail_reward_points: stub.failRewardPoints }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: (): SupabaseClient => ({
    from: (table: string) => makeBuilder(table),
  }) as unknown as SupabaseClient,
}))

/**
 * `.from(t).select().eq()...`를 자유롭게 이어 붙일 수 있고, await 시점에 테이블·연산에 맞는
 * 결과를 돌려주는 최소 스텁. 체이닝 순서는 검증하지 않는다(엔진의 결과 분기만 본다).
 */
function makeBuilder(table: string) {
  const state: { op: 'select' | 'insert' | 'update'; payload?: unknown } = { op: 'select' }

  const resolve = async (): Promise<{ data: unknown; error: unknown }> => {
    if (state.op === 'insert') {
      if (table === 'user_combine_fail_logs') {
        stub.failLogs.push(state.payload as Record<string, unknown>)
      }
      if (table === 'inventory_items') {
        const payload = state.payload as { badge_id: string }
        stub.grantedBadgeIds.push(payload.badge_id)
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
        return { data: { id: INVENTORY_ID }, error: null }
      case 'inventory_items':
        return {
          data: [
            { id: ITEM_1, badge_id: BADGE_A },
            { id: ITEM_2, badge_id: BADGE_B },
          ],
          error: null,
        }
      case 'combination_recipes':
        return { data: stub.recipes, error: null }
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
    eq: () => builder,
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

import { combineItems } from '../index'

function recipe(overrides: Partial<RecipeStub> = {}): RecipeStub {
  return {
    id: 'recipe-1',
    ingredient_badge_ids: [BADGE_A, BADGE_B],
    required_badge_ids: [],
    reward_points: 0,
    reward_badge_ids: [REWARD],
    hint_text: null,
    is_public: false,
    created_at: '2026-09-10T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  stub.recipes = []
  stub.ownedActivityBadgeIds = []
  stub.ownedCheckinBadgeIds = []
  stub.failLogs = []
  stub.grantedBadgeIds = []
  stub.destroyedItemIds = []
  stub.failRewardPoints = 0
  awardPointsMock.mockReset()
  awardPointsMock.mockResolvedValue({ id: 'tx-1' })
})

describe('레시피 정확 매칭 → 확정 보상', () => {
  it('보상 배지와 포인트를 모두 지급한다 (확률 없음)', async () => {
    stub.recipes = [recipe({ reward_points: 120, reward_badge_ids: [REWARD] })]

    const result = await combineItems(USER, [ITEM_1, ITEM_2])

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

    const result = await combineItems(USER, [ITEM_1, ITEM_2])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.resultBadges).toHaveLength(0)
      expect(result.pointsAwarded).toBe(30)
    }
    expect(stub.grantedBadgeIds).toEqual([])
  })

  it('보유 조건(액티비티 배지)을 가진 유저는 매칭된다', async () => {
    stub.recipes = [recipe({ required_badge_ids: [REQ_ACT] })]
    stub.ownedActivityBadgeIds = [REQ_ACT]

    const result = await combineItems(USER, [ITEM_1, ITEM_2])
    expect(result.success).toBe(true)
  })

  it('보유 조건이 체크인 배지여도 보유하면 매칭된다', async () => {
    stub.recipes = [recipe({ required_badge_ids: [REQ_ACT] })]
    stub.ownedCheckinBadgeIds = [REQ_ACT]

    const result = await combineItems(USER, [ITEM_1, ITEM_2])
    expect(result.success).toBe(true)
  })
})

describe('보유 조건 미충족 → 실패', () => {
  it('아이템만 소각되고 배지·포인트를 주지 않으며 실패 로그가 1건 쌓인다', async () => {
    stub.recipes = [recipe({ required_badge_ids: [REQ_ACT], reward_points: 500 })]
    // 보유하지 않음

    const result = await combineItems(USER, [ITEM_1, ITEM_2])

    expect(result.success).toBe(false)
    if (!result.success) expect(result.reason).toBe('no_recipe_match')
    expect(stub.grantedBadgeIds).toEqual([])
    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(stub.destroyedItemIds).toEqual([ITEM_1, ITEM_2])
    expect(stub.failLogs).toHaveLength(1)
    expect(stub.failLogs[0].fail_reason).toBe('no_recipe_match')
    expect(stub.failLogs[0].ingredient_badge_ids).toEqual([BADGE_A, BADGE_B])
  })
})

describe('레시피 미매칭 → 고정 포인트만', () => {
  it('배지를 전혀 지급하지 않고 정책 포인트만 지급하며 실패 로그를 남긴다', async () => {
    stub.recipes = []
    stub.failRewardPoints = 5

    const result = await combineItems(USER, [ITEM_1, ITEM_2])

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
    stub.recipes = []
    stub.failRewardPoints = 0

    const result = await combineItems(USER, [ITEM_1, ITEM_2])
    expect(result.success).toBe(false)
    expect(awardPointsMock).not.toHaveBeenCalled()
  })
})

describe('재료 매칭은 배지 종류 집합 비교 — 중복 재료 레시피는 미지원', () => {
  it('재료 종류가 다르면 매칭되지 않는다', async () => {
    stub.recipes = [recipe({ ingredient_badge_ids: [BADGE_A, 'badge-c'] })]

    const result = await combineItems(USER, [ITEM_1, ITEM_2])
    expect(result.success).toBe(false)
  })

  it('같은 배지를 2회 요구하는 레시피는 집합상 1종이라 2종 투입과 매칭되지 않는다', async () => {
    // 저장 단계(normalizeRecipePayload)가 중복 재료를 거부하는 것이 정본 사양이고,
    // 엔진도 집합 비교라 이런 행이 있어도 매칭되지 않는다.
    stub.recipes = [recipe({ ingredient_badge_ids: [BADGE_A, BADGE_A] })]

    const result = await combineItems(USER, [ITEM_1, ITEM_2])
    expect(result.success).toBe(false)
  })
})

describe('재료 개수 오류', () => {
  it('1개만 넣으면 invalid_count로 거부하고 소각하지 않는다', async () => {
    const result = await combineItems(USER, [ITEM_1])
    expect(result.success).toBe(false)
    if (!result.success) expect(result.reason).toBe('invalid_count')
    expect(stub.destroyedItemIds).toEqual([])
    expect(stub.failLogs).toHaveLength(1)
    expect(stub.failLogs[0].fail_reason).toBe('invalid_count')
  })
})
