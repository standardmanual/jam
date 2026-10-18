/**
 * GET /api/inventory/items/[itemId]/lock — 잠긴 아이템 배지 조회 (티켓 20261018_0053)
 *
 * 고정하는 것:
 * - 비로그인은 401이다. 개체 id가 UUID가 아니면 404 `item_not_found`이고 DB를 부르지 않는다. 대상은 세션 유저뿐이다.
 * - 정상은 200과 채운 양·필요량·남은 양·잼·열 수 있는지다. 이름·그림·설명·컬렉션·트라이브·일련번호는 싣지 않는다(7.3절).
 * - 내 것이 아니거나 없는 개체는 404 `item_not_found`, 그 밖의 오류는 500(`d.lockedItem.loadFailed`)이고 원문 오류를 내려보내지 않는다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/api/inventory/items/[itemId]/lock/__tests__/route.test.ts"
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
  GET(new Request(`http://localhost/api/inventory/items/${itemId}/lock`), { params: Promise.resolve({ itemId }) })

const STATUS = { itemId: ITEM_ID, locked: true, required: 100, filled: 60, remaining: 40, balance: 45, openable: false }

beforeEach(() => {
  state.authenticated = true
  statusMock.mockReset()
  statusMock.mockResolvedValue(STATUS)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/inventory/items/[itemId]/lock', () => {
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

  it('채운 양·필요량·남은 양·잼·열 수 있는지만 싣는다(세션 유저만 대상)', async () => {
    const res = await get()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual(STATUS)
    for (const key of ['name', 'imageUrl', 'description', 'collection', 'tribe', 'serialNumber', 'badgeId', 'rarity']) {
      expect(body, `응답에 ${key}가 있다`).not.toHaveProperty(key)
    }
    expect(statusMock).toHaveBeenCalledWith(serviceClient, USER_ID, ITEM_ID)
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
