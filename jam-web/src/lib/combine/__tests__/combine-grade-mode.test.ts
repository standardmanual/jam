/**
 * combineRecipeAttempt() — 등급 대응형 레시피와 첫 성공자 보상 (티켓 20261114_1705 1회차, 마이그레이션 340)
 *
 * 검증 대상:
 *  1) 등급 대응형: 재료를 모두 같은 등급으로 넣으면 같은 등급의 결과만 나온다(Common·Rare·Epic·Mystic 모두)
 *  2) 재료 등급이 섞이면 소각·포인트·실패 기록·성공 기록·결과 지급 없이 `mixed_grade_not_allowed`로 거절한다
 *  3) 같은 등급이라도 레시피의 아이템 묶음이 아니면 지금처럼 `no_recipe_match`(소각 + 실패 보상)다
 *  4) 등급 고정형(`fixed`·칸 없음)은 등급을 따지지 않고 지금과 똑같이 동작한다
 *  5) 첫 성공자 보상: 성공 기록 RPC의 `is_recipe_first`가 참일 때만 지정 배지를 한 번 준다. 빈칸이 모자라거나 일반 결과가 받지 않은 결과로
 *     남았으면 받지 않은 결과로 담는다. 동시에 둘이 성공해도 한 번만 준다. 지급이 실패해도 믹스 응답은 그대로다
 *
 * 일반 믹스 엔진 전체 시험은 `combine-engine.test.ts`가 고정한다. 이 파일은 새 갈래만 본다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/combine/__tests__/combine-grade-mode.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const USER = 'user-1'
const RECIPE = 'recipe-1'
const FIRST_BADGE = 'first-success-badge'
const GRADES = ['common', 'rare', 'epic', 'mystic'] as const

/** 배지 id 규칙: `sign-<등급>`(칸 번호 팻말 묶음), `lamp-<등급>`(가로등 묶음), `result-<등급>`(결과 묶음), `other-<등급>`(레시피에 없는 묶음) */
const badgeId = (bundle: string, grade: string) => `${bundle}-${grade}`

const stub = vi.hoisted(() => ({
  recipe: null as Record<string, unknown> | null,
  slots: [] as { recipe_id: string; slot_order: number; badge_type: string; allowed_badge_ids: string[] }[],
  /** 투입 개체 id → 배지 id */
  inventoryItems: {} as Record<string, string>,
  /** 소각 요청이 들어온 개체 id */
  burned: [] as string[],
  failLogs: [] as Record<string, unknown>[],
  grantResultCalls: [] as Record<string, unknown>[],
  /** 일반 결과를 지급할 때 인벤토리 빈칸이 모자란지 */
  inventoryFull: false,
  successRpcCalls: [] as Record<string, unknown>[],
  firstSuccessRecipeIds: [] as string[],
  firstGrantCalls: [] as Record<string, unknown>[],
  /** `combine_grant_first_success` RPC 오류. null이면 정상 */
  firstGrantError: null as { message: string } | null,
  /** 이 호출에서 인벤토리 빈칸이 없는 것으로 흉내낼지(첫 성공자 보상만) */
  firstGrantNoFreeSlot: false,
  callOrder: [] as string[],
}))

const awardPointsMock = vi.hoisted(() => vi.fn())
const followUpMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/points', () => ({
  awardPoints: (userId: string, amount: number, reason: string) => {
    stub.callOrder.push('award_points')
    return awardPointsMock(userId, amount, reason)
  },
}))
vi.mock('@/lib/combine/resultPointFollowUp', () => ({
  followUpCombineResultPoints: (...args: unknown[]) => followUpMock(...args),
}))
vi.mock('@/lib/combine/policy', () => ({ getCombinePolicy: async () => ({ fail_reward_points: 7 }) }))
vi.mock('@/lib/combine/pending', () => ({ getPendingCount: async () => 0 }))
vi.mock('@/lib/suspension/suspension', () => ({ assertNotSuspended: async () => undefined }))
vi.mock('@/lib/inventory/slotAlert', () => ({ notifyInventorySlotsLow: async () => undefined }))
vi.mock('@/lib/chapter/mix', () => ({
  awardMixSuccessScore: async () => undefined,
  recordMixScoreFailure: async () => undefined,
}))
vi.mock('@/lib/combine/burn', () => ({
  burnMaterials: async (_supabase: unknown, args: { itemIds: string[] }) => {
    stub.callOrder.push('burn')
    stub.burned.push(...args.itemIds)
    return { ok: true }
  },
}))

async function rpcStub(fnName: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> {
  stub.callOrder.push(fnName)
  if (fnName === 'combine_grant_results') {
    stub.grantResultCalls.push(args)
    const ids = args.p_badge_ids as string[]
    if (stub.inventoryFull) {
      return { data: { ok: true, status: 'pending', itemIds: [], pendingCount: ids.length, free: 0, needed: ids.length }, error: null }
    }
    return { data: { ok: true, status: 'granted', itemIds: ids.map((_, i) => `granted-${i}`), pendingCount: 0 }, error: null }
  }
  if (fnName === 'record_combine_success_with_id') {
    stub.successRpcCalls.push(args)
    // 부분 유일 인덱스처럼 동기 확인·기록 한 번이라 동시 호출에서도 정확히 한 번만 true다
    const recipeId = args.p_recipe_id as string
    const isFirst = !stub.firstSuccessRecipeIds.includes(recipeId)
    if (isFirst) stub.firstSuccessRecipeIds.push(recipeId)
    return { data: { id: `log-${stub.successRpcCalls.length}`, is_recipe_first: isFirst }, error: null }
  }
  if (fnName === 'combine_grant_first_success') {
    stub.firstGrantCalls.push(args)
    if (stub.firstGrantError) return { data: null, error: stub.firstGrantError }
    const pending = args.p_force_pending === true || stub.firstGrantNoFreeSlot
    return pending
      ? { data: { ok: true, status: 'pending', itemId: null, free: 0 }, error: null }
      : { data: { ok: true, status: 'granted', itemId: 'first-item-1' }, error: null }
  }
  return { data: null, error: null }
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: (): SupabaseClient =>
    ({
      from: (table: string) => makeBuilder(table),
      rpc: (fnName: string, args: Record<string, unknown>) => rpcStub(fnName, args),
    }) as unknown as SupabaseClient,
}))

function makeBuilder(table: string) {
  const state: { op: 'select' | 'insert'; payload?: unknown; eq: Record<string, unknown>; in: Record<string, unknown> } = {
    op: 'select',
    eq: {},
    in: {},
  }
  const resolve = async (): Promise<{ data: unknown; error: unknown }> => {
    if (state.op === 'insert') {
      if (table === 'user_combine_fail_logs') stub.failLogs.push(state.payload as Record<string, unknown>)
      return { data: null, error: null }
    }
    switch (table) {
      case 'combination_recipes':
        return { data: stub.recipe, error: null }
      case 'combination_recipe_slots':
        return { data: stub.slots, error: null }
      case 'inventory':
        return { data: { id: 'inv-1', used_slots: 5, max_slots: 10 }, error: null }
      case 'inventory_items': {
        const requested = (state.in.id as string[] | undefined) ?? []
        return {
          data: requested.filter((id) => id in stub.inventoryItems).map((id) => ({ id, badge_id: stub.inventoryItems[id], locked: false })),
          error: null,
        }
      }
      case 'badges': {
        const ids = (state.in.id as string[] | undefined) ?? (state.eq.id ? [state.eq.id as string] : [])
        const rows = ids.map((id) => {
          const grade = GRADES.find((g) => id.endsWith(`-${g}`)) ?? 'rare'
          return { id, name: `배지 ${id}`, rarity: grade, always_locked: false, valid_until: null, image_url: `https://img.test/${id}.png` }
        })
        // `.maybeSingle()` 조회(첫 성공자 보상 배지 1개)는 한 줄을 돌려준다
        return { data: state.eq.id ? (rows[0] ?? null) : rows, error: null }
      }
      default:
        return { data: null, error: null }
    }
  }
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      state.eq[column] = value
      return builder
    },
    in: (column: string, values: unknown) => {
      state.in[column] = values
      return builder
    },
    is: () => builder,
    order: () => builder,
    single: resolve,
    maybeSingle: resolve,
    insert: (payload: unknown) => {
      state.op = 'insert'
      state.payload = payload
      return builder
    },
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => resolve().then(onFulfilled, onRejected),
  }
  return builder
}

import { combineRecipeAttempt, jamTriggersForCombineResult } from '../index'

/** 등급 대응형 레시피 — 재료 슬롯 2개(팻말·가로등 묶음, 4등급 모두), 결과는 결과 묶음의 4등급 */
function followRecipe(overrides: Record<string, unknown> = {}) {
  return {
    id: RECIPE,
    name: '칸 번호 팻말',
    grade_mode: 'follow_materials',
    reward_points: 120,
    reward_badge_ids: GRADES.map((g) => badgeId('result', g)),
    valid_from: null,
    valid_until: null,
    reward_locked: false,
    first_success_badge_id: null,
    created_at: '2026-11-14T00:00:00.000Z',
    ...overrides,
  }
}

function followSlots() {
  return [
    { recipe_id: RECIPE, slot_order: 0, badge_type: 'item', allowed_badge_ids: GRADES.map((g) => badgeId('sign', g)) },
    { recipe_id: RECIPE, slot_order: 1, badge_type: 'item', allowed_badge_ids: GRADES.map((g) => badgeId('lamp', g)) },
  ]
}

function loadFollow(overrides: Record<string, unknown> = {}) {
  stub.recipe = followRecipe(overrides)
  stub.slots = followSlots()
}

beforeEach(() => {
  stub.recipe = null
  stub.slots = []
  stub.inventoryItems = {}
  stub.burned = []
  stub.failLogs = []
  stub.grantResultCalls = []
  stub.inventoryFull = false
  stub.successRpcCalls = []
  stub.firstSuccessRecipeIds = []
  stub.firstGrantCalls = []
  stub.firstGrantError = null
  stub.firstGrantNoFreeSlot = false
  stub.callOrder = []
  awardPointsMock.mockReset()
  awardPointsMock.mockResolvedValue({ id: 'tx-1' })
  followUpMock.mockReset()
  followUpMock.mockResolvedValue(undefined)
})

describe('등급 대응형 — 재료 등급을 따라 결과가 나온다', () => {
  it.each(GRADES)('재료를 모두 %s로 넣으면 %s 결과만 지급한다', async (grade) => {
    loadFollow()
    stub.inventoryItems = { 'item-1': badgeId('sign', grade), 'item-2': badgeId('lamp', grade) }

    const result = await combineRecipeAttempt(USER, RECIPE, ['item-1', 'item-2'])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.resultBadges.map((b) => b.id)).toEqual([badgeId('result', grade)])
      expect(result.resultBadges[0].rarity).toBe(grade)
      expect(result.pointsAwarded).toBe(120)
    }
    expect(stub.grantResultCalls).toHaveLength(1)
    expect(stub.grantResultCalls[0].p_badge_ids).toEqual([badgeId('result', grade)])
    expect(stub.burned).toEqual(['item-1', 'item-2'])
    expect(stub.failLogs).toHaveLength(0)
    // 성공 기록에는 지급된 결과 배지(그 등급)가 남는다
    expect(stub.successRpcCalls[0].p_result_badge_ids).toEqual([badgeId('result', grade)])
  })

  it('보상 배지 묶음이 둘이면 그 등급의 두 배지를 묶음 순서대로 지급한다', async () => {
    stub.recipe = followRecipe({
      reward_badge_ids: [...GRADES.map((g) => badgeId('result', g)), ...GRADES.map((g) => badgeId('extra', g))],
    })
    stub.slots = followSlots()
    stub.inventoryItems = { 'item-1': badgeId('sign', 'epic'), 'item-2': badgeId('lamp', 'epic') }

    await combineRecipeAttempt(USER, RECIPE, ['item-1', 'item-2'])

    expect(stub.grantResultCalls[0].p_badge_ids).toEqual([badgeId('result', 'epic'), badgeId('extra', 'epic')])
  })
})

describe('등급 대응형 — 재료 등급이 섞이면 거절한다', () => {
  it('재료·포인트·기록을 건드리지 않고 mixed_grade_not_allowed로 거절한다', async () => {
    loadFollow()
    stub.inventoryItems = { 'item-1': badgeId('sign', 'common'), 'item-2': badgeId('lamp', 'rare') }

    const result = await combineRecipeAttempt(USER, RECIPE, ['item-1', 'item-2'])

    expect(result).toEqual({ success: false, reason: 'mixed_grade_not_allowed', pointsAwarded: 0 })
    // 소각 전에 끝난다
    expect(stub.burned).toEqual([])
    expect(stub.callOrder).not.toContain('burn')
    // 실패 보상·실패 기록·성공 기록·결과 지급이 없다
    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(stub.failLogs).toHaveLength(0)
    expect(stub.successRpcCalls).toHaveLength(0)
    expect(stub.grantResultCalls).toHaveLength(0)
    expect(stub.firstGrantCalls).toHaveLength(0)
  })

  it('섞임 거절은 JAM! 행동 지표를 판정하지 않는다', async () => {
    expect(jamTriggersForCombineResult({ success: false, reason: 'mixed_grade_not_allowed', pointsAwarded: 0 })).toEqual([])
  })

  it('같은 등급이어도 레시피의 아이템 묶음이 아니면 지금처럼 no_recipe_match(소각 + 실패 보상)다', async () => {
    loadFollow()
    stub.inventoryItems = { 'item-1': badgeId('sign', 'rare'), 'item-2': badgeId('other', 'rare') }

    const result = await combineRecipeAttempt(USER, RECIPE, ['item-1', 'item-2'])

    expect(result.success).toBe(false)
    if (!result.success) expect(result.reason).toBe('no_recipe_match')
    expect(stub.burned).toEqual(['item-1', 'item-2'])
    expect(awardPointsMock).toHaveBeenCalledWith(USER, 7, 'combine_fail_reward')
    expect(stub.failLogs).toHaveLength(1)
  })
})

describe('등급 고정형 — 지금과 똑같이 동작한다', () => {
  function loadFixed(gradeMode?: string) {
    stub.recipe = followRecipe({
      ...(gradeMode ? { grade_mode: gradeMode } : {}),
      reward_badge_ids: [badgeId('result', 'common')],
    })
    if (!gradeMode) delete (stub.recipe as Record<string, unknown>).grade_mode
    stub.slots = [
      { recipe_id: RECIPE, slot_order: 0, badge_type: 'item', allowed_badge_ids: [badgeId('sign', 'common')] },
      { recipe_id: RECIPE, slot_order: 1, badge_type: 'item', allowed_badge_ids: [badgeId('lamp', 'rare')] },
    ]
  }

  it.each([['fixed'], [undefined]])('grade_mode가 %s이면 슬롯이 가리킨 배지를 등급이 달라도 받고 보상 배지를 그대로 준다', async (mode) => {
    loadFixed(mode)
    // 재료 등급이 서로 달라도(Common + Rare) 슬롯이 그렇게 지정했으므로 매칭된다 — 섞임 거절은 등급 대응형에만 있다
    stub.inventoryItems = { 'item-1': badgeId('sign', 'common'), 'item-2': badgeId('lamp', 'rare') }

    const result = await combineRecipeAttempt(USER, RECIPE, ['item-1', 'item-2'])

    expect(result.success).toBe(true)
    expect(stub.grantResultCalls[0].p_badge_ids).toEqual([badgeId('result', 'common')])
  })

  it('등급 고정형은 첫 성공자 보상 칸이 없으면 보상을 부르지 않는다', async () => {
    loadFixed('fixed')
    stub.inventoryItems = { 'item-1': badgeId('sign', 'common'), 'item-2': badgeId('lamp', 'rare') }

    await combineRecipeAttempt(USER, RECIPE, ['item-1', 'item-2'])

    expect(stub.firstGrantCalls).toHaveLength(0)
  })
})

describe('첫 성공자 보상', () => {
  function loadWithFirstBadge(extra: Record<string, unknown> = {}) {
    loadFollow({ first_success_badge_id: FIRST_BADGE, ...extra })
    stub.inventoryItems = { 'item-1': badgeId('sign', 'rare'), 'item-2': badgeId('lamp', 'rare') }
  }

  it('첫 성공이면 일반 결과와 함께 지정한 배지를 받고, 두 번째 성공부터는 받지 않는다', async () => {
    loadWithFirstBadge()

    const first = await combineRecipeAttempt(USER, RECIPE, ['item-1', 'item-2'])
    const second = await combineRecipeAttempt('user-2', RECIPE, ['item-1', 'item-2'])

    expect(first.success).toBe(true)
    if (first.success) {
      expect(first.resultBadges.map((b) => b.id)).toEqual([badgeId('result', 'rare')])
      expect(first.firstSuccessReward?.status).toBe('granted')
      expect(first.firstSuccessReward?.badge?.id).toBe(FIRST_BADGE)
      // 결과 오버레이가 보상 카드의 그림을 그리도록 응답에 그림 주소가 실린다(티켓 20261114_1705 3회)
      expect(first.firstSuccessReward?.badge?.imageUrl).toBe(`https://img.test/${FIRST_BADGE}.png`)
    }
    expect(second.success).toBe(true)
    if (second.success) expect(second.firstSuccessReward).toBeUndefined()
    expect(stub.firstGrantCalls).toHaveLength(1)
    expect(stub.firstGrantCalls[0]).toMatchObject({ p_user_id: USER, p_recipe_id: RECIPE, p_badge_id: FIRST_BADGE, p_force_pending: false })
    // 성공 기록 → 첫 성공자 보상 순서다(기록 RPC가 첫 성공을 정한다)
    expect(stub.callOrder.indexOf('record_combine_success_with_id')).toBeLessThan(stub.callOrder.indexOf('combine_grant_first_success'))
  })

  it('첫 성공자 보상 배지는 재료 등급과 상관없이 지정한 한 장만 준다', async () => {
    loadWithFirstBadge()
    stub.inventoryItems = { 'item-1': badgeId('sign', 'mystic'), 'item-2': badgeId('lamp', 'mystic') }

    await combineRecipeAttempt(USER, RECIPE, ['item-1', 'item-2'])

    expect(stub.firstGrantCalls).toHaveLength(1)
    expect(stub.firstGrantCalls[0].p_badge_id).toBe(FIRST_BADGE)
  })

  it('보상 배지를 지정하지 않은 레시피는 첫 성공이어도 보상을 부르지 않는다', async () => {
    loadFollow()
    stub.inventoryItems = { 'item-1': badgeId('sign', 'rare'), 'item-2': badgeId('lamp', 'rare') }

    const result = await combineRecipeAttempt(USER, RECIPE, ['item-1', 'item-2'])

    expect(result.success).toBe(true)
    if (result.success) expect(result.firstSuccessReward).toBeUndefined()
    expect(stub.firstGrantCalls).toHaveLength(0)
  })

  it('인벤토리 빈칸이 모자라면 첫 성공자 보상 배지도 받지 않은 결과로 담는다', async () => {
    loadWithFirstBadge()
    stub.firstGrantNoFreeSlot = true

    const result = await combineRecipeAttempt(USER, RECIPE, ['item-1', 'item-2'])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.resultStatus).toBe('granted')
      expect(result.firstSuccessReward).toEqual({ status: 'pending' })
    }
  })

  it('일반 결과가 받지 않은 결과로 남았으면 첫 성공자 보상도 먼저 들어가지 않고 받지 않은 결과로 남긴다', async () => {
    loadWithFirstBadge()
    stub.inventoryFull = true

    const result = await combineRecipeAttempt(USER, RECIPE, ['item-1', 'item-2'])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.resultStatus).toBe('pending')
      expect(result.firstSuccessReward).toEqual({ status: 'pending' })
    }
    expect(stub.firstGrantCalls[0].p_force_pending).toBe(true)
  })

  it('동시에 둘이 성공해도 첫 성공자 보상은 한 번만 지급된다', async () => {
    loadWithFirstBadge()

    const [a, b] = await Promise.all([
      combineRecipeAttempt(USER, RECIPE, ['item-1', 'item-2']),
      combineRecipeAttempt('user-2', RECIPE, ['item-1', 'item-2']),
    ])

    const rewarded = [a, b].filter((r) => r.success && r.firstSuccessReward)
    expect(rewarded).toHaveLength(1)
    expect(stub.firstGrantCalls).toHaveLength(1)
  })

  it('지급 RPC가 실패해도 믹스 응답과 일반 결과는 그대로다', async () => {
    loadWithFirstBadge()
    stub.firstGrantError = { message: 'rpc down' }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const result = await combineRecipeAttempt(USER, RECIPE, ['item-1', 'item-2'])
    errorSpy.mockRestore()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.resultBadges.map((b) => b.id)).toEqual([badgeId('result', 'rare')])
      expect(result.firstSuccessReward).toBeUndefined()
    }
  })

  it('섞임 거절·미매칭은 첫 성공이 아니므로 보상도 기록도 없다', async () => {
    loadWithFirstBadge()
    stub.inventoryItems = { 'item-1': badgeId('sign', 'common'), 'item-2': badgeId('lamp', 'rare') }

    await combineRecipeAttempt(USER, RECIPE, ['item-1', 'item-2'])

    expect(stub.successRpcCalls).toHaveLength(0)
    expect(stub.firstGrantCalls).toHaveLength(0)
    expect(stub.firstSuccessRecipeIds).toEqual([])
  })
})
