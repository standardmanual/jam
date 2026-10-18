/**
 * 캡슐 클라이언트 fetch 래퍼 (티켓 20261018_0054 1회)
 *
 * 응답을 «성공 / 이용 정지 / 거절 / 실패» 넷으로 접는지, 요청 모양(경로·메서드·본문)이 맞는지 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/capsule/__tests__/capsule-client.test.ts
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCapsule, fillCapsuleRequest, isKnownCapsuleRejectCode, openCapsuleRequest } from '../capsule-client'

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

const STATUS = { required: 300, filled: 120, remaining: 180, balance: 50, openable: false, notOpenableReason: 'not_full' }

describe('fetchCapsule', () => {
  it('GET /api/capsule을 캐시 없이 부르고 상태를 돌려준다', async () => {
    const fn = stubFetch(respond(200, STATUS))
    const result = await fetchCapsule()
    expect(result).toEqual({ kind: 'ok', data: STATUS })
    expect(fn).toHaveBeenCalledWith('/api/capsule', { method: 'GET', cache: 'no-store' })
  })

  it('500은 실패다', async () => {
    stubFetch(respond(500, { error: '캡슐 상태를 불러오지 못했어요.' }))
    expect(await fetchCapsule()).toEqual({ kind: 'failed' })
  })

  it('네트워크 오류는 실패다(던지지 않는다)', async () => {
    stubFetch(new TypeError('Failed to fetch'))
    expect(await fetchCapsule()).toEqual({ kind: 'failed' })
  })

  it('200이어도 본문이 JSON이 아니면 실패다', async () => {
    stubFetch(new Response('<html>', { status: 200 }))
    expect(await fetchCapsule()).toEqual({ kind: 'failed' })
  })
})

describe('fillCapsuleRequest', () => {
  it('POST /api/capsule/fill에 amount를 JSON으로 보낸다', async () => {
    const fn = stubFetch(respond(200, { ...STATUS, applied: 40 }))
    const result = await fillCapsuleRequest(40)
    expect(result.kind).toBe('ok')
    expect(fn).toHaveBeenCalledWith('/api/capsule/fill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 40 }),
    })
  })

  it('403 user_suspended는 일반 실패가 아니라 suspended다', async () => {
    stubFetch(respond(403, { error: '이용이 정지된 계정이에요', code: 'user_suspended' }))
    expect(await fillCapsuleRequest(40)).toEqual({ kind: 'suspended' })
  })

  it('403이어도 code가 user_suspended가 아니면 suspended가 아니다', async () => {
    stubFetch(respond(403, { error: '권한이 없어요', code: 'forbidden' }))
    expect(await fillCapsuleRequest(40)).toEqual({ kind: 'failed' })
  })

  it('알려진 거절 코드의 4xx는 rejected이고 서버 문구와 코드를 그대로 싣는다', async () => {
    const body = { error: '남은 양보다 많이는 채울 수 없어요.', code: 'exceeds_remaining', remaining: 30 }
    stubFetch(respond(400, body))
    expect(await fillCapsuleRequest(500)).toEqual({ kind: 'rejected', status: 400, body })
  })

  it('알 수 없는 코드의 4xx는 실패다', async () => {
    stubFetch(respond(400, { error: '이상한 거절', code: 'something_new' }))
    expect(await fillCapsuleRequest(5)).toEqual({ kind: 'failed' })
  })

  it('error 문구가 없는 거절은 실패다', async () => {
    stubFetch(respond(409, { code: 'insufficient_jam' }))
    expect(await fillCapsuleRequest(5)).toEqual({ kind: 'failed' })
  })

  it('401은 실패다', async () => {
    stubFetch(respond(401, { error: '로그인이 필요해요' }))
    expect(await fillCapsuleRequest(5)).toEqual({ kind: 'failed' })
  })
})

describe('openCapsuleRequest', () => {
  it('POST /api/capsule/open을 본문 없이 부른다', async () => {
    const payload = { openId: 'o1', items: [], next: { required: 400, filled: 0 } }
    const fn = stubFetch(respond(200, payload))
    expect(await openCapsuleRequest()).toEqual({ kind: 'ok', data: payload })
    expect(fn).toHaveBeenCalledWith('/api/capsule/open', { method: 'POST' })
  })

  it('403 user_suspended는 suspended다', async () => {
    stubFetch(respond(403, { error: '이용이 정지된 계정이에요', code: 'user_suspended' }))
    expect(await openCapsuleRequest()).toEqual({ kind: 'suspended' })
  })

  it('인벤토리 빈칸 모자람 409는 빈칸 수와 함께 rejected다', async () => {
    const body = { error: '인벤토리 빈칸이 모자라요.', code: 'insufficient_slots', freeSlots: 1, neededSlots: 3 }
    stubFetch(respond(409, body))
    expect(await openCapsuleRequest()).toEqual({ kind: 'rejected', status: 409, body })
  })

  it('500은 실패다', async () => {
    stubFetch(respond(500, { error: '캡슐을 열지 못했어요.' }))
    expect(await openCapsuleRequest()).toEqual({ kind: 'failed' })
  })
})

describe('isKnownCapsuleRejectCode', () => {
  it('채우기·열기 거절 코드를 알고, user_suspended는 거절이 아니다', () => {
    for (const code of ['already_full', 'invalid_amount', 'exceeds_remaining', 'insufficient_jam', 'not_full', 'insufficient_slots', 'invalid_items', 'inventory_not_found', 'no_tribe']) {
      expect(isKnownCapsuleRejectCode(code), code).toBe(true)
    }
    expect(isKnownCapsuleRejectCode('user_suspended')).toBe(false)
    expect(isKnownCapsuleRejectCode('nope')).toBe(false)
    expect(isKnownCapsuleRejectCode(undefined)).toBe(false)
  })
})
