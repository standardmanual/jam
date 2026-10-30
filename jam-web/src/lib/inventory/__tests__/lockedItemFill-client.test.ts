/**
 * 잠긴 아이템 배지 열기 클라이언트 fetch 래퍼 (티켓 20261018_0054 2회, 20261028_1741 1회)
 *
 * 응답을 «성공 / 이용 정지 / 거절 / 실패» 넷으로 접는지, 요청 모양(경로·메서드·본문)이 맞는지 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/inventory/__tests__/lockedItemFill-client.test.ts
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as client from '../lockedItemFill-client'
import { isKnownLockedItemRejectCode, openLockedItemRequest } from '../lockedItemFill-client'

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

describe('openLockedItemRequest', () => {
  const OPENED = { itemId: ITEM_ID, badgeId: 'b1', serialNumber: 7, serialPrefix: 'ABCD', pointsAwarded: 50, pointsSpent: 1200, pointBalance: 100, item: null }

  it('POST /api/inventory/items/{id}/open을 본문 없이 부른다', async () => {
    const fn = stubFetch(respond(200, OPENED))
    expect(await openLockedItemRequest(ITEM_ID)).toEqual({ kind: 'ok', data: OPENED })
    expect(fn).toHaveBeenCalledWith(`/api/inventory/items/${ITEM_ID}/open`, { method: 'POST' })
  })

  it('403 user_suspended는 suspended다', async () => {
    stubFetch(respond(403, { error: '이용이 정지된 계정이에요', code: 'user_suspended' }))
    expect(await openLockedItemRequest(ITEM_ID)).toEqual({ kind: 'suspended' })
  })

  it('개체 id는 경로에 안전하게 인코딩한다', async () => {
    const fn = stubFetch(respond(200, OPENED))
    await openLockedItemRequest('a/b?c')
    expect((fn.mock.calls[0] as unknown[])[0]).toBe('/api/inventory/items/a%2Fb%3Fc/open')
  })

  it('알 수 없는 코드의 4xx와 error 문구가 없는 거절은 실패다', async () => {
    stubFetch(respond(400, { error: '이상한 거절', code: 'something_new' }))
    expect(await openLockedItemRequest(ITEM_ID)).toEqual({ kind: 'failed' })
    stubFetch(respond(409, { code: 'insufficient_points' }))
    expect(await openLockedItemRequest(ITEM_ID)).toEqual({ kind: 'failed' })
  })

  it('403이어도 code가 user_suspended가 아니면 suspended가 아니다', async () => {
    stubFetch(respond(403, { error: '권한이 없어요', code: 'forbidden' }))
    expect(await openLockedItemRequest(ITEM_ID)).toEqual({ kind: 'failed' })
  })

  it('insufficient_points 409는 필요 포인트·가진 포인트와 함께 rejected다', async () => {
    const body = { error: '포인트가 모자라서 아이템 배지를 열지 못했어요.', code: 'insufficient_points', required: 1200, balance: 800 }
    stubFetch(respond(409, body))
    expect(await openLockedItemRequest(ITEM_ID)).toEqual({ kind: 'rejected', status: 409, body })
  })

  it('채우기 호출은 더는 내보내지 않는다(화면이 쓰지 않는다)', () => {
    expect(client).not.toHaveProperty('fillLockedItemRequest')
  })

  it('not_full 409는 채운 양·필요한 양과 함께 rejected다', async () => {
    const body = { error: '아직 필요한 양을 다 채우지 못해서 열 수 없어요.', code: 'not_full', required: 120, filled: 60 }
    stubFetch(respond(409, body))
    expect(await openLockedItemRequest(ITEM_ID)).toEqual({ kind: 'rejected', status: 409, body })
  })

  it('500과 네트워크 오류는 실패다(던지지 않는다)', async () => {
    stubFetch(respond(500, { error: '아이템 배지를 열지 못했어요.' }))
    expect(await openLockedItemRequest(ITEM_ID)).toEqual({ kind: 'failed' })
    stubFetch(new TypeError('Failed to fetch'))
    expect(await openLockedItemRequest(ITEM_ID)).toEqual({ kind: 'failed' })
  })
})

describe('isKnownLockedItemRejectCode', () => {
  it('열기 거절 코드를 알고, user_suspended는 거절이 아니다', () => {
    for (const code of ['item_not_found', 'not_locked', 'not_full', 'insufficient_points']) {
      expect(isKnownLockedItemRejectCode(code), code).toBe(true)
    }
    expect(isKnownLockedItemRejectCode('user_suspended')).toBe(false)
    expect(isKnownLockedItemRejectCode('insufficient_slots')).toBe(false)
    expect(isKnownLockedItemRejectCode(undefined)).toBe(false)
  })
})
