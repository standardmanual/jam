/**
 * POST·DELETE·PATCH /api/itembooks/[id]/slot — JAM! 행동 지표(완성한 컬렉션 수) 판정·컬렉션 보상 배지 발급 연동 테스트
 * (티켓 20261001_0633, 상위 20260930_1456 ③ / 티켓 20261001_0635)
 *
 * 검증 대상:
 *  - 장착(POST) 성공 뒤 `after()` 1회로 «보상 배지 발급(`runSlotRewardIssue`) → `collection_complete_count` 판정
 *    (`runJamActionEvaluation`)» 순서의 실행을 예약한다
 *  - 401·400·RPC 오류·`ok: false` 실패 분기에서는 예약하지 않는다
 *  - 해제(DELETE)·교체(PATCH)에서는 예약하지 않는다
 *  - 응답 본문·상태 코드·에러 문구는 변경 전과 같다. 판정이 거부돼도 응답은 그대로다
 *  - 등급별 구조(`tier_mode`)가 꺼진 컬렉션은 이전과 같은 RPC·인자로 부르고 보상 발급도 인자 두 개 그대로다(회귀).
 *    켜진 컬렉션은 `slot_item_into_book_tiered`·`swap_item_in_book_tiered`를 부르고 `completed_tier`를 보상 발급의 세 번째
 *    인자로 넘기며 `tier_mismatch`·`tier_mode_off`를 응답으로 바꾼다(티켓 20261016_2340)
 *  - 잠긴 개체(티켓 20261018_0051)는 장착(POST)·교체(PATCH) 모두 RPC 전에 409 `locked_item_not_allowed`로 거절하고,
 *    RPC가 트리거 오류(`locked_item_cannot_be_slotted`)를 올려도 같은 코드로 바꾼다
 *  - 공개되지 않은 컬렉션(없음·비활성·시작 전)에는 404이고 장착 RPC를 부르지 않는다(티켓 20260930_1516).
 *    기간이 끝난 컬렉션은 보유자가 계속 쓸 수 있어 막지 않는다(결정 E1)
 *  - 이용 정지 중이면 장착(POST)은 RPC 전에 403 `user_suspended`이고(`d.suspension.itemBookSlotBlocked`) 정지 조회가 실패하면 500이다. 해제·교체는 막지 않는다(티켓 20261019_1315 3회)
 *  - 챕터 점수 «컬렉션 완성»(티켓 20261019_1315 3회, 사용자 결정 4): 응답 뒤 `after()`에서 센다. 옛 컬렉션은 장착 전후 완성 기록으로 «이번에 새로 완성했는가»를 가려
 *    common으로 세고(이미 완성한 유저의 재장착은 세지 않음), 등급형은 `completed_tier`로 센다. 등급형으로 바뀐 뒤에도 같은 (kind, 원천 id)라 이중 가산이 없다.
 *    점수 실패는 응답·보상 배지 발급·JAM! 판정을 바꾸지 않는다
 *
 * `after()`는 요청 범위 밖에서 부를 수 없다. 콜백을 모아 두었다가 테스트가 「응답이 끝난 뒤」를 직접 흉내 낸다
 * (선례: `src/app/api/drops/__tests__/route.test.ts`).
 *
 * 실행: cd jam-web && npx vitest run "src/app/api/itembooks/[id]/slot/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { d } from '@/lib/i18n'
import { deterministicSourceId } from '@/lib/chapter/source-id'

const USER_ID = 'user-1'
const ITEM_BOOK_ID = 'book-1'
const SLOT = { id: 'slot-1', item_book_id: ITEM_BOOK_ID, badge_id: 'badge-1', inventory_item_id: 'item-1' }

const state = vi.hoisted(() => ({
  authenticated: true,
  /** RPC 이름 → 결과 */
  rpc: {} as Record<string, { data: unknown; error: unknown }>,
  rpcCalls: [] as { name: string; args: unknown }[],
  afterCallbacks: [] as (() => unknown)[],
  /** `item_books`에서 읽히는 행. null이면 컬렉션이 없다 */
  book: null as { is_active: boolean; valid_from: string | null; valid_until: string | null; tier_mode?: boolean } | null,
  bookError: null as { message: string } | null,
  /** `inventory_items`에서 locked = true로 조회되는 행 */
  lockedRows: [] as { id: string }[],
  lockedError: null as { message: string } | null,
  /** `user_suspensions`에서 진행 중인 정지로 읽히는 행. null이면 정지 아님 */
  suspension: null as { id: string; reason: string; suspended_at: string } | null,
  suspensionError: null as { message: string } | null,
  /** `user_item_book_completions`에 (유저, 컬렉션) 완성 기록이 있는지 — 장착 RPC가 완성을 만들면 true로 바뀐다 */
  completionExists: false,
  /** 장착 RPC(옛 함수)가 호출되면 완성 기록을 만든다 — 이번 장착으로 새로 완성한 경우를 흉내낸다 */
  completeOnSlot: false,
  completionReadError: null as { message: string } | null,
  /** 완성 기록 조회 횟수(등급형은 읽지 않는다) */
  completionReads: 0,
}))

const runJamActionMock = vi.hoisted(() => vi.fn<(userId: string, triggers: readonly string[]) => Promise<void>>())
const runSlotRewardMock = vi.hoisted(() => vi.fn<(userId: string, itemBookId: string, completedTier?: string | null) => Promise<void>>())
/** `after` 콜백 안에서 두 함수가 불린 순서 */
const callOrder = vi.hoisted(() => [] as string[])
/** 서비스 활동 잼 지급(awardServiceJam) — 호출 인자를 본다. 실제 RPC는 부르지 않는다 */
const awardScoreMock = vi.hoisted(() =>
  vi.fn<(supabase: unknown, input: { userId: string; kind: string; sourceId: string }) => Promise<{ ok: boolean; granted?: number; duplicate?: boolean; capped?: boolean }>>(),
)
/** 점수를 세지 못한 기록 — `engine_decision_log` 쓰기를 가로챈다 */
const logMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>())

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    auth: {
      getUser: async () =>
        state.authenticated
          ? { data: { user: { id: USER_ID } }, error: null }
          : { data: { user: null }, error: { message: 'invalid token' } },
    },
    rpc: async (name: string, args: unknown) => {
      state.rpcCalls.push({ name, args })
      if (name === 'slot_item_into_book' && state.completeOnSlot && state.rpc[name]?.data) state.completionExists = true
      return state.rpc[name] ?? { data: null, error: { message: `예상하지 못한 RPC: ${name}` } }
    },
    from: (table: string) => {
      if (table === 'user_suspensions') {
        const suspensionBuilder = {
          select: () => suspensionBuilder,
          eq: () => suspensionBuilder,
          is: () => suspensionBuilder,
          maybeSingle: async () => ({ data: state.suspensionError ? null : state.suspension, error: state.suspensionError }),
        }
        return suspensionBuilder
      }
      if (table === 'user_item_book_completions') {
        const completionBuilder = {
          select: () => completionBuilder,
          eq: () => completionBuilder,
          maybeSingle: async () => {
            state.completionReads += 1
            if (state.completionReadError) return { data: null, error: state.completionReadError }
            return { data: state.completionExists ? { item_book_id: ITEM_BOOK_ID } : null, error: null }
          },
        }
        return completionBuilder
      }
      if (table === 'inventory_items') {
        const lockedBuilder: Record<string, unknown> = {}
        lockedBuilder.select = () => lockedBuilder
        lockedBuilder.in = () => lockedBuilder
        lockedBuilder.eq = () => lockedBuilder
        lockedBuilder.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          Promise.resolve({ data: state.lockedRows, error: state.lockedError }).then(onFulfilled, onRejected)
        return lockedBuilder
      }
      if (table !== 'item_books') throw new Error(`예상하지 못한 테이블: ${table}`)
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: state.bookError ? null : state.book, error: state.bookError }),
      }
      return builder
    },
  }),
}))
vi.mock('@/lib/jam/serviceActivity', () => ({
  awardServiceJam: (supabase: unknown, input: { userId: string; kind: string; sourceId: string }) => awardScoreMock(supabase, input),
}))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: (...args: unknown[]) => logMock(...args) }))
vi.mock('@/lib/badge-engine/jamActionRoute', () => ({
  runJamActionEvaluation: (userId: string, triggers: readonly string[]) => runJamActionMock(userId, triggers),
}))
vi.mock('@/lib/itembook/slotReward', () => ({
  runSlotRewardIssue: (...args: [string, string, (string | null)?]) => runSlotRewardMock(...args),
}))
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (cb: () => unknown) => void state.afterCallbacks.push(cb) }
})

import { POST, DELETE, PATCH } from '../route'

const PARAMS = { params: Promise.resolve({ id: ITEM_BOOK_ID }) }

function request(method: 'POST' | 'DELETE' | 'PATCH', body: unknown, opts: { auth?: boolean } = {}): NextRequest {
  const headers: Record<string, string> = {}
  if (opts.auth !== false) headers.authorization = 'Bearer token-1'
  return new NextRequest(`http://localhost/api/itembooks/${ITEM_BOOK_ID}/slot`, {
    method,
    headers,
    body: JSON.stringify(body),
  })
}

/** 응답이 끝난 뒤를 흉내 낸다 — 예약된 `after` 콜백을 모두 실행한다 */
async function flushAfter() {
  const callbacks = state.afterCallbacks.splice(0)
  await Promise.allSettled(callbacks.map((cb) => cb()))
}

beforeEach(() => {
  vi.clearAllMocks()
  state.authenticated = true
  state.rpc = {
    slot_item_into_book: { data: { ok: true, slot: SLOT }, error: null },
    unslot_item_from_book: { data: { ok: true }, error: null },
    swap_item_in_book: { data: { ok: true, slot: SLOT }, error: null },
  }
  state.rpcCalls = []
  state.afterCallbacks = []
  state.book = { is_active: true, valid_from: null, valid_until: null }
  state.bookError = null
  state.lockedRows = []
  state.lockedError = null
  state.suspension = null
  state.suspensionError = null
  state.completionExists = false
  state.completeOnSlot = false
  state.completionReadError = null
  state.completionReads = 0
  callOrder.length = 0
  awardScoreMock.mockReset()
  awardScoreMock.mockResolvedValue({ ok: true, granted: 30, duplicate: false, capped: false })
  logMock.mockReset()
  logMock.mockResolvedValue(undefined)
  runJamActionMock.mockImplementation(async () => {
    callOrder.push('runJamActionEvaluation')
  })
  runSlotRewardMock.mockImplementation(async () => {
    callOrder.push('runSlotRewardIssue')
  })
})

describe('POST 성공 — after()로 보상 배지를 발급하고 완성한 컬렉션 수를 판정한다', () => {
  it('판정을 1회 예약하고, 콜백이 장착한 사람의 collection_complete_count로 runJamActionEvaluation을 부른다', async () => {
    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ slot: SLOT })
    expect(state.afterCallbacks).toHaveLength(1)
    // 응답을 보내기 전에는 판정을 돌리지 않는다 — after 콜백이 실행될 때만 부른다
    expect(runJamActionMock).not.toHaveBeenCalled()

    await flushAfter()
    expect(runJamActionMock).toHaveBeenCalledTimes(1)
    expect(runJamActionMock).toHaveBeenCalledWith(USER_ID, ['collection_complete_count'])
  })

  it('같은 after 예약 안에서 장착한 컬렉션의 보상 배지 발급을 먼저 부르고 이어서 JAM! 판정을 부른다(티켓 20261001_0635)', async () => {
    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)

    expect(res.status).toBe(201)
    // 예약은 한 번이다 — 보상 배지 발급용 예약을 따로 만들지 않는다
    expect(state.afterCallbacks).toHaveLength(1)
    // 응답을 보내기 전에는 발급도 하지 않는다
    expect(runSlotRewardMock).not.toHaveBeenCalled()

    await flushAfter()
    expect(runSlotRewardMock).toHaveBeenCalledTimes(1)
    expect(runSlotRewardMock).toHaveBeenCalledWith(USER_ID, ITEM_BOOK_ID)
    expect(callOrder).toEqual(['runSlotRewardIssue', 'runJamActionEvaluation'])
  })

  it('장착 RPC에는 기존과 같은 인자를 넘긴다', async () => {
    await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    expect(state.rpcCalls).toEqual([
      {
        name: 'slot_item_into_book',
        args: { p_user_id: USER_ID, p_item_book_id: ITEM_BOOK_ID, p_inventory_item_id: 'item-1' },
      },
    ])
  })

  it('판정이 거부돼도 응답은 판정이 정상일 때와 같다', async () => {
    runJamActionMock.mockRejectedValue(new Error('판정 장애'))

    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ slot: SLOT })

    // 콜백이 거부돼도 이미 보낸 응답에는 영향이 없다(테스트 헬퍼가 거부를 삼킨다)
    await flushAfter()
    expect(runJamActionMock).toHaveBeenCalledTimes(1)
  })

  it('보상 배지 발급이 거부돼도 응답은 그대로다', async () => {
    runSlotRewardMock.mockRejectedValue(new Error('발급 장애'))

    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ slot: SLOT })

    await flushAfter()
    expect(runSlotRewardMock).toHaveBeenCalledTimes(1)
  })
})

describe('POST 실패 분기에서는 판정을 예약하지 않는다 — 응답은 그대로다', () => {
  it('401 인증 헤더 없음', async () => {
    const res = await POST(request('POST', { inventory_item_id: 'item-1' }, { auth: false }), PARAMS)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: d.common.authRequired })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('401 유효하지 않은 토큰', async () => {
    state.authenticated = false
    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: d.common.authRequired })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('400 inventory_item_id 없음', async () => {
    const res = await POST(request('POST', {}), PARAMS)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: d.itembooks.slotMissingInventoryItemId })
    expect(state.afterCallbacks).toHaveLength(0)
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('500 RPC 오류', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.rpc.slot_item_into_book = { data: null, error: { message: 'rpc 장애' } }
    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.itembooks.slotFailed })
    expect(state.afterCallbacks).toHaveLength(0)
    consoleError.mockRestore()
  })

  it.each([
    ['inventory_not_found', 404, d.itembooks.inventoryNotFound],
    ['item_not_found', 404, d.itembooks.itemNotFound],
    ['already_dropped', 409, d.itembooks.alreadyDropped],
    ['not_owner', 403, d.itembooks.notOwner],
    ['already_slotted', 409, d.itembooks.alreadySlotted],
    ['badge_not_found', 404, d.itembooks.badgeNotFound],
    ['wrong_item_book', 400, d.itembooks.wrongItemBook],
    ['slot_insert_failed', 500, d.itembooks.slotFailed],
  ])('ok:false(%s) → %i', async (code, status, message) => {
    state.rpc.slot_item_into_book = { data: { ok: false, error: code }, error: null }
    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual({ error: message })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('ok:false(알 수 없는 코드) → 500', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.rpc.slot_item_into_book = { data: { ok: false, error: 'unknown_code' }, error: null }
    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.itembooks.slotFailed })
    expect(state.afterCallbacks).toHaveLength(0)
    consoleError.mockRestore()
  })
})

describe('POST — 공개되지 않은 컬렉션에는 장착할 수 없다(티켓 20260930_1516)', () => {
  const FAR_FUTURE = '2999-01-01T00:00:00+00:00'
  const LONG_PAST = '2000-01-01T00:00:00+00:00'

  it.each([
    ['비활성', { is_active: false, valid_from: null, valid_until: null }],
    ['시작 전', { is_active: true, valid_from: FAR_FUTURE, valid_until: null }],
    ['컬렉션 없음', null],
  ])('%s → 404이고 장착 RPC를 부르지 않는다', async (_label, book) => {
    state.book = book
    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: d.itembooks.itemBookNotFound })
    expect(state.rpcCalls).toHaveLength(0)
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('기간이 끝난 컬렉션은 막지 않는다 — 보유자는 계속 장착할 수 있다(E1)', async () => {
    state.book = { is_active: true, valid_from: LONG_PAST, valid_until: LONG_PAST }
    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)

    expect(res.status).toBe(201)
    expect(state.rpcCalls.map((c) => c.name)).toEqual(['slot_item_into_book'])
  })

  it('컬렉션 조회가 실패하면 500이고 장착 RPC를 부르지 않는다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.bookError = { message: 'db 장애' }
    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.itembooks.slotFailed })
    expect(state.rpcCalls).toHaveLength(0)
    consoleError.mockRestore()
  })

  it('inventory_item_id가 없으면 컬렉션을 읽기 전에 400이다(기존 순서 유지)', async () => {
    state.book = null
    const res = await POST(request('POST', {}), PARAMS)
    expect(res.status).toBe(400)
  })
})

describe('DELETE(해제)·PATCH(교체)에서는 판정·보상 배지 발급을 예약하지 않는다 — 응답은 그대로다', () => {
  it('DELETE 성공', async () => {
    const res = await DELETE(request('DELETE', { slot_id: 'slot-1' }), PARAMS)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(state.afterCallbacks).toHaveLength(0)
    await flushAfter()
    expect(runJamActionMock).not.toHaveBeenCalled()
    expect(runSlotRewardMock).not.toHaveBeenCalled()
  })

  it('PATCH 성공', async () => {
    const res = await PATCH(request('PATCH', { slot_id: 'slot-1', new_inventory_item_id: 'item-2' }), PARAMS)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slot: SLOT })
    expect(state.afterCallbacks).toHaveLength(0)
    await flushAfter()
    expect(runJamActionMock).not.toHaveBeenCalled()
    expect(runSlotRewardMock).not.toHaveBeenCalled()
  })

  it('DELETE ok:false', async () => {
    state.rpc.unslot_item_from_book = { data: { ok: false, error: 'slot_not_found' }, error: null }
    const res = await DELETE(request('DELETE', { slot_id: 'slot-1' }), PARAMS)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: d.itembooks.slotNotFound })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('DELETE 가득 참 거절은 409에 code(inventory_full)를 싣고 문구에 칸 수 숫자가 없다(티켓 20261018_0056)', async () => {
    state.rpc.unslot_item_from_book = { data: { ok: false, error: 'inventory_full' }, error: null }
    const res = await DELETE(request('DELETE', { slot_id: 'slot-1' }), PARAMS)
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string; code: string }
    expect(body).toEqual({ error: d.itembooks.inventoryFullForUnslot, code: 'inventory_full' })
    expect(body.error).not.toMatch(/\d/)
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('PATCH ok:false', async () => {
    state.rpc.swap_item_in_book = { data: { ok: false, error: 'same_item' }, error: null }
    const res = await PATCH(request('PATCH', { slot_id: 'slot-1', new_inventory_item_id: 'item-2' }), PARAMS)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: d.itembooks.sameItem })
    expect(state.afterCallbacks).toHaveLength(0)
  })
})

describe('등급별 구조(tier_mode) — 꺼진 컬렉션은 이전과 같고 켜진 컬렉션은 새 함수를 부른다(티켓 20261016_2340)', () => {
  const TIER_SLOT = { ...SLOT, id: 'slot-tier' }
  const ARGS = { p_user_id: USER_ID, p_item_book_id: ITEM_BOOK_ID, p_inventory_item_id: 'item-1' }
  const SWAP_ARGS = {
    p_user_id: USER_ID,
    p_item_book_id: ITEM_BOOK_ID,
    p_slot_id: 'slot-1',
    p_new_inventory_item_id: 'item-2',
  }

  it('꺼진 컬렉션(tier_mode: false) 장착은 옛 RPC·옛 인자이고 보상 발급은 인자 두 개다(회귀)', async () => {
    state.book = { is_active: true, valid_from: null, valid_until: null, tier_mode: false }
    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)

    expect(res.status).toBe(201)
    expect(state.rpcCalls).toEqual([{ name: 'slot_item_into_book', args: ARGS }])
    await flushAfter()
    expect(runSlotRewardMock.mock.calls).toEqual([[USER_ID, ITEM_BOOK_ID]])
  })

  it('꺼진 컬렉션은 RPC가 completed_tier를 돌려줘도 무시하고 인자 두 개로 부른다', async () => {
    state.rpc.slot_item_into_book = { data: { ok: true, slot: SLOT, completed_tier: 'common' }, error: null }
    await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    await flushAfter()
    expect(runSlotRewardMock.mock.calls).toEqual([[USER_ID, ITEM_BOOK_ID]])
  })

  it('켜진 컬렉션 장착은 slot_item_into_book_tiered를 같은 인자로 부른다', async () => {
    state.book = { is_active: true, valid_from: null, valid_until: null, tier_mode: true }
    state.rpc.slot_item_into_book_tiered = { data: { ok: true, slot: TIER_SLOT, tier: 'rare', completed_tier: null }, error: null }
    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ slot: TIER_SLOT })
    expect(state.rpcCalls).toEqual([{ name: 'slot_item_into_book_tiered', args: ARGS }])
  })

  it('켜진 컬렉션이 등급을 새로 완성하면 completed_tier를 보상 발급의 세 번째 인자로 넘긴 뒤 JAM! 판정을 부른다', async () => {
    state.book = { is_active: true, valid_from: null, valid_until: null, tier_mode: true }
    state.rpc.slot_item_into_book_tiered = { data: { ok: true, slot: TIER_SLOT, tier: 'epic', completed_tier: 'epic' }, error: null }
    await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)

    expect(state.afterCallbacks).toHaveLength(1)
    await flushAfter()
    expect(runSlotRewardMock.mock.calls).toEqual([[USER_ID, ITEM_BOOK_ID, 'epic']])
    expect(callOrder).toEqual(['runSlotRewardIssue', 'runJamActionEvaluation'])
  })

  it('켜진 컬렉션이 새로 완성한 등급이 없으면 보상 발급은 부르지 않고 JAM! 판정은 부른다', async () => {
    state.book = { is_active: true, valid_from: null, valid_until: null, tier_mode: true }
    state.rpc.slot_item_into_book_tiered = { data: { ok: true, slot: TIER_SLOT, tier: 'epic', completed_tier: null }, error: null }
    await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    await flushAfter()

    expect(runSlotRewardMock).not.toHaveBeenCalled()
    expect(runJamActionMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['tier_mismatch', 409, d.itembooks.tierMismatch],
    ['tier_mode_off', 409, d.itembooks.tierModeOff],
    ['item_book_not_found', 404, d.itembooks.itemBookNotFound],
    ['already_slotted', 409, d.itembooks.alreadySlotted],
  ])('켜진 컬렉션 장착 ok:false(%s) → %i이고 후속 작업을 예약하지 않는다', async (code, status, message) => {
    state.book = { is_active: true, valid_from: null, valid_until: null, tier_mode: true }
    state.rpc.slot_item_into_book_tiered = { data: { ok: false, error: code }, error: null }
    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)

    expect(res.status).toBe(status)
    expect(await res.json()).toEqual({ error: message })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('꺼진 컬렉션의 옛 RPC가 tier_mismatch를 돌려줘도(발생하지 않는 코드) 같은 표로 응답한다', async () => {
    state.rpc.slot_item_into_book = { data: { ok: false, error: 'tier_mismatch' }, error: null }
    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: d.itembooks.tierMismatch })
  })

  it('꺼진 컬렉션 교체는 swap_item_in_book을 이전과 같은 인자로 부른다(회귀)', async () => {
    state.book = { is_active: true, valid_from: null, valid_until: null, tier_mode: false }
    const res = await PATCH(request('PATCH', { slot_id: 'slot-1', new_inventory_item_id: 'item-2' }), PARAMS)

    expect(res.status).toBe(200)
    expect(state.rpcCalls).toEqual([{ name: 'swap_item_in_book', args: SWAP_ARGS }])
  })

  it('컬렉션 행이 없으면 교체는 옛 RPC로 보낸다(이전과 같은 응답)', async () => {
    state.book = null
    await PATCH(request('PATCH', { slot_id: 'slot-1', new_inventory_item_id: 'item-2' }), PARAMS)
    expect(state.rpcCalls.map((c) => c.name)).toEqual(['swap_item_in_book'])
  })

  it('켜진 컬렉션 교체는 swap_item_in_book_tiered를 같은 인자로 부른다', async () => {
    state.book = { is_active: true, valid_from: null, valid_until: null, tier_mode: true }
    state.rpc.swap_item_in_book_tiered = { data: { ok: true, slot: TIER_SLOT }, error: null }
    const res = await PATCH(request('PATCH', { slot_id: 'slot-1', new_inventory_item_id: 'item-2' }), PARAMS)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slot: TIER_SLOT })
    expect(state.rpcCalls).toEqual([{ name: 'swap_item_in_book_tiered', args: SWAP_ARGS }])
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it.each([
    ['tier_mismatch', 409, d.itembooks.tierMismatch],
    ['tier_mode_off', 409, d.itembooks.tierModeOff],
    ['item_book_not_found', 404, d.itembooks.itemBookNotFound],
    ['wrong_badge', 400, d.itembooks.wrongBadge],
  ])('켜진 컬렉션 교체 ok:false(%s) → %i', async (code, status, message) => {
    state.book = { is_active: true, valid_from: null, valid_until: null, tier_mode: true }
    state.rpc.swap_item_in_book_tiered = { data: { ok: false, error: code }, error: null }
    const res = await PATCH(request('PATCH', { slot_id: 'slot-1', new_inventory_item_id: 'item-2' }), PARAMS)

    expect(res.status).toBe(status)
    expect(await res.json()).toEqual({ error: message })
  })

  it('교체 중 컬렉션 조회가 실패하면 500이고 RPC를 부르지 않는다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.bookError = { message: 'db 장애' }
    const res = await PATCH(request('PATCH', { slot_id: 'slot-1', new_inventory_item_id: 'item-2' }), PARAMS)

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.itembooks.swapFailed })
    expect(state.rpcCalls).toHaveLength(0)
    consoleError.mockRestore()
  })

  it('해제(DELETE)는 컬렉션 설정과 관계없이 unslot_item_from_book을 부른다', async () => {
    state.book = { is_active: true, valid_from: null, valid_until: null, tier_mode: true }
    await DELETE(request('DELETE', { slot_id: 'slot-1' }), PARAMS)
    expect(state.rpcCalls.map((c) => c.name)).toEqual(['unslot_item_from_book'])
  })
})

describe('잠긴 개체는 장착·교체할 수 없다 (티켓 20261018_0051)', () => {
  const LOCKED_BODY = { error: d.lockedItem.slot, code: 'locked_item_not_allowed' }

  it('장착: 잠긴 개체는 RPC 전에 409로 거절하고 보상·판정을 예약하지 않는다', async () => {
    state.lockedRows = [{ id: 'item-1' }]
    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual(LOCKED_BODY)
    expect(state.rpcCalls).toEqual([])
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('장착: RPC가 트리거 오류를 올려도 같은 코드로 409를 낸다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.rpc.slot_item_into_book = { data: null, error: { message: 'locked_item_cannot_be_slotted' } }
    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual(LOCKED_BODY)
    expect(state.afterCallbacks).toHaveLength(0)
    consoleError.mockRestore()
  })

  it('장착: 잠김 여부를 읽지 못하면 500이고 RPC를 부르지 않는다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.lockedError = { message: 'db down' }
    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.itembooks.slotFailed })
    expect(state.rpcCalls).toEqual([])
    consoleError.mockRestore()
  })

  it('교체: 새 개체가 잠겼으면 RPC 전에 409로 거절한다', async () => {
    state.lockedRows = [{ id: 'item-2' }]
    const res = await PATCH(request('PATCH', { slot_id: 'slot-1', new_inventory_item_id: 'item-2' }), PARAMS)

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual(LOCKED_BODY)
    expect(state.rpcCalls).toEqual([])
  })

  it('교체: RPC가 트리거 오류를 올려도 같은 코드로 409를 낸다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.rpc.swap_item_in_book = { data: null, error: { message: 'locked_item_cannot_be_slotted' } }
    const res = await PATCH(request('PATCH', { slot_id: 'slot-1', new_inventory_item_id: 'item-2' }), PARAMS)

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual(LOCKED_BODY)
    consoleError.mockRestore()
  })

  it('열린 개체는 그대로 장착·교체한다', async () => {
    const slotRes = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    expect(slotRes.status).toBe(201)
    const swapRes = await PATCH(request('PATCH', { slot_id: 'slot-1', new_inventory_item_id: 'item-2' }), PARAMS)
    expect(swapRes.status).toBe(200)
  })
})

describe('이용 정지 — 컬렉션 장착은 정지 중에 막힌다 (티켓 20261019_1315 3회)', () => {
  const SUSPENSION = { id: 'suspension-1', reason: '운영 정책 위반', suspended_at: '2026-10-01T00:00:00.000Z' }

  it('정지 중이면 403 user_suspended이고 장착 RPC·보상·점수를 부르지 않는다', async () => {
    state.suspension = SUSPENSION

    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.suspension.itemBookSlotBlocked, code: 'user_suspended' })
    expect(state.rpcCalls).toEqual([])
    expect(state.afterCallbacks).toHaveLength(0)
    expect(state.completionReads).toBe(0)
    expect(awardScoreMock).not.toHaveBeenCalled()
  })

  it('정지 문구는 현상·원인·해결책 순의 해요체이고 «슬롯»이라는 내부 용어를 쓰지 않는다', () => {
    const message = d.suspension.itemBookSlotBlocked
    expect(message).toContain('장착할 수 없어요')
    expect(message).toContain('이용이 정지된 계정')
    expect(message).toContain('문의')
    expect(message).not.toContain('슬롯')
  })

  it('정지 조회가 실패하면 500이고 장착시키지 않는다(조회 실패 틈에 장착하면 안 된다)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.suspensionError = { message: 'db 장애' }

    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.itembooks.slotFailed })
    expect(state.rpcCalls).toEqual([])
    expect(state.afterCallbacks).toHaveLength(0)
    consoleError.mockRestore()
  })

  it('정지 중에도 해제(DELETE)와 교체(PATCH)는 막지 않는다 — 완성을 만들지 않는다', async () => {
    state.suspension = SUSPENSION

    const unslot = await DELETE(request('DELETE', { slot_id: 'slot-1' }), PARAMS)
    const swap = await PATCH(request('PATCH', { slot_id: 'slot-1', new_inventory_item_id: 'item-2' }), PARAMS)

    expect(unslot.status).toBe(200)
    expect(swap.status).toBe(200)
  })

  it('정지가 아니면 이전과 같이 장착한다', async () => {
    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    expect(res.status).toBe(201)
  })
})

describe('챕터 점수 «컬렉션 완성» — 옛 컬렉션(tier_mode 꺼짐) (티켓 20261019_1315 3회, 사용자 결정 4)', () => {
  const COMMON_SOURCE = deterministicSourceId('collection_complete', USER_ID, ITEM_BOOK_ID, 'common')

  it('장착 전에는 완성 기록이 없고 이번 장착으로 완성하면 응답 뒤에 common으로 한 번 센다', async () => {
    state.completeOnSlot = true

    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)

    expect(res.status).toBe(201)
    // 응답을 보내기 전에는 세지 않는다
    expect(awardScoreMock).not.toHaveBeenCalled()
    // 예약은 한 번이다 — 점수용 예약을 따로 만들지 않는다
    expect(state.afterCallbacks).toHaveLength(1)

    await flushAfter()
    expect(awardScoreMock).toHaveBeenCalledTimes(1)
    const [, input] = awardScoreMock.mock.calls[0]
    expect(input).toEqual({ userId: USER_ID, kind: 'collection_complete', sourceId: COMMON_SOURCE })
    expect(input).not.toHaveProperty('occurredOn')
    expect(input).not.toHaveProperty('amount')
  })

  it('이미 완성한 유저가 다시 장착해도 소급 가산하지 않는다', async () => {
    state.completionExists = true // 장착 전부터 완성 기록이 있다

    await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    await flushAfter()

    expect(awardScoreMock).not.toHaveBeenCalled()
    // 장착 전에 한 번만 읽고 장착 후에는 다시 읽지 않는다
    expect(state.completionReads).toBe(1)
  })

  it('완성하지 못한 장착(아직 덜 채움)은 세지 않는다', async () => {
    state.completeOnSlot = false

    await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    await flushAfter()

    expect(awardScoreMock).not.toHaveBeenCalled()
    expect(state.completionReads).toBe(2) // 장착 전후 한 번씩
  })

  it('장착 전 완성 기록을 읽지 못하면 소급 가산을 피하려고 세지 않고 chapter_score_failed를 남긴다 — 장착 응답은 그대로다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.completionReadError = { message: 'db 장애' }
    state.completeOnSlot = true

    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ slot: SLOT })

    await flushAfter()
    expect(awardScoreMock).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledTimes(1)
    expect(logMock).toHaveBeenCalledWith(
      'points',
      'chapter_score_failed',
      USER_ID,
      expect.objectContaining({ kind: 'collection_complete_common', sourceId: COMMON_SOURCE })
    )
    // 보상 배지 발급과 JAM! 판정은 그대로 이어진다
    expect(runSlotRewardMock).toHaveBeenCalledTimes(1)
    expect(runJamActionMock).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })

  it('같은 완성을 다시 보내도 같은 (kind, 원천 id)다 — 다시 «새로 완성»해도 키가 하나', async () => {
    state.completeOnSlot = true
    await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    await flushAfter()

    // 완성 기록이 지워진 것처럼 다시 «새로 완성»해도(예: 관리자 초기화 뒤) 키는 같다
    state.completionExists = false
    await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    await flushAfter()

    const keys = awardScoreMock.mock.calls.map(([, input]) => `${input.kind}:${input.sourceId}`)
    expect(keys).toHaveLength(2)
    expect(new Set(keys).size).toBe(1)
  })

  it('다른 컬렉션이면 키가 다르다', async () => {
    state.completeOnSlot = true
    await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    await flushAfter()
    state.completionExists = false
    await POST(request('POST', { inventory_item_id: 'item-1' }), { params: Promise.resolve({ id: 'book-2' }) })
    await flushAfter()

    const sources = awardScoreMock.mock.calls.map(([, input]) => input.sourceId)
    expect(new Set(sources).size).toBe(2)
  })

  it('점수가 실패(ok: false)해도 응답·보상 배지 발급·JAM! 판정은 그대로다', async () => {
    awardScoreMock.mockResolvedValue({ ok: false })
    state.completeOnSlot = true

    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ slot: SLOT })

    await flushAfter()
    expect(runSlotRewardMock.mock.calls).toEqual([[USER_ID, ITEM_BOOK_ID]])
    expect(callOrder).toEqual(['runSlotRewardIssue', 'runJamActionEvaluation'])
  })

  it('점수가 거부돼도(던지는 구현 오류) 보상 배지 발급과 JAM! 판정은 그대로 이어진다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    awardScoreMock.mockRejectedValue(new Error('점수 장애'))
    state.completeOnSlot = true

    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    expect(res.status).toBe(201)

    await flushAfter()
    expect(runSlotRewardMock).toHaveBeenCalledTimes(1)
    expect(runJamActionMock).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })

  it('실패 분기(RPC 오류·ok:false)와 해제·교체에서는 세지 않는다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.completeOnSlot = true
    state.rpc.slot_item_into_book = { data: { ok: false, error: 'already_slotted' }, error: null }
    await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    state.rpc.slot_item_into_book = { data: null, error: { message: 'rpc 장애' } }
    await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    await DELETE(request('DELETE', { slot_id: 'slot-1' }), PARAMS)
    await PATCH(request('PATCH', { slot_id: 'slot-1', new_inventory_item_id: 'item-2' }), PARAMS)
    await flushAfter()

    expect(awardScoreMock).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

describe('챕터 점수 «컬렉션 완성» — 등급형(tier_mode 켜짐) (티켓 20261019_1315 3회, 사용자 결정 4)', () => {
  const TIER_BOOK = { is_active: true, valid_from: null, valid_until: null, tier_mode: true }

  function tierResult(completedTier: string | null) {
    return { data: { ok: true, slot: SLOT, tier: 'rare', completed_tier: completedTier }, error: null }
  }

  it.each(['common', 'rare', 'epic', 'mystic'])('이번 장착으로 %s 등급을 새로 완성하면 collection_complete 한 종류로 등급별 원천 id를 한 번 준다', async (tier) => {
    state.book = TIER_BOOK
    state.rpc.slot_item_into_book_tiered = tierResult(tier)

    await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    await flushAfter()

    expect(awardScoreMock).toHaveBeenCalledTimes(1)
    expect(awardScoreMock.mock.calls[0][1]).toEqual({
      userId: USER_ID,
      kind: 'collection_complete',
      sourceId: deterministicSourceId('collection_complete', USER_ID, ITEM_BOOK_ID, tier),
    })
  })

  it('새로 완성한 등급이 없으면(completed_tier null) 세지 않는다', async () => {
    state.book = TIER_BOOK
    state.rpc.slot_item_into_book_tiered = tierResult(null)

    await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    await flushAfter()

    expect(awardScoreMock).not.toHaveBeenCalled()
  })

  it('등급형은 옛 완성 기록을 읽지 않는다(completed_tier가 새로 완성한 등급이다)', async () => {
    state.book = TIER_BOOK
    state.rpc.slot_item_into_book_tiered = tierResult('rare')

    await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    await flushAfter()

    expect(state.completionReads).toBe(0)
  })

  it('알 수 없는 등급 값이면 세지 않고 chapter_score_failed를 남긴다 — 응답은 그대로다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.book = TIER_BOOK
    state.rpc.slot_item_into_book_tiered = tierResult('legendary')

    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    expect(res.status).toBe(201)

    await flushAfter()
    expect(awardScoreMock).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_score_failed', USER_ID, expect.objectContaining({ sourceId: null }))
    consoleError.mockRestore()
  })

  it('옛 컬렉션으로 센 common과 등급형으로 바뀐 뒤 센 common은 같은 (kind, 원천 id)라 이중 가산이 없다', async () => {
    // 1) 등급형을 켜기 전 — 옛 컬렉션이 이번 장착으로 완성
    state.completeOnSlot = true
    await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    await flushAfter()

    // 2) 같은 컬렉션이 등급형으로 전환된 뒤 — common 등급을 완성
    state.book = TIER_BOOK
    state.rpc.slot_item_into_book_tiered = tierResult('common')
    await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    await flushAfter()

    const keys = awardScoreMock.mock.calls.map(([, input]) => `${input.kind}:${input.sourceId}`)
    expect(keys).toHaveLength(2)
    expect(new Set(keys).size).toBe(1) // 같은 키 → DB가 한 번만 센다
  })

  it('점수가 실패해도 등급 보상 배지 발급과 JAM! 판정은 그대로다', async () => {
    awardScoreMock.mockResolvedValue({ ok: false })
    state.book = TIER_BOOK
    state.rpc.slot_item_into_book_tiered = tierResult('epic')

    const res = await POST(request('POST', { inventory_item_id: 'item-1' }), PARAMS)
    expect(res.status).toBe(201)

    await flushAfter()
    expect(runSlotRewardMock.mock.calls).toEqual([[USER_ID, ITEM_BOOK_ID, 'epic']])
    expect(callOrder).toEqual(['runSlotRewardIssue', 'runJamActionEvaluation'])
  })
})
