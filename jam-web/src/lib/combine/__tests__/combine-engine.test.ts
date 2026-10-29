/**
 * combineRecipeAttempt() v5 — 레시피 선택형 단일 검증 (티켓 20260917_1427)
 *
 * 검증 대상:
 *  1) 아이템 슬롯 대응 + 조건 슬롯(액티비티·체크인) 보유 → reward_points·reward_badge_ids 전부 지급
 *  2) 슬롯 하나라도 미충족 → 실패로 처리되고 **아이템만 소각**되며 실패 로그가 1건 쌓인다
 *  3) 존재하지 않는 recipe_id → recipe_not_found로 거부(소각 없음). 공개 시각(valid_from)이 아직
 *     지나지 않은 레시피도 같다(티켓 20261001_1157) — 소각·포인트 지급 없이 실패 이력 1건
 *  4) 전체 레시피 스캔이 사라졌으므로 선택되지 않은 레시피가 매칭되지 않는다
 *  5) 성공 기록(티켓 20261001_0631) — 성공 갈래에서만 `record_combine_success` RPC를 1회 부른다(빈손 성공 포함).
 *     소각 전 실패·`no_recipe_match`는 성공 기록을 남기지 않고, RPC 오류·예외가 나도 응답과 보상은 그대로다
 *  6) `jamTriggersForCombineResult` — 결과별로 다시 판정할 JAM! 행동 지표
 *  7) 운영자 시험 믹스(티켓 20261001_1159) — `allowUnreleased`인 운영자가 공개 전 레시피를 믹스하면 재료 소각·
 *     보상·위로 포인트는 실제와 같고 성공·실패 기록과 지표 판정은 남지 않는다(`testMix: true`).
 *     공개 후 레시피는 운영자가 믹스해도 일반 믹스다
 *  8) 종료 시각(valid_until, 티켓 20261002_0710) — 종료된 레시피는 일반 유저·운영자 모두 recipe_not_found이고
 *     재료 소각이 없다(종료 시각 그 순간부터). 종료 시각이 비어 있거나 칸이 없는 응답은 동작이 같다
 *
 *  9) JAM 2.0 믹스 고치기(티켓 20261018_0055) — 믹스 칸 5, 이용 정지(소각 전 던짐), 받지 않은 결과가 있으면 소각 전 거절,
 *     결과 지급은 `combine_grant_results` 한 번(기한 없음·잠김은 레시피가 정함), 빈칸이 모자라면 받지 않은 결과로 남김,
 *     결과 배지의 공개 기간이 끝난 레시피는 소각 전 거절
 *
 * 10) 결과 아이템 배지의 배지 포인트(티켓 20261019_1314 2회) — 결과를 바로 지급(`granted`)했을 때만 지급된 개체 id로 후속
 *     (`followUpCombineResultPoints`)을 한 번 부른다. 받지 않은 결과·지급 실패·미매칭·거절에서는 부르지 않고, 응답의 `pointsAwarded`는
 *     레시피 보상 포인트 그대로다. 후속 본체(열린 개체·잠긴 개체·중복 방지)는 `result-point-follow-up.test.ts`가 고정한다
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
  /** 결과를 잠긴 채 지급할지(마이그레이션 236) — 칸이 없는 응답은 열림으로 본다 */
  reward_locked?: boolean
  reward_points: number
  reward_badge_ids: string[]
  /** 공개 시각 — null이면 처음부터 공개(마이그레이션 204) */
  valid_from: string | null
  /** 종료 시각 — null이면 종료 없음, 칸이 없는 응답(마이그레이션 213 전 환경)은 생략(undefined) */
  valid_until?: string | null
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
  /** 잠긴 개체 id(`inventory_items.locked = true`, 티켓 20261018_0051) */
  lockedItemIds: [] as string[],
  /** 이용 정지 중인 유저(`user_suspensions`에 진행 중인 정지가 있다) */
  suspended: false,
  /** DB의 `combine_pending_results`(status = pending) 행 — `combine_grant_results`가 빈칸이 모자라면 쌓는다 */
  pendingResults: [] as { badge_id: string; recipe_id: string; locked: boolean }[],
  /** `combine_grant_results` 호출 인자 */
  grantResultCalls: [] as Record<string, unknown>[],
  /** `combine_grant_results`가 돌려줄 RPC 오류. null이면 정상 */
  grantRpcError: null as { message: string } | null,
  /** 결과 배지의 공개 종료 시각(`badges.valid_until`) — null이면 종료 없음 */
  badgeValidUntil: null as string | null,
  /** 잠김으로 만든 배지(`badges.always_locked`) id */
  alwaysLockedBadgeIds: [] as string[],
  /** 지급된 개체(`generated-item-N`)의 `inventory_items.unlock_required` — 잠긴 결과의 필요한 양 */
  unlockRequiredByItemId: {} as Record<string, number>,
  /** 필요한 양을 읽다가 나는 DB 오류 — null이면 정상 */
  unlockReadError: null as { message: string } | null,
  /** inventory.used_slots — 조합 전 초기값. 소각/지급마다 이 값이 갱신된다(20260912_2101). */
  usedSlots: 5,
  maxSlots: 10,
  usedSlotsHistory: [] as number[],
  // ── 성공 기록(record_combine_success_with_id, 티켓 20261001_0631·20261019_1315) ────────────────
  successRpcCalls: [] as Record<string, unknown>[],
  /** RPC가 돌려준 성공 행 id 모음(호출마다 새 UUID) */
  successLogIds: [] as string[],
  /** 설정하면 RPC가 오류 없이 이 값을 그대로 돌려준다(계약 밖 응답 흉내). undefined면 `{ id, is_recipe_first }` */
  successRpcData: undefined as unknown,
  // ── 서비스 활동 잼(jam_apply_service_activity, 티켓 20261019_1315 3회 → 20261028_1735 2회에서 점수에서 전환) ────────────────
  serviceJamCalls: [] as Record<string, unknown>[],
  /** `jam_apply_service_activity`가 돌려줄 RPC 오류. null이면 정상 */
  serviceJamError: null as { message: string } | null,
  /** true면 `jam_apply_service_activity` 호출이 예외로 거부된다 */
  serviceJamThrows: false,
  /** `engine_decision_log`에 insert된 행 — 점수 실패 기록을 본다 */
  engineLogs: [] as Record<string, unknown>[],
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

// 지급 뒤 즉시 채움은 `lib/jam/__tests__/serviceActivity.test.ts`가 고정한다. 여기서는 채움을 막고 서비스 활동 잼 RPC 인자만 본다
vi.mock('@/lib/capsule/sync-auto-fill', () => ({
  runSyncCapsuleAutoFill: async () => ({ autoFill: {}, opened: false, chapterRose: false, unseenRecorded: true }),
}))
vi.mock('@/lib/points', () => ({
  awardPoints: (userId: string, amount: number, reason: string) => {
    stub.callOrder.push('award_points')
    return awardPointsMock(userId, amount, reason)
  },
}))

const followUpMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/combine/resultPointFollowUp', () => ({
  followUpCombineResultPoints: (...args: unknown[]) => followUpMock(...args),
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
  if (fnName === 'record_combine_success_with_id') {
    stub.successRpcCalls.push(args)
    if (stub.successRpcThrows) throw new Error('RPC 예외')
    if (stub.successRpcError) return { data: null, error: stub.successRpcError }
    // 최초 표시 선점은 한 번의 동기 확인·기록이라 동시 호출에서도 정확히 한 번만 true다(DB는 부분 유니크 인덱스가 보장)
    const recipeId = args.p_recipe_id as string
    const isFirst = !stub.firstSuccessRecipeIds.includes(recipeId)
    if (isFirst) stub.firstSuccessRecipeIds.push(recipeId)
    stub.successRpcResults.push(isFirst)
    // 호출마다 새 성공 행이 생기므로 id도 새로 받는다(마이그레이션 254)
    const id = `00000000-0000-4000-8000-${String(stub.successLogIds.length + 1).padStart(12, '0')}`
    stub.successLogIds.push(id)
    if (stub.successRpcData !== undefined) return { data: stub.successRpcData, error: null }
    return { data: { id, is_recipe_first: isFirst }, error: null }
  }
  if (fnName === 'jam_apply_service_activity') {
    stub.serviceJamCalls.push(args)
    if (stub.serviceJamThrows) throw new Error('점수 RPC 예외')
    if (stub.serviceJamError) return { data: null, error: stub.serviceJamError }
    return { data: { ok: true, granted: 5, ruleAmount: 5, capped: false, duplicate: false, dailyUsed: 5, weeklyUsed: 5, balance: 5 }, error: null }
  }
  if (fnName === 'combine_grant_results') {
    // 마이그레이션 236의 함수를 흉내낸다 — 빈칸이 결과 개수 이상이면 모두 지급하고, 모자라면 일부만 주지 않고 전부 받지 않은 결과로 남긴다.
    stub.grantResultCalls.push(args)
    if (stub.grantRpcError) return { data: null, error: stub.grantRpcError }
    const ids = args.p_badge_ids as string[]
    const free = Math.max(0, stub.maxSlots - stub.usedSlots)
    if (ids.length === 0) return { data: { ok: true, status: 'none', itemIds: [], pendingCount: 0 }, error: null }
    if (free >= ids.length) {
      const itemIds: string[] = []
      for (const id of ids) {
        stub.usedSlots += 1
        stub.usedSlotsHistory.push(stub.usedSlots)
        stub.grantedBadgeIds.push(id)
        itemIds.push(`generated-item-${stub.grantedBadgeIds.length}`)
      }
      return { data: { ok: true, status: 'granted', itemIds, pendingCount: 0 }, error: null }
    }
    for (const id of ids) {
      stub.pendingResults.push({ badge_id: id, recipe_id: args.p_recipe_id as string, locked: args.p_locked === true })
    }
    return {
      data: { ok: true, status: 'pending', itemIds: [], pendingCount: ids.length, free, needed: ids.length },
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
  const state: {
    op: 'select' | 'insert' | 'update'
    payload?: unknown
    eqFilters: Record<string, unknown>
    inFilters: Record<string, unknown>
  } = {
    op: 'select',
    eqFilters: {},
    inFilters: {},
  }

  const resolve = async (): Promise<{ data: unknown; error: unknown }> => {
    if (state.op === 'insert') {
      if (table === 'user_combine_fail_logs') {
        stub.failLogs.push(state.payload as Record<string, unknown>)
      }
      if (table === 'engine_decision_log') {
        stub.engineLogs.push(state.payload as Record<string, unknown>)
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
      case 'inventory_items': {
        // 지급 직후 잠긴 결과의 필요한 양을 읽는 조회(`.in('id', itemIds)`) — 소각 전 재료 조회와 구분한다
        const requested = state.inFilters.id as string[] | undefined
        if (requested?.some((id) => id.startsWith('generated-item-'))) {
          if (stub.unlockReadError) return { data: null, error: stub.unlockReadError }
          return {
            data: requested.map((id) => ({ id, unlock_required: stub.unlockRequiredByItemId[id] ?? null })),
            error: null,
          }
        }
        return {
          data: [
            { id: ITEM_1, badge_id: BADGE_A, locked: stub.lockedItemIds.includes(ITEM_1) },
            { id: ITEM_2, badge_id: BADGE_B, locked: stub.lockedItemIds.includes(ITEM_2) },
          ],
          error: null,
        }
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
      case 'badges': {
        // 결과 배지 조회 — `.in('id', ids)`로 요청한 id마다 한 줄씩 돌려준다(삭제되지 않은 배지)
        const ids = (state.inFilters.id as string[] | undefined) ?? [REWARD]
        return {
          data: ids.map((id) => ({
            id,
            name: id === REWARD ? '보상 배지' : `배지 ${id}`,
            rarity: 'rare',
            always_locked: stub.alwaysLockedBadgeIds.includes(id),
            valid_until: stub.badgeValidUntil,
          })),
          error: null,
        }
      }
      case 'user_suspensions':
        return {
          data: stub.suspended ? { id: 'suspension-1', reason: '운영 정책 위반', suspended_at: '2026-10-01T00:00:00.000Z' } : null,
          error: null,
        }
      case 'combine_pending_results':
        return { data: null, count: stub.pendingResults.length, error: null } as { data: unknown; error: unknown }
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
    in: (column: string, values: unknown) => {
      state.inFilters[column] = values
      return builder
    },
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

import { UserSuspendedError } from '@/lib/suspension/suspension'
import { combineRecipeAttempt, jamTriggersForCombineResult, type CombineResult } from '../index'

function recipe(overrides: Partial<RecipeStub> = {}): RecipeStub {
  return {
    id: 'recipe-1',
    reward_points: 0,
    reward_badge_ids: [REWARD],
    valid_from: null,
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
  stub.suspended = false
  stub.pendingResults = []
  stub.grantResultCalls = []
  stub.grantRpcError = null
  stub.badgeValidUntil = null
  stub.alwaysLockedBadgeIds = []
  stub.unlockRequiredByItemId = {}
  stub.unlockReadError = null
  stub.destroyedItemIds = []
  stub.failRewardPoints = 0
  stub.lockedItemIds = []
  stub.usedSlots = 5
  stub.maxSlots = 10
  stub.usedSlotsHistory = []
  stub.successRpcCalls = []
  stub.successLogIds = []
  stub.successRpcData = undefined
  stub.serviceJamCalls = []
  stub.serviceJamError = null
  stub.serviceJamThrows = false
  stub.engineLogs = []
  stub.successRpcError = null
  stub.successRpcThrows = false
  stub.firstSuccessRecipeIds = []
  stub.successRpcResults = []
  stub.callOrder = []
  awardPointsMock.mockReset()
  awardPointsMock.mockResolvedValue({ id: 'tx-1' })
  followUpMock.mockReset()
  followUpMock.mockResolvedValue(undefined)
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

  it('공개 시각이 미래인 레시피는 recipe_not_found — 재료 소각·포인트 지급 없이 실패 이력 1건만 남긴다 (티켓 20261001_1157)', async () => {
    // 슬롯이 완전히 충족되고 보상도 있는 레시피라도 공개 전이면 없는 레시피와 같다.
    const futureAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    stub.recipes = [recipe({ reward_points: 500, valid_from: futureAt })]
    stub.slots = itemSlots()
    stub.failRewardPoints = 50

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result).toEqual({ success: false, reason: 'recipe_not_found', pointsAwarded: 0 })
    expect(stub.destroyedItemIds).toEqual([])
    expect(stub.callOrder).toEqual([]) // 소각(release_inventory_slots)·지급·성공 기록 RPC 모두 호출되지 않는다
    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(stub.grantedBadgeIds).toEqual([])
    expect(stub.failLogs).toHaveLength(1)
    expect(stub.failLogs[0].fail_reason).toBe('recipe_not_found')
    expect(stub.failLogs[0].points_awarded).toBe(0)
  })

  it('공개 시각이 해석되지 않는 레시피도 recipe_not_found로 거절한다(fail-closed)', async () => {
    stub.recipes = [recipe({ valid_from: 'not-a-date' })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result).toEqual({ success: false, reason: 'recipe_not_found', pointsAwarded: 0 })
    expect(stub.destroyedItemIds).toEqual([])
    expect(stub.callOrder).toEqual([])
  })

  it('공개 시각이 과거인 레시피는 정상으로 믹스된다 (티켓 20261001_1157)', async () => {
    const pastAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    stub.recipes = [recipe({ reward_points: 120, valid_from: pastAt })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(true)
    if (result.success) expect(result.pointsAwarded).toBe(120)
    expect(stub.destroyedItemIds).toEqual([ITEM_1, ITEM_2])
    expect(stub.failLogs).toHaveLength(0)
  })

  it('종료 시각이 지난 레시피는 recipe_not_found — 재료 소각·포인트 지급 없이 실패 이력 1건만 남긴다 (티켓 20261002_0710)', async () => {
    // 슬롯이 완전히 충족되고 보상도 있는 레시피라도 종료됐으면 없는 레시피와 같다.
    const endedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    stub.recipes = [recipe({ reward_points: 500, valid_from: null, valid_until: endedAt })]
    stub.slots = itemSlots()
    stub.failRewardPoints = 50

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result).toEqual({ success: false, reason: 'recipe_not_found', pointsAwarded: 0 })
    expect(stub.destroyedItemIds).toEqual([])
    expect(stub.callOrder).toEqual([]) // 소각·지급·성공 기록 RPC 모두 호출되지 않는다
    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(stub.grantedBadgeIds).toEqual([])
    expect(stub.failLogs).toHaveLength(1)
    expect(stub.failLogs[0].fail_reason).toBe('recipe_not_found')
    expect(stub.failLogs[0].points_awarded).toBe(0)
  })

  it('종료 시각이 해석되지 않는 레시피도 recipe_not_found로 거절한다(fail-closed)', async () => {
    stub.recipes = [recipe({ valid_until: 'not-a-date' })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result).toEqual({ success: false, reason: 'recipe_not_found', pointsAwarded: 0 })
    expect(stub.destroyedItemIds).toEqual([])
    expect(stub.callOrder).toEqual([])
  })

  it('종료 시각 그 순간부터 끝이다 — 1ms 전까지는 믹스되고 같은 시각이면 거절된다 (경계)', async () => {
    const endAt = new Date('2026-10-12T00:00:00.000Z')
    stub.recipes = [recipe({ reward_points: 120, valid_from: '2026-10-01T00:00:00.000Z', valid_until: endAt.toISOString() })]
    stub.slots = itemSlots()

    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(endAt.getTime() - 1))
      const before = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])
      expect(before.success).toBe(true)
      expect(stub.destroyedItemIds).toEqual([ITEM_1, ITEM_2])

      stub.destroyedItemIds = []
      stub.callOrder = []
      vi.setSystemTime(endAt)
      const atEnd = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])
      expect(atEnd).toEqual({ success: false, reason: 'recipe_not_found', pointsAwarded: 0 })
      expect(stub.destroyedItemIds).toEqual([])
      expect(stub.callOrder).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('종료 시각이 미래인 레시피는 정상으로 믹스된다', async () => {
    const endsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    stub.recipes = [recipe({ reward_points: 120, valid_until: endsAt })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(true)
    if (result.success) expect(result.pointsAwarded).toBe(120)
    expect(stub.destroyedItemIds).toEqual([ITEM_1, ITEM_2])
    expect(stub.failLogs).toHaveLength(0)
  })

  it('종료 시각이 null(상시)이거나 칸이 없는 응답이어도 동작이 바뀌지 않는다', async () => {
    stub.slots = itemSlots()
    for (const overrides of [{ valid_until: null }, {}] as Partial<RecipeStub>[]) {
      stub.recipes = [recipe({ reward_points: 120, ...overrides })]
      stub.destroyedItemIds = []
      const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])
      expect(result.success).toBe(true)
      expect(stub.destroyedItemIds).toEqual([ITEM_1, ITEM_2])
    }
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

describe('잠긴 재료 (티켓 20261018_0051)', () => {
  it('재료에 잠긴 개체가 하나라도 있으면 locked_item_not_allowed로 거절하고 소각·포인트·지급·실패 이력을 남기지 않는다', async () => {
    stub.recipes = [recipe({ reward_points: 120 })]
    stub.slots = itemSlots()
    stub.failRewardPoints = 50
    stub.lockedItemIds = [ITEM_2]

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result).toEqual({ success: false, reason: 'locked_item_not_allowed', pointsAwarded: 0 })
    expect(stub.destroyedItemIds).toEqual([])
    expect(stub.grantedBadgeIds).toEqual([])
    expect(stub.failLogs).toHaveLength(0)
    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(stub.usedSlotsHistory).toEqual([])
  })

  it('잠긴 개체 거절은 JAM! 지표를 다시 판정하지 않는다', () => {
    expect(jamTriggersForCombineResult({ success: false, reason: 'locked_item_not_allowed', pointsAwarded: 0 })).toEqual([])
  })

  it('열린 개체만 넣으면 이전처럼 믹스된다', async () => {
    stub.recipes = [recipe({ reward_points: 120 })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(true)
    expect(stub.destroyedItemIds).toEqual([ITEM_1, ITEM_2])
  })
})

describe('재료 개수 오류', () => {
  it('5개를 초과해 넣으면 invalid_count로 거부하고 소각하지 않는다(레시피 조회 이전에 차단, 운영 로직 8.6절)', async () => {
    const tooMany = Array.from({ length: 6 }, (_, i) => `item-${i}`)
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

  it('소각으로 반환된 칸보다 보상 배지가 많으면 일부만 주지 않고 전부 받지 않은 결과로 남긴다 (티켓 20261018_0055)', async () => {
    // 조합 전 이미 가득 찬 인벤토리(7/7) — 재료 2개를 소각해 5/7로 여유가 2칸 생기지만 레시피 보상 배지는 3개다.
    // 예전에는 앞의 둘만 지급하고 셋째를 조용히 건너뛰었다. 이제는 하나도 주지 않고 셋 모두 받지 않은 결과로 남는다.
    stub.usedSlots = 7
    stub.maxSlots = 7
    const REWARD_2 = 'badge-reward-2'
    const REWARD_3 = 'badge-reward-3'
    stub.recipes = [recipe({ reward_badge_ids: [REWARD, REWARD_2, REWARD_3] })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(true)
    // 소각 직후 7 - 2 = 5 — 지급이 없으므로 더 늘지 않는다
    expect(stub.usedSlotsHistory).toEqual([5])
    expect(stub.grantedBadgeIds).toEqual([])
    expect(stub.pendingResults.map((r) => r.badge_id)).toEqual([REWARD, REWARD_2, REWARD_3])
    if (result.success) {
      expect(result.resultStatus).toBe('pending')
      expect(result.resultBadges).toHaveLength(0)
      expect(result.pendingCount).toBe(3)
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

describe('성공 기록 — record_combine_success_with_id (티켓 20261001_0631·20261019_1315)', () => {
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

    expect(stub.callOrder).toEqual(['release_inventory_slots', 'combine_grant_results', 'inventory_slot_alert_step', 'award_points', 'record_combine_success_with_id', 'jam_apply_service_activity'])
  })

  it('빈손 성공(보상 배지·포인트가 없는 레시피)도 성공 1건으로 기록한다', async () => {
    stub.recipes = [recipe({ reward_points: 0, reward_badge_ids: [] })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(true)
    expect(stub.successRpcCalls).toHaveLength(1)
    expect(stub.successRpcCalls[0]).toMatchObject({ p_result_badge_ids: [], p_points_awarded: 0 })
  })

  it('결과가 받지 않은 상태로 남은 성공(인벤토리가 가득 참)도 성공 1건으로 기록하고 결과 배지 id를 남긴다', async () => {
    // 재료 2개를 소각해도 10 - 2 = 8칸이 차 있어 한도 2를 넘으므로 결과가 받지 않은 결과로 남는다
    stub.usedSlots = 10
    stub.maxSlots = 2
    stub.recipes = [recipe({ reward_badge_ids: [REWARD] })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(true)
    if (result.success) expect(result.resultBadges).toHaveLength(0)
    expect(stub.successRpcCalls).toHaveLength(1)
    expect(stub.successRpcCalls[0]).toMatchObject({ p_result_badge_ids: [REWARD] })
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
    stub.successRpcError = { message: 'function record_combine_success_with_id does not exist' }
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

describe('서비스 활동 잼 «믹스 성공» — jam_apply_service_activity (티켓 20261019_1315 3회, 20261028_1735 2회)', () => {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  /** 성공하는 레시피 1개를 준비한다 */
  function givenSuccessRecipe(overrides: Partial<RecipeStub> = {}) {
    stub.recipes = [recipe({ reward_points: 120, reward_badge_ids: [REWARD], ...overrides })]
    stub.slots = itemSlots()
  }

  it('성공하면 돌려받은 성공 행 id를 원천 id로 combine_success 서비스 활동 잼을 1회 지급한다 — 이벤트 키는 combine_success:<성공 행 id>다', async () => {
    givenSuccessRecipe()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(true)
    expect(stub.successLogIds).toHaveLength(1)
    expect(stub.serviceJamCalls).toEqual([
      { p_user_id: USER, p_kind: 'combine_success', p_event_key: `combine_success:${stub.successLogIds[0]}` },
    ])
    expect(String(stub.serviceJamCalls[0].p_event_key).slice('combine_success:'.length)).toMatch(UUID_RE)
  })

  it('점수는 성공 기록 RPC 바로 뒤에 한 번 나간다 — 소각·보상·포인트 지급 순서는 그대로다', async () => {
    givenSuccessRecipe()

    await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(stub.callOrder).toEqual([
      'release_inventory_slots',
      'combine_grant_results',
      'inventory_slot_alert_step',
      'award_points',
      'record_combine_success_with_id',
      'jam_apply_service_activity',
    ])
    expect(followUpMock).toHaveBeenCalledTimes(1)
  })

  it('빈손 성공(보상 배지·포인트가 없는 레시피)도 센다', async () => {
    givenSuccessRecipe({ reward_points: 0, reward_badge_ids: [] })

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(true)
    if (result.success) expect(result.noReward).toBe(true)
    expect(stub.serviceJamCalls).toHaveLength(1)
    expect(stub.serviceJamCalls[0]).toMatchObject({ p_kind: 'combine_success', p_event_key: `combine_success:${stub.successLogIds[0]}` })
  })

  it('결과가 받지 않은 상태로 남은 성공도 센다', async () => {
    stub.usedSlots = 10
    stub.maxSlots = 2
    givenSuccessRecipe()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(true)
    if (result.success) expect(result.resultStatus).toBe('pending')
    expect(stub.serviceJamCalls).toHaveLength(1)
  })

  it('믹스를 두 번 성공하면 성공 행이 둘이라 원천 id도 서로 다르다 — 같은 믹스를 두 번 세지 않고 서로 다른 믹스를 하나로 합치지도 않는다', async () => {
    givenSuccessRecipe()

    await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])
    await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    const sources = stub.serviceJamCalls.map((c) => String(c.p_event_key).slice('combine_success:'.length))
    expect(sources).toHaveLength(2)
    expect(new Set(sources).size).toBe(2)
    expect(sources).toEqual(stub.successLogIds)
  })

  it('시험 믹스(testMix)는 성공 기록이 없어 점수도 세지 않는다', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    givenSuccessRecipe({ valid_from: future })

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2], { allowUnreleased: true })

    expect(result.success).toBe(true)
    expect(result.testMix).toBe(true)
    expect(stub.successRpcCalls).toHaveLength(0)
    expect(stub.serviceJamCalls).toHaveLength(0)
  })

  it('실패 갈래(no_recipe_match·소각 전 실패·이용 정지)는 점수를 세지 않는다', async () => {
    stub.recipes = [recipe()]
    stub.slots = [] // 어떤 투입도 충족될 수 없다
    const noMatch = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])
    expect(noMatch.success).toBe(false)

    stub.recipes = []
    const notFound = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])
    expect(notFound.success).toBe(false)

    stub.suspended = true
    await expect(combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])).rejects.toBeInstanceOf(UserSuspendedError)

    expect(stub.serviceJamCalls).toHaveLength(0)
  })

  describe('성공 기록 응답이 알려진 모양이 아니면 점수를 세지 않고 기록한다', () => {
    const BAD_RESPONSES: [string, unknown][] = [
      ['null', null],
      ['boolean(옛 함수의 응답)', true],
      ['배열', [{ id: '00000000-0000-4000-8000-000000000001', is_recipe_first: true }]],
      ['id 없음', { is_recipe_first: true }],
      ['id가 UUID 문자열이 아님', { id: 'not-a-uuid', is_recipe_first: true }],
      ['id가 숫자', { id: 123, is_recipe_first: true }],
      ['is_recipe_first 없음', { id: '00000000-0000-4000-8000-000000000001' }],
      ['is_recipe_first가 boolean이 아님', { id: '00000000-0000-4000-8000-000000000001', is_recipe_first: 'true' }],
    ]

    it.each(BAD_RESPONSES)('%s', async (_label, data) => {
      stub.successRpcData = data
      givenSuccessRecipe()
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

      // 믹스 응답과 보상은 그대로다
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.resultBadges.map((b) => b.id)).toEqual([REWARD])
        expect(result.pointsAwarded).toBe(120)
      }
      expect(stub.grantedBadgeIds).toEqual([REWARD])
      // 점수는 세지 않고, console.error와 chapter_score_failed(sourceId null)만 남는다
      expect(stub.serviceJamCalls).toHaveLength(0)
      expect(consoleError).toHaveBeenCalled()
      expect(stub.engineLogs).toHaveLength(1)
      expect(stub.engineLogs[0]).toMatchObject({
        user_id: USER,
        engine: 'points',
        event: 'chapter_score_failed',
        payload: { kind: 'mix_success', sourceId: null },
      })
      consoleError.mockRestore()
    })
  })

  it('성공 기록 RPC가 오류를 내면 점수를 세지 않고 chapter_score_failed(sourceId null)를 남긴다 — 믹스 응답은 그대로다', async () => {
    stub.successRpcError = { message: 'function record_combine_success_with_id does not exist' }
    givenSuccessRecipe()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(true)
    if (result.success) expect(result.pointsAwarded).toBe(120)
    expect(stub.serviceJamCalls).toHaveLength(0)
    expect(stub.engineLogs).toHaveLength(1)
    expect(stub.engineLogs[0]).toMatchObject({ event: 'chapter_score_failed', payload: { kind: 'mix_success', sourceId: null } })
    expect(String((stub.engineLogs[0].payload as { error: string }).error)).toContain('record_combine_success_with_id')
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('성공 기록 RPC 호출이 예외로 거부돼도 점수를 세지 않고 기록하며 믹스 응답은 그대로다', async () => {
    stub.successRpcThrows = true
    givenSuccessRecipe()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success).toBe(true)
    if (result.success) expect(result.pointsAwarded).toBe(120)
    expect(stub.serviceJamCalls).toHaveLength(0)
    expect(stub.engineLogs).toHaveLength(1)
    expect(stub.engineLogs[0]).toMatchObject({ event: 'chapter_score_failed', payload: { kind: 'mix_success', sourceId: null } })
    consoleError.mockRestore()
  })

  it.each([
    ['지급 RPC가 오류를 돌려줌', { serviceJamError: { message: '점수 장애' }, serviceJamThrows: false }],
    ['지급 RPC 호출이 예외로 거부됨', { serviceJamError: null, serviceJamThrows: true }],
  ])('%s — 믹스 응답·재료 소각·보상 지급·후속 처리는 그대로고 실패만 기록한다', async (_label, failure) => {
    stub.serviceJamError = failure.serviceJamError
    stub.serviceJamThrows = failure.serviceJamThrows
    givenSuccessRecipe()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result).toMatchObject({ success: true, path: 'recipe', pointsAwarded: 120, resultStatus: 'granted' })
    expect(stub.destroyedItemIds).toEqual([ITEM_1, ITEM_2])
    expect(stub.grantedBadgeIds).toEqual([REWARD])
    expect(awardPointsMock).toHaveBeenCalledWith(USER, 120, 'combine_recipe_reward')
    expect(followUpMock).toHaveBeenCalledTimes(1)
    // 성공 기록은 정상으로 남았고, 점수 실패는 원천 id(성공 행 id)를 갖고 기록된다 — 같은 id로 다시 보낼 수 있다
    expect(stub.successRpcCalls).toHaveLength(1)
    expect(stub.engineLogs).toHaveLength(1)
    expect(stub.engineLogs[0]).toMatchObject({
      event: 'service_jam_failed',
      payload: { kind: 'combine_success', sourceId: stub.successLogIds[0] },
    })
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

describe('운영자 시험 믹스 — 공개 전 레시피 (티켓 20261001_1159)', () => {
  const futureAt = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const pastAt = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const ADMIN = { allowUnreleased: true }

  it('운영자가 공개 전 레시피를 믹스해 성공하면 보상은 지급하되 성공 기록은 남기지 않고 testMix: true를 돌려준다', async () => {
    stub.recipes = [recipe({ reward_points: 120, reward_badge_ids: [REWARD], valid_from: futureAt() })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2], ADMIN)

    expect(result.success).toBe(true)
    expect(result.testMix).toBe(true)
    if (result.success) {
      expect(result.resultBadges.map((b) => b.id)).toEqual([REWARD])
      expect(result.pointsAwarded).toBe(120)
    }
    // 실제와 같은 처리 — 재료 소각·칸 반환·보상 배지·포인트
    expect(stub.destroyedItemIds).toEqual([ITEM_1, ITEM_2])
    expect(stub.grantedBadgeIds).toEqual([REWARD])
    expect(awardPointsMock).toHaveBeenCalledWith(USER, 120, 'combine_recipe_reward')
    expect(stub.usedSlotsHistory).toEqual([3, 4])
    // 기록에서 빠진다 — record_combine_success_with_id 0회, 실패 로그 0건
    expect(stub.successRpcCalls).toHaveLength(0)
    expect(stub.callOrder).toEqual(['release_inventory_slots', 'combine_grant_results', 'inventory_slot_alert_step', 'award_points'])
    expect(stub.failLogs).toHaveLength(0)
  })

  it('운영자가 공개 전 레시피를 믹스해 미매칭이면 소각·위로 포인트는 그대로이고 실패 로그는 0건이다', async () => {
    stub.recipes = [recipe({ valid_from: futureAt() })]
    stub.slots = [] // 어떤 투입도 충족될 수 없다
    stub.failRewardPoints = 5

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2], ADMIN)

    expect(result).toEqual({ success: false, reason: 'no_recipe_match', pointsAwarded: 5, testMix: true })
    expect(stub.destroyedItemIds).toEqual([ITEM_1, ITEM_2])
    expect(stub.grantedBadgeIds).toEqual([])
    expect(awardPointsMock).toHaveBeenCalledWith(USER, 5, 'combine_fail_reward')
    expect(stub.failLogs).toHaveLength(0)
    expect(stub.successRpcCalls).toHaveLength(0)
  })

  it('운영자의 공개 전 믹스가 재료 부족(items_not_found)으로 끝나도 실패 로그를 남기지 않고 testMix를 단다', async () => {
    stub.recipes = [recipe({ valid_from: futureAt() })]
    stub.slots = itemSlots()

    // 스텁은 항상 2개만 돌려주므로 3개를 요청하면 조회된 재료 수가 모자란다
    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2, 'item-3'], ADMIN)

    expect(result).toEqual({ success: false, reason: 'items_not_found', pointsAwarded: 0, testMix: true })
    expect(stub.destroyedItemIds).toEqual([])
    expect(stub.failLogs).toHaveLength(0)
  })

  it('일반 유저(allowUnreleased 없음·false)는 공개 전 레시피를 믹스할 수 없다 — recipe_not_found, testMix 키도 없다', async () => {
    stub.recipes = [recipe({ reward_points: 500, valid_from: futureAt() })]
    stub.slots = itemSlots()

    const omitted = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])
    const explicit = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2], { allowUnreleased: false })

    for (const result of [omitted, explicit]) {
      expect(result).toEqual({ success: false, reason: 'recipe_not_found', pointsAwarded: 0 })
      expect('testMix' in result).toBe(false)
    }
    expect(stub.destroyedItemIds).toEqual([])
    expect(stub.callOrder).toEqual([])
    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(stub.failLogs).toHaveLength(2) // recipe_not_found 이력은 ①대로 남는다
  })

  it('공개 후 레시피는 운영자가 믹스해도 시험 믹스가 아니다 — 성공 기록이 정상으로 남는다', async () => {
    stub.recipes = [recipe({ reward_points: 120, reward_badge_ids: [REWARD], valid_from: pastAt() })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2], ADMIN)

    expect(result.success).toBe(true)
    expect('testMix' in result).toBe(false)
    expect(stub.successRpcCalls).toHaveLength(1)
    expect(stub.callOrder).toEqual(['release_inventory_slots', 'combine_grant_results', 'inventory_slot_alert_step', 'award_points', 'record_combine_success_with_id', 'jam_apply_service_activity'])
  })

  it('공개 시각이 없는 레시피(처음부터 공개)도 운영자 믹스는 일반 믹스다 — 실패 로그가 정상으로 남는다', async () => {
    stub.recipes = [recipe({ valid_from: null })]
    stub.slots = []

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2], ADMIN)

    expect(result.success).toBe(false)
    expect('testMix' in result).toBe(false)
    expect(stub.failLogs).toHaveLength(1)
    expect(stub.failLogs[0].fail_reason).toBe('no_recipe_match')
  })

  it('종료된 레시피는 운영자여도 recipe_not_found다 — 시험 믹스가 아니고 재료 소각도 없다 (티켓 20261002_0710 G7)', async () => {
    stub.recipes = [recipe({ reward_points: 500, valid_from: pastAt(), valid_until: pastAt() })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2], ADMIN)

    expect(result).toEqual({ success: false, reason: 'recipe_not_found', pointsAwarded: 0 })
    expect('testMix' in result).toBe(false)
    expect(stub.destroyedItemIds).toEqual([])
    expect(stub.callOrder).toEqual([])
    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(stub.failLogs).toHaveLength(1) // 없는 레시피와 같은 이력이 남는다
    expect(stub.failLogs[0].fail_reason).toBe('recipe_not_found')
  })

  it('종료 시각이 미래인 공개 중 레시피는 운영자가 믹스해도 일반 믹스다', async () => {
    stub.recipes = [recipe({ reward_points: 120, valid_from: pastAt(), valid_until: futureAt() })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2], ADMIN)

    expect(result.success).toBe(true)
    expect('testMix' in result).toBe(false)
    expect(stub.successRpcCalls).toHaveLength(1)
  })

  it('없는 레시피는 운영자여도 recipe_not_found이고 이력이 남는다(시험 믹스 대상이 아니다)', async () => {
    stub.recipes = []

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2], ADMIN)

    expect(result).toEqual({ success: false, reason: 'recipe_not_found', pointsAwarded: 0 })
    expect(stub.failLogs).toHaveLength(1)
    expect(stub.destroyedItemIds).toEqual([])
  })
})

describe('jamTriggersForCombineResult — 결과별로 다시 판정할 지표', () => {
  it('성공은 시도·성공·레시피 최초 성공·트라이브를 넘는 성공 수·다른 트라이브 아이템 종류 수', () => {
    const result: CombineResult = { success: true, path: 'recipe', resultBadges: [], pointsAwarded: 0, resultStatus: 'none' }
    expect(jamTriggersForCombineResult(result)).toEqual([
      'combine_attempt_count',
      'combine_success_count',
      'recipe_first_success',
      'cross_tribe_combine_success_count',
      'other_tribe_item_kinds_count',
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

  it('시험 믹스(testMix)는 성공이든 실패든 판정할 지표가 없다 (티켓 20261001_1159)', () => {
    expect(
      jamTriggersForCombineResult({ success: true, path: 'recipe', resultBadges: [], pointsAwarded: 0, resultStatus: 'none', testMix: true })
    ).toEqual([])
    expect(
      jamTriggersForCombineResult({ success: false, reason: 'no_recipe_match', pointsAwarded: 5, testMix: true })
    ).toEqual([])
  })
})

describe('JAM 2.0 믹스 고치기 — 소각 앞 관문 (티켓 20261018_0055)', () => {
  it('이용 정지 중이면 UserSuspendedError를 던지고 소각·포인트·지급·실패 이력을 남기지 않는다', async () => {
    stub.suspended = true
    stub.recipes = [recipe({ reward_points: 120 })]
    stub.slots = itemSlots()

    await expect(combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])).rejects.toBeInstanceOf(UserSuspendedError)

    expect(stub.destroyedItemIds).toEqual([])
    expect(stub.grantResultCalls).toHaveLength(0)
    expect(stub.failLogs).toHaveLength(0)
    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(stub.usedSlotsHistory).toEqual([])
  })

  it('받지 않은 결과가 있으면 pending_results_exist로 거절하고 소각·포인트·지급·실패 이력·성공 기록을 남기지 않는다', async () => {
    stub.pendingResults = [{ badge_id: REWARD, recipe_id: 'recipe-0', locked: false }]
    stub.recipes = [recipe({ reward_points: 120 })]
    stub.slots = itemSlots()
    stub.failRewardPoints = 50

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result).toEqual({ success: false, reason: 'pending_results_exist', pointsAwarded: 0 })
    expect(stub.destroyedItemIds).toEqual([])
    expect(stub.grantResultCalls).toHaveLength(0)
    expect(stub.failLogs).toHaveLength(0)
    expect(stub.successRpcCalls).toHaveLength(0)
    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(stub.usedSlotsHistory).toEqual([])
  })

  it('받지 않은 결과 거절은 JAM! 지표를 다시 판정하지 않는다', () => {
    expect(jamTriggersForCombineResult({ success: false, reason: 'pending_results_exist', pointsAwarded: 0 })).toEqual([])
  })

  it('빈칸이 모자라 결과가 남은 직후의 새 믹스는 거절되고, 받지 않은 결과가 사라지면 다시 믹스된다', async () => {
    stub.usedSlots = 7
    stub.maxSlots = 7
    stub.recipes = [recipe({ reward_badge_ids: [REWARD, 'badge-reward-2', 'badge-reward-3'] })]
    stub.slots = itemSlots()

    const first = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])
    expect(first.success && first.resultStatus).toBe('pending')

    const second = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])
    expect(second).toEqual({ success: false, reason: 'pending_results_exist', pointsAwarded: 0 })
    // 재료는 첫 믹스에서만 소각됐고 결과 지급 호출도 한 번뿐이다
    expect(stub.grantResultCalls).toHaveLength(1)

    stub.pendingResults = [] // 받기(combine_claim_pending)가 끝난 상태
    stub.usedSlots = 3
    const third = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])
    expect(third.success && third.resultStatus).toBe('granted')
  })
})

describe('JAM 2.0 믹스 고치기 — 결과 지급 (티켓 20261018_0055)', () => {
  it('결과 지급은 combine_grant_results 한 번이고 결과 배지 전부를 한꺼번에 넘긴다 — 슬롯을 나눠 세지 않고 기한도 두지 않는다', async () => {
    const REWARD_2 = 'badge-reward-2'
    stub.recipes = [recipe({ reward_badge_ids: [REWARD, REWARD_2] })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(stub.grantResultCalls).toEqual([
      { p_user_id: USER, p_recipe_id: 'recipe-1', p_badge_ids: [REWARD, REWARD_2], p_locked: false },
    ])
    // 옛 지급 함수(30일 기한)는 더 부르지 않는다
    expect(stub.callOrder).not.toContain('grant_inventory_item')
    expect(stub.grantResultCalls[0]).not.toHaveProperty('p_expires_at')
    expect(stub.grantedBadgeIds).toEqual([REWARD, REWARD_2])
    expect(result.success && result.resultStatus).toBe('granted')
    if (result.success) expect(result.resultBadges.map((b) => b.id)).toEqual([REWARD, REWARD_2])
  })

  it('받지 않은 결과로 남아도 재료는 소모되고 포인트는 지급되며 pending 응답에 개수와 빈칸 수가 실린다', async () => {
    stub.usedSlots = 10
    stub.maxSlots = 9 // 재료 2개를 소각해도 8/9 — 결과 2개가 들어갈 빈칸(1)이 모자라다
    stub.recipes = [recipe({ reward_points: 40, reward_badge_ids: [REWARD, 'badge-reward-2'] })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(stub.destroyedItemIds).toEqual([ITEM_1, ITEM_2])
    expect(awardPointsMock).toHaveBeenCalledWith(USER, 40, 'combine_recipe_reward')
    expect(result).toMatchObject({
      success: true,
      resultStatus: 'pending',
      resultBadges: [],
      pointsAwarded: 40,
      pendingCount: 2,
      freeSlots: 1,
    })
  })

  it('결과의 잠김은 레시피(reward_locked)가 정한다 — 잠긴 채 나온 결과는 id·이름을 가리고 locked: true를 단다', async () => {
    stub.recipes = [recipe({ reward_locked: true })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(stub.grantResultCalls[0]).toMatchObject({ p_locked: true })
    expect(result.success && result.resultBadges).toEqual([{ id: '', name: '', rarity: 'rare', locked: true }])
  })

  it('잠김으로 만든 배지(always_locked)는 레시피가 열림이어도 잠긴 채 나온다', async () => {
    stub.alwaysLockedBadgeIds = [REWARD]
    stub.recipes = [recipe()]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(stub.grantResultCalls[0]).toMatchObject({ p_locked: false })
    expect(result.success && result.resultBadges).toEqual([{ id: '', name: '', rarity: 'rare', locked: true }])
  })

  it('잠긴 채 나온 결과에는 필요한 양(unlockRequired)을 싣는다 — 지급된 개체의 값을 읽어 같은 순서로 붙인다', async () => {
    stub.recipes = [recipe({ reward_locked: true })]
    stub.slots = itemSlots()
    stub.unlockRequiredByItemId = { 'generated-item-1': 300 }

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success && result.resultBadges).toEqual([
      { id: '', name: '', rarity: 'rare', locked: true, unlockRequired: 300 },
    ])
  })

  it('필요한 양을 읽지 못하면 응답은 그대로 두고 unlockRequired 키만 뺀다 — 값을 추측해 채우지 않는다', async () => {
    stub.recipes = [recipe({ reward_locked: true })]
    stub.slots = itemSlots()
    stub.unlockReadError = { message: 'db down' }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])
    errorSpy.mockRestore()

    expect(result.success).toBe(true)
    expect(result.success && result.resultBadges).toEqual([{ id: '', name: '', rarity: 'rare', locked: true }])
    expect(result.success && 'unlockRequired' in result.resultBadges[0]).toBe(false)
  })

  it('열린 결과는 필요한 양을 읽지 않고 unlockRequired 키도 없다', async () => {
    stub.recipes = [recipe()]
    stub.slots = itemSlots()
    stub.unlockRequiredByItemId = { 'generated-item-1': 300 }

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success && result.resultBadges).toEqual([{ id: REWARD, name: '보상 배지', rarity: 'rare' }])
  })

  it('열린 결과는 이름과 등급을 그대로 싣는다(locked 키 없음)', async () => {
    stub.recipes = [recipe()]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success && result.resultBadges).toEqual([{ id: REWARD, name: '보상 배지', rarity: 'rare' }])
  })

  it('combine_grant_results가 오류를 돌려주면 재료는 이미 소각된 뒤라 resultStatus none으로 이어 가고 성공 기록은 남는다', async () => {
    stub.grantRpcError = { message: 'boom' }
    stub.recipes = [recipe({ reward_points: 20 })]
    stub.slots = itemSlots()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result).toMatchObject({ success: true, resultStatus: 'none', resultBadges: [], pointsAwarded: 20 })
    expect(stub.destroyedItemIds).toEqual([ITEM_1, ITEM_2])
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('보상 없음 레시피(포인트 0, 결과 배지 없음)는 지급 함수를 부르지 않고 noReward: true를 단다', async () => {
    stub.recipes = [recipe({ reward_points: 0, reward_badge_ids: [] })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(stub.grantResultCalls).toHaveLength(0)
    expect(result).toMatchObject({ success: true, resultStatus: 'none', noReward: true })
  })

  it('포인트만 주는 레시피는 noReward가 아니다', async () => {
    stub.recipes = [recipe({ reward_points: 30, reward_badge_ids: [] })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success && 'noReward' in result).toBe(false)
  })
})

describe('JAM 2.0 믹스 고치기 — 결과 배지의 공개 기간이 끝난 레시피 (티켓 20261018_0055)', () => {
  it('결과 배지의 종료 시각이 지났으면 recipe_not_found로 거절하고 소각·포인트·지급 없이 실패 이력 1건만 남긴다', async () => {
    stub.badgeValidUntil = new Date(Date.now() - 60_000).toISOString()
    stub.recipes = [recipe({ reward_points: 120 })]
    stub.slots = itemSlots()
    stub.failRewardPoints = 50

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result).toEqual({ success: false, reason: 'recipe_not_found', pointsAwarded: 0 })
    expect(stub.destroyedItemIds).toEqual([])
    expect(stub.grantResultCalls).toHaveLength(0)
    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(stub.failLogs).toHaveLength(1)
    expect(stub.failLogs[0].fail_reason).toBe('recipe_not_found')
  })

  it('운영자(allowUnreleased)도 결과 배지가 끝난 레시피는 믹스할 수 없다', async () => {
    stub.badgeValidUntil = new Date(Date.now() - 60_000).toISOString()
    stub.recipes = [recipe({ valid_from: new Date(Date.now() + 3_600_000).toISOString() })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2], { allowUnreleased: true })

    expect(result).toMatchObject({ success: false, reason: 'recipe_not_found' })
    expect(stub.destroyedItemIds).toEqual([])
  })

  it('종료 시각을 해석할 수 없으면 끝난 것으로 본다(fail-closed)', async () => {
    stub.badgeValidUntil = '내일쯤'
    stub.recipes = [recipe()]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result).toMatchObject({ success: false, reason: 'recipe_not_found' })
    expect(stub.destroyedItemIds).toEqual([])
  })

  it('결과 배지의 종료 시각이 미래이거나 없으면 정상으로 믹스된다', async () => {
    stub.recipes = [recipe()]
    stub.slots = itemSlots()

    stub.badgeValidUntil = new Date(Date.now() + 3_600_000).toISOString()
    expect((await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])).success).toBe(true)

    stub.usedSlots = 5
    stub.badgeValidUntil = null
    expect((await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])).success).toBe(true)
  })
})

describe('결과 아이템 배지의 배지 포인트 (티켓 20261019_1314 2회, 운영 로직 14.1절)', () => {
  it('결과를 바로 지급하면 지급된 개체 id로 후속을 한 번 부른다', async () => {
    stub.recipes = [recipe({ reward_badge_ids: [REWARD] })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success && result.resultStatus).toBe('granted')
    expect(followUpMock).toHaveBeenCalledTimes(1)
    expect(followUpMock).toHaveBeenCalledWith(expect.anything(), USER, ['generated-item-1'])
  })

  it('결과 배지가 둘이면 개체 id를 지급 순서대로 넘긴다', async () => {
    stub.recipes = [recipe({ reward_badge_ids: [REWARD, 'badge-reward-2'] })]
    stub.slots = itemSlots()

    await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(followUpMock).toHaveBeenCalledTimes(1)
    expect(followUpMock).toHaveBeenCalledWith(expect.anything(), USER, ['generated-item-1', 'generated-item-2'])
  })

  it('잠긴 채 나오는 결과도 같은 후속에 넘긴다 — 잠긴 개체를 거르는 것은 후속의 몫이다', async () => {
    stub.recipes = [recipe({ reward_locked: true })]
    stub.slots = itemSlots()

    await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(followUpMock).toHaveBeenCalledWith(expect.anything(), USER, ['generated-item-1'])
  })

  it('빈칸이 모자라 받지 않은 결과로 남으면 후속을 부르지 않는다(받을 때 준다)', async () => {
    stub.usedSlots = 10
    stub.maxSlots = 9
    stub.recipes = [recipe({ reward_badge_ids: [REWARD, 'badge-reward-2'] })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success && result.resultStatus).toBe('pending')
    expect(followUpMock).not.toHaveBeenCalled()
  })

  it('결과 지급이 실패하거나 지급할 결과가 없으면 후속을 부르지 않는다', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stub.slots = itemSlots()

    stub.grantRpcError = { message: 'boom' }
    stub.recipes = [recipe({ reward_badge_ids: [REWARD] })]
    await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    stub.grantRpcError = null
    stub.recipes = [recipe({ reward_points: 30, reward_badge_ids: [] })]
    await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])
    errorSpy.mockRestore()

    expect(followUpMock).not.toHaveBeenCalled()
  })

  it('레시피 미매칭(고정 포인트만)이나 소각 전 거절에서는 후속을 부르지 않는다', async () => {
    stub.recipes = [recipe()]
    stub.slots = [] // 어떤 투입도 충족될 수 없다
    stub.failRewardPoints = 5
    await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    await combineRecipeAttempt(USER, 'no-such-recipe', [ITEM_1, ITEM_2])

    expect(followUpMock).not.toHaveBeenCalled()
  })

  it('응답의 pointsAwarded는 레시피 보상 포인트 그대로이고 레시피 보상 지급은 한 번이다', async () => {
    stub.recipes = [recipe({ reward_points: 40, reward_badge_ids: [REWARD] })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2])

    expect(result.success && result.pointsAwarded).toBe(40)
    // 배지 포인트는 후속(모킹)이 맡는다 — 이 파일의 awardPoints 모킹에는 레시피 보상만 들어온다
    expect(awardPointsMock).toHaveBeenCalledTimes(1)
    expect(awardPointsMock).toHaveBeenCalledWith(USER, 40, 'combine_recipe_reward')
  })

  it('운영자 시험 믹스도 개체는 실제로 지급되므로 같은 후속을 부른다', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    stub.recipes = [recipe({ valid_from: future })]
    stub.slots = itemSlots()

    const result = await combineRecipeAttempt(USER, 'recipe-1', [ITEM_1, ITEM_2], { allowUnreleased: true })

    expect(result.testMix).toBe(true)
    expect(followUpMock).toHaveBeenCalledWith(expect.anything(), USER, ['generated-item-1'])
  })
})
