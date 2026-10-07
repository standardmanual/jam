/**
 * 결정 요청 호출 (티켓 20261002_1649 ⑤-b가 요청 코드를 공용 도우미 `postOpsJson`으로 합쳤다) — `postDecision`
 *
 * 합치기 전과 바깥 동작이 같은지 고정한다(던지지 않고 결과를 돌려준다):
 * - 요청 형식: POST, 본문 JSON, 묶음 ID는 주소(`decisions`)에 싣는다
 * - 200: 응답 본문을 그대로 돌려준다
 * - 400: 칸별 문장(`fieldErrors`)을 문자열인 것만 덧붙인다
 * - 409: 서버 문장에 「화면을 새로 불러왔어요」를 덧붙인다
 * - 서버 문장이 없는 오류는 고정 문장, 네트워크가 끊기면 status 0과 고정 문장이다
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NETWORK_ERROR_MESSAGE } from '@/components/admin/data-table/admin-fetch'
import { postDecision } from '../decisionClient'

function respond(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('postDecision', () => {
  it('POST로 본문을 JSON으로 보내고 200이면 응답을 그대로 돌려준다', async () => {
    fetchMock.mockReturnValue(respond(200, { ok: true, itemId: 'item-1' }))
    expect(await postDecision('bundle-1', { action: 'approve', itemId: 'item-1' })).toEqual({ ok: true, data: { ok: true, itemId: 'item-1' } })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/ops-inbox/bundle-1/decisions')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual({ action: 'approve', itemId: 'item-1' })
  })

  it('400의 fieldErrors는 문자열인 칸만 돌려준다', async () => {
    fetchMock.mockReturnValue(respond(400, { error: '고친 값을 확인해 주세요.', fieldErrors: { 'copy.title': '너무 길어요', skipped: 3 } }))
    expect(await postDecision('bundle-1', { action: 'revert', itemId: 'item-1' })).toEqual({
      ok: false,
      status: 400,
      error: '고친 값을 확인해 주세요.',
      fieldErrors: { 'copy.title': '너무 길어요' },
      data: { error: '고친 값을 확인해 주세요.', fieldErrors: { 'copy.title': '너무 길어요', skipped: 3 } },
    })
  })

  it('409는 서버 문장에 「화면을 새로 불러왔어요」를 덧붙인다', async () => {
    fetchMock.mockReturnValue(respond(409, { error: '이미 다른 곳에서 처리한 항목이에요.' }))
    expect(await postDecision('bundle-1', { action: 'approve', itemId: 'item-1' })).toMatchObject({
      ok: false,
      status: 409,
      error: '이미 다른 곳에서 처리한 항목이에요. 화면을 새로 불러왔어요.',
      fieldErrors: {},
    })
  })

  it('서버 문장이 없는 오류는 고정 문장이다', async () => {
    fetchMock.mockReturnValue(Promise.resolve(new Response('<html>oops</html>', { status: 502 })))
    expect(await postDecision('bundle-1', { action: 'approve', itemId: 'item-1' })).toEqual({
      ok: false,
      status: 502,
      error: '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
      fieldErrors: {},
      data: {},
    })
  })

  it('네트워크가 끊기면 던지지 않고 status 0과 고정 문장이다', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await postDecision('bundle-1', { action: 'approve', itemId: 'item-1' })).toEqual({
      ok: false,
      status: 0,
      error: NETWORK_ERROR_MESSAGE,
      fieldErrors: {},
      data: {},
    })
  })

  it('fill_color 요청은 bg·end·expectedUpdatedAt를 본문에 싣고, 400의 bg 문장을 돌려준다', async () => {
    fetchMock.mockReturnValue(respond(400, { error: '색을 채우지 못했어요.', fieldErrors: { bg: '색은 #rrggbb 형식으로 적어 주세요.' } }))
    const body = { action: 'fill_color', itemId: 'item-1', bg: '#zzzzzz', end: '#0a5c3d', expectedUpdatedAt: '2026-10-01T00:00:00Z' } as const
    const result = await postDecision('bundle-1', body)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(body)
    expect(result).toMatchObject({ ok: false, status: 400, fieldErrors: { bg: '색은 #rrggbb 형식으로 적어 주세요.' } })
  })
})
