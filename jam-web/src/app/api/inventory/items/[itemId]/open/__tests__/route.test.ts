/**
 * POST /api/inventory/items/[itemId]/open — 잠긴 아이템 배지 열기 (티켓 20261018_0053)
 *
 * 고정하는 것:
 * - 비로그인은 401이고 열지 않는다. 개체 id가 UUID가 아니면 404 `item_not_found`이고 DB를 부르지 않는다. 대상은 세션 유저뿐이다.
 * - 정상은 200과 같은 개체의 일련번호·준 포인트·낸 포인트·연 뒤 잔액·열린 뒤의 개체 정보다.
 * - 이용 정지는 403(`code: 'user_suspended'`, `d.suspension.lockedItemOpenBlocked`)이다. 앱 코드가 던진 경우와 DB 함수가 거절한 경우 모두다.
 * - 거절: `insufficient_points`(필요한 포인트 `required`·가진 포인트 `balance` 포함)·`not_full`(옛 함수 호환, 채운 양·필요한 양 포함)·`not_locked` 409, `item_not_found` 404. 거절 응답에는 이름·그림·일련번호 등 개체를 알 수 있는 값이 없다(7.3절).
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

const state = vi.hoisted(() => ({ authenticated: true, afterCallbacks: [] as Array<() => unknown> }))
const runJamActionMock = vi.hoisted(() => vi.fn())
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
vi.mock('@/lib/badge-engine/jamActionRoute', () => ({
  runJamActionEvaluation: (userId: string, triggers: readonly string[]) => runJamActionMock(userId, triggers),
}))
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (cb: () => unknown) => void state.afterCallbacks.push(cb) }
})
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
  serialPrefix: 'ABCD',
  pointsAwarded: 50,
  pointsSpent: 50,
  pointBalance: 120,
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
const REVEALING_KEYS = ['name', 'imageUrl', 'description', 'collection', 'tribe', 'serialNumber', 'serialPrefix', 'badgeId', 'item', 'rarity']

beforeEach(() => {
  state.authenticated = true
  state.afterCallbacks = []
  runJamActionMock.mockReset()
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

  it('열기가 성공하면 응답 뒤에 잠긴 아이템 배지를 연 횟수를 판정한다(티켓 20261018_1815)', async () => {
    const res = await post()

    expect(res.status).toBe(200)
    expect(runJamActionMock).not.toHaveBeenCalled() // 응답을 보내기 전에는 부르지 않는다
    expect(state.afterCallbacks).toHaveLength(1)
    await state.afterCallbacks[0]()
    expect(runJamActionMock).toHaveBeenCalledWith(USER_ID, ['locked_item_open_count'])
  })

  it('열기가 거절되면 판정을 예약하지 않는다', async () => {
    openMock.mockRejectedValue(new LockedItemError('not_locked'))

    const res = await post()

    expect(res.status).toBe(409)
    expect(state.afterCallbacks).toHaveLength(0)
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

  it('insufficient_points는 409이고 필요한 포인트·가진 포인트를 싣는다', async () => {
    openMock.mockRejectedValue(new LockedItemError('insufficient_points', { required: 50, balance: 20 }))

    const res = await post()

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: d.lockedItem.open.insufficientPoints, code: 'insufficient_points', required: 50, balance: 20 })
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('퀘스트의 첫 잠긴 배지처럼 낸 포인트가 0인 열기도 200이고 pointsSpent 0을 그대로 싣는다', async () => {
    openMock.mockResolvedValue({ ...OPENED, pointsSpent: 0, pointBalance: 30 })

    const res = await post()

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ pointsSpent: 0, pointBalance: 30 })
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
    ['insufficient_points', new LockedItemError('insufficient_points', { required: 50, balance: 20 })],
    ['not_locked', new LockedItemError('not_locked')],
    ['item_not_found', new LockedItemError('item_not_found')],
    ['user_suspended', new LockedItemError('user_suspended')],
    ['일반 오류', new Error('boom')],
  ])('거절·오류 응답(%s)에는 이름·그림·일련번호 등 개체를 알 수 있는 값이 없다', async (_label, err) => {
    openMock.mockRejectedValue(err)

    const body = await (await post()).json()

    for (const key of REVEALING_KEYS) expect(body, `응답에 ${key}가 있다`).not.toHaveProperty(key)
  })

  it('그 밖의 오류는 500이고 원문 오류를 내려보내지 않는다', async () => {
    openMock.mockRejectedValue(new Error('locked_item_open RPC 오류: secret detail'))
    const res2 = await post()
    expect(res2.status).toBe(500)
    expect(await res2.json()).toEqual({ error: d.lockedItem.open.failed })
  })
})
