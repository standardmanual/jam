/**
 * GET /api/inventory/items/[itemId]/drop-loss — 드랍으로 사라질 채운 양 조회 (티켓 20261018_1812)
 *
 * 고정하는 것:
 * - 비로그인은 401이다. 개체 id가 UUID가 아니면 404 `item_not_found`이고 조회하지 않는다. 대상은 세션 유저뿐이다.
 * - 잠긴 개체는 채운 양을 `{ lostFill }`로 돌려주고, 열린 개체이거나 채운 양이 0이면 0이다.
 * - 응답에는 `lostFill`만 있다(이름·그림·설명·컬렉션·트라이브·일련번호·배지 id·등급 없음, 7.3절).
 * - 내 것이 아니거나 없는 개체는 404 `item_not_found`, 그 밖의 오류는 500이고 원문 오류를 내려보내지 않는다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/api/inventory/items/[itemId]/drop-loss/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { d } from '@/lib/i18n'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const ITEM_ID = '22222222-2222-4222-8222-222222222222'

const state = vi.hoisted(() => ({ authenticated: true }))
const statusMock = vi.hoisted(() => vi.fn())
const serviceClient = vi.hoisted(() => ({ marker: 'service-role-client' }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        state.authenticated
          ? { data: { user: { id: USER_ID } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
  }),
  createServiceClient: () => serviceClient,
}))
vi.mock('@/lib/inventory/lockedItemFill', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/inventory/lockedItemFill')>()
  return { ...actual, getLockedItemStatus: (...args: unknown[]) => statusMock(...args) }
})

import { LockedItemError } from '@/lib/inventory/lockedItemFill'
import { GET } from '../route'

const get = (itemId: string = ITEM_ID) =>
  GET(new Request(`http://localhost/api/inventory/items/${itemId}/drop-loss`), { params: Promise.resolve({ itemId }) })

const LOCKED_STATUS = { itemId: ITEM_ID, locked: true, required: 100, filled: 60, remaining: 40, balance: 45, openable: false }

beforeEach(() => {
  state.authenticated = true
  statusMock.mockReset()
  statusMock.mockResolvedValue(LOCKED_STATUS)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/inventory/items/[itemId]/drop-loss', () => {
  it('비로그인은 401이다', async () => {
    state.authenticated = false

    const res = await get()

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: d.common.authRequired })
    expect(statusMock).not.toHaveBeenCalled()
  })

  it('개체 id가 UUID가 아니면 404 item_not_found이고 조회하지 않는다', async () => {
    const res = await get('not-a-uuid')

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: d.lockedItem.itemNotFound, code: 'item_not_found' })
    expect(statusMock).not.toHaveBeenCalled()
  })

  it('채우다 만 잠긴 개체는 채운 양을 lostFill로 돌려주고 다른 값은 싣지 않는다(세션 유저만 대상)', async () => {
    const res = await get()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ lostFill: 60 })
    expect(statusMock).toHaveBeenCalledWith(serviceClient, USER_ID, ITEM_ID)
  })

  it('채운 양이 0인 잠긴 개체는 0이다', async () => {
    statusMock.mockResolvedValue({ ...LOCKED_STATUS, filled: 0, remaining: 100 })

    const res = await get()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ lostFill: 0 })
  })

  it('열린 개체는 0이다', async () => {
    statusMock.mockResolvedValue({ ...LOCKED_STATUS, locked: false, filled: 100, remaining: 0 })

    const res = await get()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ lostFill: 0 })
  })

  it('내 것이 아니거나 없는 개체는 404 item_not_found다', async () => {
    statusMock.mockRejectedValue(new LockedItemError('item_not_found'))

    const res = await get()

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: d.lockedItem.itemNotFound, code: 'item_not_found' })
  })

  it('그 밖의 오류는 500이고 원문 오류를 내려보내지 않는다', async () => {
    statusMock.mockRejectedValue(new Error('inventory_items 조회 실패: secret detail'))

    const res = await get()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.lockedItem.loadFailed })
  })
})
