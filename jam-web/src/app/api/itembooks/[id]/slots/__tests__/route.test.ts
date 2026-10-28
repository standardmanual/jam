/**
 * DELETE /api/itembooks/[id]/slots — 컬렉션에 장착한 배지를 한 번에 모두 해제한다 (티켓 20261028_1420)
 *
 * 검증 대상:
 *  - 인증이 없거나 토큰이 틀리면 401이고 어떤 조회·해제도 하지 않는다
 *  - 장착한 배지를 전부 해제한다: 장착마다 `unslot_item_from_book`을 부르고 유저 id를 실어 보낸다. 응답은 해제한 수를 담는다
 *  - 대상은 «요청한 유저 + 이 컬렉션»의 장착 전부다. 소프트 삭제된 배지에 꽂힌 장착도 걸러 내지 않는다(배지 조인·삭제 필터가 없다).
 *    다른 유저·다른 컬렉션의 장착은 조회 조건에서 빠진다
 *  - 장착이 없으면 성공(해제 0개)이고 인벤토리를 읽지도 해제하지도 않는다
 *  - 인벤토리 빈칸이 장착 수보다 적으면 아무것도 해제하지 않고 409 + `code: inventory_full` + 해제 0개·남은 수를 싣는다(사용자 결정 2026-10-28).
 *    빈칸이 장착 수와 같으면 해제한다(경계). 문구에 칸 수 숫자를 쓰지 않는다
 *  - 사전 확인 뒤 경합으로 중간에 가득 차면 멈추고, 해제한 수·남은 수를 담아 409로 알린다(푼 것이 없으면 «아무것도 해제하지 못했어요» 문구)
 *  - 중간에 RPC가 오류를 내거나 알 수 없는 코드를 돌려주면 멈추고 500에 해제한 수·남은 수를 싣는다
 *
 * 실행: cd jam-web && npx vitest run "src/app/api/itembooks/[id]/slots/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { d } from '@/lib/i18n'
import { INVENTORY_FULL_CODE } from '@/lib/inventory/locked-item-block'

const USER_ID = 'user-1'
const ITEM_BOOK_ID = 'book-1'

type RpcResult = { data: unknown; error: unknown }

const state = vi.hoisted(() => ({
  authenticated: true,
  /** `user_item_book_slots`에서 읽히는 행 */
  slots: [] as { id: string }[],
  slotsError: null as { message: string } | null,
  /** 슬롯 조회에 건 `.eq()` 조건 — 대상 범위(유저·컬렉션)를 본다 */
  slotFilters: [] as [string, unknown][],
  slotSelects: [] as string[],
  /** `inventory`에서 읽히는 행. null이면 인벤토리가 없다 */
  inventory: { used_slots: 0, max_slots: 20 } as { used_slots: number; max_slots: number } | null,
  inventoryError: null as { message: string } | null,
  inventoryReads: 0,
  /** RPC 호출 순서대로 돌려줄 결과. 모자라면 성공(`ok: true`)을 돌려준다 */
  rpcQueue: [] as RpcResult[],
  rpcCalls: [] as { name: string; args: unknown }[],
}))

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
      return state.rpcQueue.shift() ?? { data: { ok: true }, error: null }
    },
    from: (table: string) => {
      if (table === 'user_item_book_slots') {
        const builder = {
          select: (columns: string) => {
            state.slotSelects.push(columns)
            return builder
          },
          eq: (column: string, value: unknown) => {
            state.slotFilters.push([column, value])
            return builder
          },
          then: (resolve: (value: unknown) => unknown) =>
            resolve({ data: state.slotsError ? null : state.slots, error: state.slotsError }),
        }
        return builder
      }
      if (table === 'inventory') {
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => {
            state.inventoryReads += 1
            return { data: state.inventoryError ? null : state.inventory, error: state.inventoryError }
          },
        }
        return builder
      }
      throw new Error(`예상하지 못한 테이블: ${table}`)
    },
  }),
}))

import { DELETE } from '../route'

const PARAMS = { params: Promise.resolve({ id: ITEM_BOOK_ID }) }

function request(opts: { auth?: boolean } = {}): NextRequest {
  const headers: Record<string, string> = {}
  if (opts.auth !== false) headers.authorization = 'Bearer token-1'
  return new NextRequest(`http://localhost/api/itembooks/${ITEM_BOOK_ID}/slots`, { method: 'DELETE', headers })
}

const slotRows = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `slot-${i + 1}` }))
const ok: RpcResult = { data: { ok: true }, error: null }
const full: RpcResult = { data: { ok: false, error: 'inventory_full' }, error: null }

beforeEach(() => {
  state.authenticated = true
  state.slots = []
  state.slotsError = null
  state.slotFilters = []
  state.slotSelects = []
  state.inventory = { used_slots: 0, max_slots: 20 }
  state.inventoryError = null
  state.inventoryReads = 0
  state.rpcQueue = []
  state.rpcCalls = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('인증', () => {
  it('Authorization 헤더가 없으면 401이고 조회·해제를 하지 않는다', async () => {
    state.slots = slotRows(2)

    const res = await DELETE(request({ auth: false }), PARAMS)

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: d.common.authRequired })
    expect(state.slotFilters).toEqual([])
    expect(state.rpcCalls).toEqual([])
  })

  it('토큰이 틀리면 401이고 조회·해제를 하지 않는다', async () => {
    state.authenticated = false
    state.slots = slotRows(2)

    const res = await DELETE(request(), PARAMS)

    expect(res.status).toBe(401)
    expect(state.slotFilters).toEqual([])
    expect(state.rpcCalls).toEqual([])
  })
})

describe('전부 해제', () => {
  it('장착마다 unslot_item_from_book을 순서대로 부르고 해제한 수를 돌려준다', async () => {
    state.slots = slotRows(3)

    const res = await DELETE(request(), PARAMS)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, released: 3, remaining: 0 })
    expect(state.rpcCalls).toEqual([
      { name: 'unslot_item_from_book', args: { p_user_id: USER_ID, p_slot_id: 'slot-1' } },
      { name: 'unslot_item_from_book', args: { p_user_id: USER_ID, p_slot_id: 'slot-2' } },
      { name: 'unslot_item_from_book', args: { p_user_id: USER_ID, p_slot_id: 'slot-3' } },
    ])
  })

  it('대상은 요청한 유저와 이 컬렉션의 장착뿐이다 — 소프트 삭제 배지에 꽂힌 장착도 걸러 내지 않는다', async () => {
    // 삭제된 배지에 꽂힌 장착도 `user_item_book_slots` 행이다. 배지 테이블을 조인하거나 삭제 여부로 거르지 않으므로 같이 풀린다
    state.slots = slotRows(1)

    await DELETE(request(), PARAMS)

    expect(state.slotFilters).toEqual([
      ['user_id', USER_ID],
      ['item_book_id', ITEM_BOOK_ID],
    ])
    expect(state.slotSelects).toEqual(['id'])
    expect(state.rpcCalls).toHaveLength(1)
  })

  it('빈칸이 장착 수와 같으면 해제한다(경계)', async () => {
    state.slots = slotRows(4)
    state.inventory = { used_slots: 16, max_slots: 20 }

    const res = await DELETE(request(), PARAMS)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, released: 4, remaining: 0 })
    expect(state.rpcCalls).toHaveLength(4)
  })

  it('장착이 없으면 성공(해제 0개)이고 인벤토리를 읽지도 해제하지도 않는다', async () => {
    state.slots = []

    const res = await DELETE(request(), PARAMS)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, released: 0, remaining: 0 })
    expect(state.inventoryReads).toBe(0)
    expect(state.rpcCalls).toEqual([])
  })
})

describe('인벤토리 빈칸이 모자라면 아무것도 해제하지 않는다 (사용자 결정 2026-10-28)', () => {
  it('빈칸이 장착 수보다 적으면 409 + code(inventory_full)이고 해제를 한 번도 부르지 않는다', async () => {
    state.slots = slotRows(4)
    state.inventory = { used_slots: 17, max_slots: 20 }

    const res = await DELETE(request(), PARAMS)

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: d.itembooks.unslotAll.shortNotice,
      released: 0,
      remaining: 4,
      code: INVENTORY_FULL_CODE,
    })
    expect(state.rpcCalls).toEqual([])
  })

  it('인벤토리가 가득 차 있어도 같다', async () => {
    state.slots = slotRows(1)
    state.inventory = { used_slots: 20, max_slots: 20 }

    const res = await DELETE(request(), PARAMS)

    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe(INVENTORY_FULL_CODE)
    expect(state.rpcCalls).toEqual([])
  })

  it('사용 칸이 한도를 넘어도(음수 빈칸) 가득 찬 것으로 본다', async () => {
    state.slots = slotRows(1)
    state.inventory = { used_slots: 22, max_slots: 20 }

    const res = await DELETE(request(), PARAMS)

    expect(res.status).toBe(409)
    expect(state.rpcCalls).toEqual([])
  })

  it('안내 문구는 칸 수 숫자를 쓰지 않고 «슬롯·개체·소각»을 쓰지 않는다', () => {
    const { shortNotice, failed } = d.itembooks.unslotAll
    for (const text of [shortNotice, failed]) {
      expect(text).not.toMatch(/\d/)
      expect(text).not.toMatch(/슬롯|개체|소각/)
    }
    expect(shortNotice).toContain('인벤토리 빈칸이 모자라서 해제하지 못했어요')
  })

  it('인벤토리 행이 없으면 404이고 해제하지 않는다', async () => {
    state.slots = slotRows(2)
    state.inventory = null

    const res = await DELETE(request(), PARAMS)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: d.itembooks.inventoryNotFound, released: 0, remaining: 2 })
    expect(state.rpcCalls).toEqual([])
  })
})

describe('해제 도중 경합으로 가득 차면 멈추고 해제한 수를 알린다', () => {
  it('두 개 풀린 뒤 가득 차면 409 + code에 해제 2개·남은 2개와 일부 해제 문구를 싣는다', async () => {
    state.slots = slotRows(4)
    state.rpcQueue = [ok, ok, full]

    const res = await DELETE(request(), PARAMS)

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: '2개를 해제했지만 인벤토리 빈칸이 모자라 나머지 2개는 장착된 채로 남았어요. 인벤토리에서 드랍하거나 믹스해 빈칸을 만든 뒤 다시 해제해 주세요.',
      released: 2,
      remaining: 2,
      code: INVENTORY_FULL_CODE,
    })
    // 가득 찬 3번째에서 멈춘다 — 4번째는 부르지 않는다
    expect(state.rpcCalls).toHaveLength(3)
  })

  it('첫 해제에서 가득 차면(푼 것이 없으면) 아무것도 해제하지 못했다는 문구다', async () => {
    state.slots = slotRows(3)
    state.rpcQueue = [full]

    const res = await DELETE(request(), PARAMS)

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: d.itembooks.unslotAll.shortNotice,
      released: 0,
      remaining: 3,
      code: INVENTORY_FULL_CODE,
    })
    expect(state.rpcCalls).toHaveLength(1)
  })
})

describe('그 밖의 실패는 멈추고 해제한 수를 싣는다', () => {
  it('RPC 오류면 500이고 일반 실패 문구에 해제한 수·남은 수를 싣는다(code 없음)', async () => {
    state.slots = slotRows(3)
    state.rpcQueue = [ok, { data: null, error: { message: 'db down' } }]

    const res = await DELETE(request(), PARAMS)

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.itembooks.unslotAll.failed, released: 1, remaining: 2 })
    expect(state.rpcCalls).toHaveLength(2)
  })

  it('알 수 없는 오류 코드도 500이고 거기서 멈춘다', async () => {
    state.slots = slotRows(3)
    state.rpcQueue = [{ data: { ok: false, error: 'slot_not_found' }, error: null }]

    const res = await DELETE(request(), PARAMS)

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.itembooks.unslotAll.failed, released: 0, remaining: 3 })
    expect(state.rpcCalls).toHaveLength(1)
  })

  it('장착 목록 조회가 실패하면 500이고 해제하지 않는다', async () => {
    state.slotsError = { message: 'db down' }

    const res = await DELETE(request(), PARAMS)

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.itembooks.unslotAll.failed, released: 0, remaining: 0 })
    expect(state.rpcCalls).toEqual([])
  })

  it('인벤토리 조회가 실패하면 500이고 해제하지 않는다', async () => {
    state.slots = slotRows(2)
    state.inventoryError = { message: 'db down' }

    const res = await DELETE(request(), PARAMS)

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.itembooks.unslotAll.failed, released: 0, remaining: 2 })
    expect(state.rpcCalls).toEqual([])
  })
})
