/**
 * 어드민 목록 공용 fetch 래퍼의 오류 문구(티켓 20260924_1152) — 응답을 받지 못한 네트워크 오류는
 * 고정 한국어 문장으로, 서버가 준 오류 메시지는 그대로 던지는지 전역 fetch 스텁으로 확인한다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { NETWORK_ERROR_MESSAGE, requestJson, runBulk, fetchListIds } from '../admin-fetch'

afterEach(() => {
  vi.unstubAllGlobals()
})

const rejectWith = (error: unknown) => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error))

const respondWith = (status: number, body: unknown) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })))

describe('fetch 자체가 reject될 때(네트워크 오류)', () => {
  it('requestJson은 브라우저 영어 문구 대신 고정 한국어 문장으로 던진다', async () => {
    rejectWith(new TypeError('Failed to fetch'))
    await expect(requestJson('/api/x')).rejects.toThrow(NETWORK_ERROR_MESSAGE)
  })

  it('runBulk도 같은 문장으로 던진다', async () => {
    rejectWith(new TypeError('Failed to fetch'))
    await expect(runBulk('/api/x/bulk', { ids: ['a'], action: 'activate' })).rejects.toThrow(NETWORK_ERROR_MESSAGE)
  })

  it('고정 문장은 한국어이고 브라우저 원문을 담지 않는다', async () => {
    rejectWith(new TypeError('Failed to fetch'))
    const error = await requestJson('/api/x').catch((e: Error) => e)
    expect((error as Error).message).not.toContain('Failed to fetch')
    expect((error as Error).message).toMatch(/[가-힣]/)
  })

  it('호출자가 취소한 요청(AbortError)은 문장으로 바꾸지 않고 그대로 던진다', async () => {
    const abort = new DOMException('aborted', 'AbortError')
    rejectWith(abort)
    await expect(requestJson('/api/x')).rejects.toBe(abort)
  })
})

describe('서버가 응답을 준 실패', () => {
  it('서버가 준 오류 메시지를 그대로 던진다', async () => {
    respondWith(409, { error: '확인 문구가 일치하지 않습니다.' })
    await expect(requestJson('/api/x')).rejects.toThrow('확인 문구가 일치하지 않습니다.')
  })

  it('runBulk도 서버 메시지를 그대로 던진다', async () => {
    respondWith(500, { error: '반영에 실패했습니다.' })
    await expect(runBulk('/api/x/bulk', { ids: ['a'], action: 'activate' })).rejects.toThrow('반영에 실패했습니다.')
  })

  it('오류 본문이 없으면 기본 안내 문장으로 던진다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 502 })))
    await expect(requestJson('/api/x')).rejects.toThrow('요청을 처리하지 못했습니다.')
  })

  it('성공하면 JSON을 돌려준다', async () => {
    respondWith(200, { ids: ['a', 'b'] })
    await expect(fetchListIds('/api/x/ids')).resolves.toEqual(['a', 'b'])
  })
})
