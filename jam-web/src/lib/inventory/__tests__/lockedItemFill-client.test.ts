/**
 * 잠긴 아이템 배지 클라이언트 fetch 래퍼 (티켓 20261018_0054 2회)
 *
 * 응답을 «성공 / 이용 정지 / 거절 / 실패» 넷으로 접는지, 요청 모양(경로·메서드·본문)이 맞는지 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/inventory/__tests__/lockedItemFill-client.test.ts
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fillLockedItemRequest, isKnownLockedItemRejectCode, openLockedItemRequest } from '../lockedItemFill-client'

const ITEM_ID = '22222222-2222-4222-8222-222222222222'

function respond(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function stubFetch(res: Response | Error) {
  const fn = vi.fn(async () => {
    if (res instanceof Error) throw res
    return res
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const FILL_OK = { itemId: ITEM_ID, applied: 30, required: 120, filled: 60, remaining: 60, balance: 12, openable: false }

describe('fillLockedItemRequest', () => {
  it('POST /api/inventory/items/{id}/fill에 amount를 JSON으로 보낸다', async () => {
    const fn = stubFetch(respond(200, FILL_OK))
    const result = await fillLockedItemRequest(ITEM_ID, 30)
    expect(result).toEqual({ kind: 'ok', data: FILL_OK })
    expect(fn).toHaveBeenCalledWith(`/api/inventory/items/${ITEM_ID}/fill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 30 }),
    })
  })

  it('개체 id는 경로에 안전하게 인코딩한다', async () => {
    const fn = stubFetch(respond(200, FILL_OK))
    await fillLockedItemRequest('a/b?c', 1)
    expect((fn.mock.calls[0] as unknown[])[0]).toBe('/api/inventory/items/a%2Fb%3Fc/fill')
  })

  it('403 user_suspended는 일반 실패가 아니라 suspended다', async () => {
    stubFetch(respond(403, { error: '이용이 정지된 계정이에요', code: 'user_suspended' }))
    expect(await fillLockedItemRequest(ITEM_ID, 30)).toEqual({ kind: 'suspended' })
  })

  it('403이어도 code가 user_suspended가 아니면 suspended가 아니다', async () => {
    stubFetch(respond(403, { error: '권한이 없어요', code: 'forbidden' }))
    expect(await fillLockedItemRequest(ITEM_ID, 30)).toEqual({ kind: 'failed' })
  })

  it('알려진 거절 코드의 4xx는 rejected이고 서버 문구와 코드를 그대로 싣는다', async () => {
    const body = { error: '남은 양보다 많이는 채울 수 없어요.', code: 'exceeds_remaining', remaining: 30 }
    stubFetch(respond(400, body))
    expect(await fillLockedItemRequest(ITEM_ID, 500)).toEqual({ kind: 'rejected', status: 400, body })
  })

  it('알 수 없는 코드의 4xx와 error 문구가 없는 거절은 실패다', async () => {
    stubFetch(respond(400, { error: '이상한 거절', code: 'something_new' }))
    expect(await fillLockedItemRequest(ITEM_ID, 5)).toEqual({ kind: 'failed' })
    stubFetch(respond(409, { code: 'insufficient_jam' }))
    expect(await fillLockedItemRequest(ITEM_ID, 5)).toEqual({ kind: 'failed' })
  })

  it('500과 네트워크 오류는 실패다(던지지 않는다)', async () => {
    stubFetch(respond(500, { error: '아이템 배지를 채우지 못했어요.' }))
    expect(await fillLockedItemRequest(ITEM_ID, 5)).toEqual({ kind: 'failed' })
    stubFetch(new TypeError('Failed to fetch'))
    expect(await fillLockedItemRequest(ITEM_ID, 5)).toEqual({ kind: 'failed' })
  })
})

describe('openLockedItemRequest', () => {
  const OPENED = { itemId: ITEM_ID, badgeId: 'b1', serialNumber: 7, serialPrefix: 'ABCD', pointsAwarded: 0, item: null }

  it('POST /api/inventory/items/{id}/open을 본문 없이 부른다', async () => {
    const fn = stubFetch(respond(200, OPENED))
    expect(await openLockedItemRequest(ITEM_ID)).toEqual({ kind: 'ok', data: OPENED })
    expect(fn).toHaveBeenCalledWith(`/api/inventory/items/${ITEM_ID}/open`, { method: 'POST' })
  })

  it('403 user_suspended는 suspended다', async () => {
    stubFetch(respond(403, { error: '이용이 정지된 계정이에요', code: 'user_suspended' }))
    expect(await openLockedItemRequest(ITEM_ID)).toEqual({ kind: 'suspended' })
  })

  it('not_full 409는 채운 양·필요한 양과 함께 rejected다', async () => {
    const body = { error: '아직 필요한 양을 다 채우지 못해서 열 수 없어요.', code: 'not_full', required: 120, filled: 60 }
    stubFetch(respond(409, body))
    expect(await openLockedItemRequest(ITEM_ID)).toEqual({ kind: 'rejected', status: 409, body })
  })

  it('500은 실패다', async () => {
    stubFetch(respond(500, { error: '아이템 배지를 열지 못했어요.' }))
    expect(await openLockedItemRequest(ITEM_ID)).toEqual({ kind: 'failed' })
  })
})

describe('isKnownLockedItemRejectCode', () => {
  it('채우기·열기 거절 코드를 알고, user_suspended는 거절이 아니다', () => {
    for (const code of ['item_not_found', 'not_locked', 'already_full', 'invalid_amount', 'exceeds_remaining', 'insufficient_jam', 'not_full']) {
      expect(isKnownLockedItemRejectCode(code), code).toBe(true)
    }
    expect(isKnownLockedItemRejectCode('user_suspended')).toBe(false)
    expect(isKnownLockedItemRejectCode('insufficient_slots')).toBe(false)
    expect(isKnownLockedItemRejectCode(undefined)).toBe(false)
  })
})
