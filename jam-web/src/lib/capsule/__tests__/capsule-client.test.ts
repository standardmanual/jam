/**
 * 캡슐 클라이언트 fetch 래퍼 (티켓 20261018_0054 1회)
 *
 * 응답을 «성공 / 이용 정지 / 거절 / 실패» 넷으로 접는지, 요청 모양(경로·메서드·본문)이 맞는지 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/capsule/__tests__/capsule-client.test.ts
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  claimCapsule,
  fetchCapsule,
  fetchUnseenResult,
  isKnownCapsuleRejectCode,
  markUnseenSeen,
} from '../capsule-client'

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

describe('claimCapsule', () => {
  const PAYLOAD = { claimed: [{ openId: 'o1', chapterNo: 3, items: [] }], remainingPending: 0, stopped: 'none' }

  it('POST /api/capsule/claim을 본문 없이 부르고 받은 결과를 돌려준다', async () => {
    const fn = stubFetch(respond(200, PAYLOAD))
    expect(await claimCapsule()).toEqual({ kind: 'ok', data: PAYLOAD })
    expect(fn).toHaveBeenCalledWith('/api/capsule/claim', { method: 'POST' })
  })

  it('403 user_suspended는 suspended다', async () => {
    stubFetch(respond(403, { error: '정지', code: 'user_suspended' }))
    expect(await claimCapsule()).toEqual({ kind: 'suspended' })
  })

  it.each(['no_pending', 'insufficient_slots', 'no_tribe', 'capsule_changed'])('409 %s는 서버 문구와 코드를 싣는 rejected다', async (code) => {
    const body = { error: '서버 문구', code, freeSlots: 1, neededSlots: 2 }
    stubFetch(respond(409, body))
    expect(await claimCapsule()).toEqual({ kind: 'rejected', status: 409, body })
  })

  it('알 수 없는 코드의 4xx와 코드 없는 500은 실패다', async () => {
    stubFetch(respond(409, { error: '?', code: 'unknown' }))
    expect(await claimCapsule()).toEqual({ kind: 'failed' })
    stubFetch(respond(500, { error: '캡슐 보상을 받지 못했어요.' }))
    expect(await claimCapsule()).toEqual({ kind: 'failed' })
  })

  it('네트워크 오류는 실패다(던지지 않는다)', async () => {
    stubFetch(new TypeError('Failed to fetch'))
    expect(await claimCapsule()).toEqual({ kind: 'failed' })
  })
})

describe('fetchUnseenResult', () => {
  it('GET /api/capsule/unseen을 캐시 없이 부르고 결과를 돌려준다', async () => {
    const body = { result: { ids: ['id-1'], events: [], chapterBadges: [] } }
    const fn = stubFetch(respond(200, body))
    expect(await fetchUnseenResult()).toEqual({ kind: 'ok', data: body })
    expect(fn).toHaveBeenCalledWith('/api/capsule/unseen', { method: 'GET', cache: 'no-store' })
  })

  it('보지 않은 결과가 없으면 result가 null인 ok다', async () => {
    stubFetch(respond(200, { result: null }))
    expect(await fetchUnseenResult()).toEqual({ kind: 'ok', data: { result: null } })
  })

  it('401·500·네트워크 오류는 모두 실패다(던지지 않는다)', async () => {
    stubFetch(respond(401, { error: '로그인이 필요해요' }))
    expect(await fetchUnseenResult()).toEqual({ kind: 'failed' })
    stubFetch(respond(500, { error: '불러오지 못했어요' }))
    expect(await fetchUnseenResult()).toEqual({ kind: 'failed' })
    stubFetch(new TypeError('Failed to fetch'))
    expect(await fetchUnseenResult()).toEqual({ kind: 'failed' })
  })
})

describe('markUnseenSeen', () => {
  it('POST /api/capsule/unseen/seen에 ids를 JSON으로 보낸다', async () => {
    const fn = stubFetch(respond(200, { marked: 2 }))
    expect(await markUnseenSeen(['a', 'b'])).toEqual({ kind: 'ok', data: { marked: 2 } })
    expect(fn).toHaveBeenCalledWith('/api/capsule/unseen/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['a', 'b'] }),
    })
  })

  it('400·500·네트워크 오류는 실패다', async () => {
    stubFetch(respond(400, { error: '확인할 캡슐 결과를 알 수 없어요.' }))
    expect(await markUnseenSeen(['a'])).toEqual({ kind: 'failed' })
    stubFetch(respond(500, { error: '남기지 못했어요' }))
    expect(await markUnseenSeen(['a'])).toEqual({ kind: 'failed' })
    stubFetch(new TypeError('Failed to fetch'))
    expect(await markUnseenSeen(['a'])).toEqual({ kind: 'failed' })
  })
})

describe('isKnownCapsuleRejectCode', () => {
  it('열기 거절 코드를 알고, user_suspended는 거절이 아니다', () => {
    for (const code of ['not_full', 'insufficient_slots', 'invalid_items', 'inventory_not_found', 'no_tribe']) {
      expect(isKnownCapsuleRejectCode(code), code).toBe(true)
    }
    expect(isKnownCapsuleRejectCode('user_suspended')).toBe(false)
    expect(isKnownCapsuleRejectCode('nope')).toBe(false)
    expect(isKnownCapsuleRejectCode(undefined)).toBe(false)
  })
})
