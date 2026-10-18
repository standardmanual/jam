/**
 * POST /api/inventory/items/[itemId]/fill — 잠긴 아이템 배지 채우기 (티켓 20261018_0053)
 *
 * 고정하는 것:
 * - 비로그인은 401이고 채우지 않는다. 개체 id가 UUID가 아니면 404 `item_not_found`이고 DB를 부르지 않는다.
 * - 입력 검증: 본문이 비었거나 `amount`가 없으면 기본값(남은 양)이고, `amount`는 양의 정수(상한 이하)만 받는다. 어기면 400 `invalid_amount`.
 *   본문의 `userId`는 무시하고 세션 유저로만 채운다.
 * - 정상은 200과 채운 양·상태다. 응답에 이름·그림 등 개체를 알 수 있는 값이 없다.
 * - 이용 정지는 403(`code: 'user_suspended'`, `d.suspension.lockedItemFillBlocked`)이다. 앱 코드가 던진 경우와 DB 함수가 거절한 경우 모두다.
 * - DB 거절 코드: `already_full`·`exceeds_remaining`(남은 양 포함)·`invalid_amount` 400, `insufficient_jam`·`not_locked` 409, `item_not_found` 404.
 *   열기 전용 코드나 그 밖의 오류는 500(`d.lockedItem.fill.failed`)이고 원문 오류를 내려보내지 않는다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/api/inventory/items/[itemId]/fill/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { d } from '@/lib/i18n'
import { CAPSULE_AMOUNT_MAX } from '@/lib/capsule/capsule-contract'
import { UserSuspendedError } from '@/lib/suspension/suspension'
import { USER_SUSPENDED_CODE } from '@/lib/suspension/suspension-contract'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '99999999-9999-4999-8999-999999999999'
const ITEM_ID = '22222222-2222-4222-8222-222222222222'

const state = vi.hoisted(() => ({ authenticated: true }))
const fillMock = vi.hoisted(() => vi.fn())
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
  return { ...actual, fillLockedItem: (...args: unknown[]) => fillMock(...args) }
})

import { LockedItemError } from '@/lib/inventory/lockedItemFill'
import { POST } from '../route'

const post = (body?: unknown, itemId: string = ITEM_ID) =>
  POST(
    new Request(`http://localhost/api/inventory/items/${itemId}/fill`, {
      method: 'POST',
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ itemId }) }
  )

const FILLED = { itemId: ITEM_ID, applied: 30, required: 110, filled: 60, remaining: 50, balance: 12, openable: false }

beforeEach(() => {
  state.authenticated = true
  fillMock.mockReset()
  fillMock.mockResolvedValue(FILLED)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/inventory/items/[itemId]/fill — 인증과 입력', () => {
  it('비로그인은 401이고 채우지 않는다', async () => {
    state.authenticated = false

    const res = await post({ amount: 10 })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: d.common.authRequired })
    expect(fillMock).not.toHaveBeenCalled()
  })

  it('개체 id가 UUID가 아니면 404 item_not_found이고 채우지 않는다', async () => {
    const res = await post({ amount: 10 }, 'not-a-uuid')

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: d.lockedItem.itemNotFound, code: 'item_not_found' })
    expect(fillMock).not.toHaveBeenCalled()
  })

  it.each([
    ['본문 없음', undefined],
    ['빈 객체', {}],
    ['amount 생략과 userId만', { userId: OTHER_USER_ID }],
  ])('%s는 기본값(남은 양)으로 채우고 세션 유저만 대상이다', async (_label, body) => {
    const res = await post(body)

    expect(res.status).toBe(200)
    expect(fillMock).toHaveBeenCalledWith(serviceClient, USER_ID, ITEM_ID, undefined)
  })

  it('양의 정수 amount는 그대로 넘기고 개체를 알 수 있는 값 없이 채운 상태만 싣는다', async () => {
    const res = await post({ amount: 30 })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual(FILLED)
    expect(Object.keys(body)).not.toEqual(expect.arrayContaining(['name', 'imageUrl', 'serialNumber', 'badgeId']))
    expect(fillMock).toHaveBeenCalledWith(serviceClient, USER_ID, ITEM_ID, 30)
  })

  it.each([
    ['0', { amount: 0 }],
    ['음수', { amount: -5 }],
    ['소수', { amount: 1.5 }],
    ['문자열', { amount: '10' }],
    ['null', { amount: null }],
    ['상한 초과', { amount: CAPSULE_AMOUNT_MAX + 1 }],
    ['배열 본문', [10]],
    ['JSON이 아닌 본문', 'not json'],
  ])('amount가 %s이면 400 invalid_amount이고 채우지 않는다', async (_label, body) => {
    const res = await post(body)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: d.lockedItem.fill.invalidAmount, code: 'invalid_amount' })
    expect(fillMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/inventory/items/[itemId]/fill — 거절과 오류', () => {
  it('앱 코드의 이용 정지는 403 user_suspended다', async () => {
    fillMock.mockRejectedValue(new UserSuspendedError({ reason: '어뷰징', suspendedAt: '2026-10-18T00:00:00Z' }))

    const res = await post({ amount: 10 })

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.suspension.lockedItemFillBlocked, code: USER_SUSPENDED_CODE })
  })

  it('DB 함수가 이용 정지로 거절해도 403 user_suspended다', async () => {
    fillMock.mockRejectedValue(new LockedItemError('user_suspended'))

    const res = await post()

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.suspension.lockedItemFillBlocked, code: USER_SUSPENDED_CODE })
  })

  it.each([
    ['already_full', 400, d.lockedItem.fill.alreadyFull],
    ['invalid_amount', 400, d.lockedItem.fill.invalidAmount],
    ['insufficient_jam', 409, d.lockedItem.fill.insufficientJam],
    ['not_locked', 409, d.lockedItem.notLocked],
    ['item_not_found', 404, d.lockedItem.itemNotFound],
  ] as const)('DB 거절 %s는 %i와 정해진 문구다', async (code, status, message) => {
    fillMock.mockRejectedValue(new LockedItemError(code))

    const res = await post({ amount: 10 })

    expect(res.status).toBe(status)
    expect(await res.json()).toEqual({ error: message, code })
  })

  it('exceeds_remaining은 400이고 남은 양을 함께 내려준다', async () => {
    fillMock.mockRejectedValue(new LockedItemError('exceeds_remaining', { remaining: 40 }))

    const res = await post({ amount: 999 })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: d.lockedItem.fill.exceedsRemaining, code: 'exceeds_remaining', remaining: 40 })
  })

  it('열기 전용 거절 코드가 채우기에서 나오면 500이다(채우기 문구로 오인하지 않는다)', async () => {
    fillMock.mockRejectedValue(new LockedItemError('not_full'))

    const res = await post({ amount: 10 })

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.lockedItem.fill.failed })
  })

  it('그 밖의 오류는 500이고 원문 오류를 내려보내지 않는다', async () => {
    fillMock.mockRejectedValue(new Error('locked_item_fill RPC 오류: secret detail'))

    const res = await post({ amount: 10 })

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.lockedItem.fill.failed })
  })
})
