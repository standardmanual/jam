/**
 * 개발 요청 API 호출과 응답 해석 (티켓 20261026_2027 3-1). 지키는 것:
 * - 접수 응답: 201 → 번호·id, 409 → «같은 정책의 요청 N번이 이미 열려 있어요», 400·403·그 밖 → 고정 안내 문장
 * - 접기 응답: 200 → 접힘, 404·403·그 밖 → 고정 안내 문장
 * - fetch 래퍼: 요청 모양(origin `eco`, `policyId`), 네트워크 오류도 던지지 않고 결과로 돌려준다
 * - 안내 문장은 [현상] → [원인] → [해결] 순서이고 내부 오류 원문을 싣지 않는다
 */
import { describe, it, expect } from 'vitest'
import {
  DEV_REQUESTS_PATH,
  DISMISS_ERROR_MESSAGE,
  DISMISS_NOT_FOUND_MESSAGE,
  FORBIDDEN_ERROR_MESSAGE,
  INVALID_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  SERVER_ERROR_MESSAGE,
  dismissDevRequest,
  interpretCreateResponse,
  interpretDismissResponse,
  postDevRequest,
} from '../devRequestClient'

const ID = '11111111-1111-4111-8111-111111111111'

function response(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status })
}

describe('interpretCreateResponse', () => {
  it('201이면 번호와 id를 돌려준다', () => {
    expect(interpretCreateResponse(201, { request: { id: ID, no: 7 } })).toEqual({ kind: 'created', id: ID, no: 7 })
  })

  it('201인데 본문이 비었거나 모양이 다르면 접수된 것으로 보지 않는다', () => {
    for (const body of [null, {}, { request: {} }, { request: { id: ID } }, { request: { no: 7 } }]) {
      expect(interpretCreateResponse(201, body)).toEqual({ kind: 'failed', message: SERVER_ERROR_MESSAGE })
    }
  })

  it('409면 열려 있는 요청 번호를 넣은 문장이다', () => {
    expect(interpretCreateResponse(409, { existingNo: 4 })).toEqual({
      kind: 'duplicate',
      existingNo: 4,
      message: '같은 정책의 요청 4번이 이미 열려 있어요',
    })
  })

  it('409인데 번호를 못 읽으면 번호 없는 문장이다', () => {
    expect(interpretCreateResponse(409, null)).toEqual({
      kind: 'duplicate',
      existingNo: null,
      message: '같은 정책의 요청이 이미 열려 있어요',
    })
  })

  it('400·403·그 밖은 고정 문장이다', () => {
    expect(interpretCreateResponse(400, { error: 'x' })).toEqual({ kind: 'failed', message: INVALID_ERROR_MESSAGE })
    expect(interpretCreateResponse(403, null)).toEqual({ kind: 'failed', message: FORBIDDEN_ERROR_MESSAGE })
    expect(interpretCreateResponse(500, { error: 'relation secret exploded' })).toEqual({ kind: 'failed', message: SERVER_ERROR_MESSAGE })
  })

  it('안내 문장에 내부 오류 원문이 없고 마침표로 끝나는 해요체 문장이다', () => {
    for (const message of [INVALID_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE, SERVER_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE]) {
      expect(message).not.toContain('secret')
      expect(message.endsWith('.')).toBe(true)
    }
  })
})

describe('interpretDismissResponse', () => {
  it('200이면 접힘, 404·403·그 밖은 고정 문장이다', () => {
    expect(interpretDismissResponse(200)).toEqual({ kind: 'dismissed' })
    expect(interpretDismissResponse(404)).toEqual({ kind: 'failed', message: DISMISS_NOT_FOUND_MESSAGE })
    expect(interpretDismissResponse(403)).toEqual({ kind: 'failed', message: FORBIDDEN_ERROR_MESSAGE })
    expect(interpretDismissResponse(500)).toEqual({ kind: 'failed', message: DISMISS_ERROR_MESSAGE })
  })
})

describe('postDevRequest', () => {
  it('origin eco와 정책 ID를 실어 POST하고 201을 접수로 읽는다', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const outcome = await postDevRequest({ title: '제목', detail: '내용', policyId: 'ch5-x' }, async (url, init) => {
      calls.push({ url, init })
      return response(201, { request: { id: ID, no: 2 } })
    })
    expect(outcome).toEqual({ kind: 'created', id: ID, no: 2 })
    expect(calls[0].url).toBe(DEV_REQUESTS_PATH)
    expect(calls[0].init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ title: '제목', detail: '내용', origin: 'eco', policyId: 'ch5-x' })
  })

  it('409 응답 본문의 번호를 읽는다', async () => {
    const outcome = await postDevRequest({ title: 't', detail: '', policyId: 'p' }, async () => response(409, { existingNo: 9 }))
    expect(outcome).toMatchObject({ kind: 'duplicate', existingNo: 9 })
  })

  it('본문이 JSON이 아니어도 던지지 않는다', async () => {
    const outcome = await postDevRequest({ title: 't', detail: '', policyId: 'p' }, async () => new Response('<html>', { status: 502 }))
    expect(outcome).toEqual({ kind: 'failed', message: SERVER_ERROR_MESSAGE })
  })

  it('네트워크 오류는 던지지 않고 안내 문장으로 돌려준다', async () => {
    const outcome = await postDevRequest({ title: 't', detail: '', policyId: 'p' }, async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(outcome).toEqual({ kind: 'failed', message: NETWORK_ERROR_MESSAGE })
  })
})

describe('dismissDevRequest', () => {
  it('id 경로로 PATCH status dismissed를 보낸다', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const outcome = await dismissDevRequest(ID, async (url, init) => {
      calls.push({ url, init })
      return response(200, { request: { id: ID } })
    })
    expect(outcome).toEqual({ kind: 'dismissed' })
    expect(calls[0].url).toBe(`${DEV_REQUESTS_PATH}/${ID}`)
    expect(calls[0].init?.method).toBe('PATCH')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ status: 'dismissed' })
  })

  it('네트워크 오류는 안내 문장이다', async () => {
    const outcome = await dismissDevRequest(ID, async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(outcome).toEqual({ kind: 'failed', message: NETWORK_ERROR_MESSAGE })
  })
})
