/**
 * POST·DELETE·PATCH /api/itembooks/[id]/slot — JAM! 행동 지표(완성한 컬렉션 수) 판정 연동 테스트
 * (티켓 20261001_0633, 상위 20260930_1456 ③)
 *
 * 검증 대상:
 *  - 장착(POST) 성공 뒤 `after()`로 `collection_complete_count` 판정을 1회 예약한다(콜백이 `runJamActionEvaluation`을 부른다)
 *  - 401·400·RPC 오류·`ok: false` 실패 분기에서는 예약하지 않는다
 *  - 해제(DELETE)·교체(PATCH)에서는 예약하지 않는다
 *  - 응답 본문·상태 코드·에러 문구는 변경 전과 같다. 판정이 거부돼도 응답은 그대로다
 *
 * `after()`는 요청 범위 밖에서 부를 수 없다. 콜백을 모아 두었다가 테스트가 「응답이 끝난 뒤」를 직접 흉내 낸다
 * (선례: `src/app/api/drops/__tests__/route.test.ts`).
 *
 * 실행: cd jam-web && npx vitest run "src/app/api/itembooks/[id]/slot/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { d } from '@/lib/i18n'

const USER_ID = 'user-1'
const ITEM_BOOK_ID = 'book-1'
const SLOT = { id: 'slot-1', item_book_id: ITEM_BOOK_ID, badge_id: 'badge-1', inventory_item_id: 'item-1' }

const state = vi.hoisted(() => ({
  authenticated: true,
  /** RPC 이름 → 결과 */
  rpc: {} as Record<string, { data: unknown; error: unknown }>,
  rpcCalls: [] as { name: string; args: unknown }[],
  afterCallbacks: [] as (() => unknown)[],
}))

const runJamActionMock = vi.hoisted(() => vi.fn<(userId: string, triggers: readonly string[]) => Promise<void>>())

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
      return state.rpc[name] ?? { data: null, error: { message: `예상하지 못한 RPC: ${name}` } }
    },
  }),
}))
vi.mock('@/lib/badge-engine/jamActionRoute', () => ({
  runJamActionEvaluation: (userId: string, triggers: readonly string[]) => runJamActionMock(userId, triggers),
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
  runJamActionMock.mockResolvedValue(undefined)
})

describe('POST 성공 — after()로 완성한 컬렉션 수를 판정한다', () => {
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

describe('DELETE(해제)·PATCH(교체)에서는 판정을 예약하지 않는다 — 응답은 그대로다', () => {
  it('DELETE 성공', async () => {
    const res = await DELETE(request('DELETE', { slot_id: 'slot-1' }), PARAMS)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(state.afterCallbacks).toHaveLength(0)
    await flushAfter()
    expect(runJamActionMock).not.toHaveBeenCalled()
  })

  it('PATCH 성공', async () => {
    const res = await PATCH(request('PATCH', { slot_id: 'slot-1', new_inventory_item_id: 'item-2' }), PARAMS)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slot: SLOT })
    expect(state.afterCallbacks).toHaveLength(0)
    await flushAfter()
    expect(runJamActionMock).not.toHaveBeenCalled()
  })

  it('DELETE ok:false', async () => {
    state.rpc.unslot_item_from_book = { data: { ok: false, error: 'slot_not_found' }, error: null }
    const res = await DELETE(request('DELETE', { slot_id: 'slot-1' }), PARAMS)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: d.itembooks.slotNotFound })
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
