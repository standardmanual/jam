/**
 * POST /api/inventory/items/[itemId]/open — 잠긴 아이템 배지 열기 (티켓 20261018_0053)
 *
 * 고정하는 것:
 * - 비로그인은 401이고 열지 않는다. 개체 id가 UUID가 아니면 404 `item_not_found`이고 DB를 부르지 않는다. 대상은 세션 유저뿐이다.
 * - 정상은 200과 같은 개체의 일련번호·준 포인트·열린 뒤의 개체 정보다.
 * - 이용 정지는 403(`code: 'user_suspended'`, `d.suspension.lockedItemOpenBlocked`)이다. 앱 코드가 던진 경우와 DB 함수가 거절한 경우 모두다.
 * - 거절: `not_full`(채운 양·필요한 양 포함)·`not_locked` 409, `item_not_found` 404. 거절 응답에는 이름·그림·일련번호 등 개체를 알 수 있는 값이 없다(7.3절).
 *   그 밖의 오류는 500(`d.lockedItem.open.failed`)이고 원문 오류를 내려보내지 않는다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/api/inventory/items/[itemId]/open/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { d } from '@/lib/i18n'
import { UserSuspendedError } from '@/lib/suspension/suspension'
import { USER_SUSPENDED_CODE } from '@/lib/suspension/suspension-contract'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const ITEM_ID = '22222222-2222-4222-8222-222222222222'

const state = vi.hoisted(() => ({ authenticated: true }))
const openMock = vi.hoisted(() => vi.fn())
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
  return { ...actual, openLockedItem: (...args: unknown[]) => openMock(...args) }
})

import { LockedItemError } from '@/lib/inventory/lockedItemFill'
import { POST } from '../route'

const post = (itemId: string = ITEM_ID) =>
  POST(new Request(`http://localhost/api/inventory/items/${itemId}/open`, { method: 'POST' }), { params: Promise.resolve({ itemId }) })

const OPENED = {
  itemId: ITEM_ID,
  badgeId: '33333333-3333-4333-8333-333333333333',
  serialNumber: 7,
  pointsAwarded: 50,
  item: {
    name: '새벽의 첫 바퀴',
    imageUrl: 'https://img/x.png',
    description: '새벽에 달린 기록',
    rarity: 'epic',
    collection: { id: 'book-1', name: '새벽 컬렉션' },
    tribe: { id: 'tribe-1', name: '러너' },
  },
}

/** 거절 응답에 있으면 안 되는 개체 정보 키 */
const REVEALING_KEYS = ['name', 'imageUrl', 'description', 'collection', 'tribe', 'serialNumber', 'badgeId', 'item', 'rarity']

beforeEach(() => {
  state.authenticated = true
  openMock.mockReset()
  openMock.mockResolvedValue(OPENED)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/inventory/items/[itemId]/open', () => {
  it('비로그인은 401이고 열지 않는다', async () => {
    state.authenticated = false

    const res = await post()

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: d.common.authRequired })
    expect(openMock).not.toHaveBeenCalled()
  })

  it('개체 id가 UUID가 아니면 404 item_not_found이고 열지 않는다', async () => {
    const res = await post('not-a-uuid')

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: d.lockedItem.itemNotFound, code: 'item_not_found' })
    expect(openMock).not.toHaveBeenCalled()
  })

  it('열면 200과 같은 개체의 일련번호·포인트·열린 뒤의 개체 정보를 싣는다(세션 유저만 대상)', async () => {
    const res = await post()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(OPENED)
    expect(openMock).toHaveBeenCalledWith(serviceClient, USER_ID, ITEM_ID)
  })

  it('앱 코드의 이용 정지는 403 user_suspended다', async () => {
    openMock.mockRejectedValue(new UserSuspendedError({ reason: '어뷰징', suspendedAt: '2026-10-18T00:00:00Z' }))

    const res = await post()

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.suspension.lockedItemOpenBlocked, code: USER_SUSPENDED_CODE })
  })

  it('DB 함수가 이용 정지로 거절해도 403 user_suspended다', async () => {
    openMock.mockRejectedValue(new LockedItemError('user_suspended'))

    const res = await post()

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.suspension.lockedItemOpenBlocked, code: USER_SUSPENDED_CODE })
  })

  it('not_full은 409이고 채운 양·필요한 양을 싣는다', async () => {
    openMock.mockRejectedValue(new LockedItemError('not_full', { required: 100, filled: 60 }))

    const res = await post()

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: d.lockedItem.open.notFull, code: 'not_full', required: 100, filled: 60 })
  })

  it.each([
    ['not_locked', 409, d.lockedItem.notLocked],
    ['item_not_found', 404, d.lockedItem.itemNotFound],
  ] as const)('DB 거절 %s는 %i와 정해진 문구다', async (code, status, message) => {
    openMock.mockRejectedValue(new LockedItemError(code))

    const res = await post()

    expect(res.status).toBe(status)
    expect(await res.json()).toEqual({ error: message, code })
  })

  it.each([
    ['not_full', new LockedItemError('not_full', { required: 100, filled: 60 })],
    ['not_locked', new LockedItemError('not_locked')],
    ['item_not_found', new LockedItemError('item_not_found')],
    ['user_suspended', new LockedItemError('user_suspended')],
    ['일반 오류', new Error('boom')],
  ])('거절·오류 응답(%s)에는 이름·그림·일련번호 등 개체를 알 수 있는 값이 없다', async (_label, err) => {
    openMock.mockRejectedValue(err)

    const body = await (await post()).json()

    for (const key of REVEALING_KEYS) expect(body, `응답에 ${key}가 있다`).not.toHaveProperty(key)
  })

  it('채우기 전용 거절 코드나 그 밖의 오류는 500이고 원문 오류를 내려보내지 않는다', async () => {
    openMock.mockRejectedValue(new LockedItemError('insufficient_jam'))
    const res1 = await post()
    expect(res1.status).toBe(500)
    expect(await res1.json()).toEqual({ error: d.lockedItem.open.failed })

    openMock.mockRejectedValue(new Error('locked_item_open RPC 오류: secret detail'))
    const res2 = await post()
    expect(res2.status).toBe(500)
    expect(await res2.json()).toEqual({ error: d.lockedItem.open.failed })
  })
})
