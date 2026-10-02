/**
 * 예약 등록 요청 호출 (티켓 20261002_1648) — `postExecute`
 *
 * 요약창과 주 버튼이 기대는 결과 모양을 고정한다(던지지 않고 결과를 돌려준다):
 * - 요청 형식: POST, 본문 JSON(`{ dryRun: true }` 또는 `{ itemIds }`), 묶음 ID는 주소에 싣는다
 * - 200: 응답 본문을 그대로 돌려준다
 * - 409: 서버 문장에 「화면을 새로 불러왔어요」를 덧붙여 상태 코드로 알아본다(`postDecision`과 같다)
 * - 500·서버 문장이 없는 오류: 서버 문장 또는 고정 문장
 * - 네트워크가 끊기면 status 0과 고정 문장(NETWORK_ERROR_MESSAGE)이고 던지지 않는다
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NETWORK_ERROR_MESSAGE } from '@/components/admin/data-table/admin-fetch'
import { postExecute } from '../executeClient'

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

describe('postExecute', () => {
  it('사전 점검은 POST로 { dryRun: true }를 JSON으로 보낸다', async () => {
    fetchMock.mockReturnValue(respond(200, { ok: true, dryRun: true, ready: ['a'] }))
    const result = await postExecute('bundle-1', { dryRun: true })
    expect(result).toEqual({ ok: true, data: { ok: true, dryRun: true, ready: ['a'] } })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/ops-inbox/bundle-1/execute')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual({ dryRun: true })
  })

  it('실행은 { itemIds }를 보내고 200이면 응답을 그대로 돌려준다', async () => {
    const body = { ok: true, scheduled: ['a', 'b'], failed: [], skipped: [], excludedCount: 0 }
    fetchMock.mockReturnValue(respond(200, body))
    expect(await postExecute('bundle-1', { itemIds: ['a', 'b'] })).toEqual({ ok: true, data: body })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ itemIds: ['a', 'b'] })
  })

  it('409는 서버 문장에 「화면을 새로 불러왔어요」를 덧붙이고 상태 코드로 알아본다', async () => {
    fetchMock.mockReturnValue(
      respond(409, { error: '예약할 수 있는 항목이 없어요. 이미 다른 곳에서 처리했거나 그사이 바뀐 항목이에요.', skipped: [{ id: 'a', reason: '이미 다른 곳에서 처리한 항목이에요' }] })
    )
    const result = await postExecute('bundle-1', { itemIds: ['a'] })
    expect(result).toMatchObject({
      ok: false,
      status: 409,
      error: '예약할 수 있는 항목이 없어요. 이미 다른 곳에서 처리했거나 그사이 바뀐 항목이에요. 화면을 새로 불러왔어요.',
    })
    // 서버가 함께 실은 값(건너뛴 항목)은 data에 남는다
    expect(result.ok === false && result.data.skipped).toEqual([{ id: 'a', reason: '이미 다른 곳에서 처리한 항목이에요' }])
  })

  it('500은 서버 문장을 그대로 돌려준다(화면을 새로 불러왔다는 말을 붙이지 않는다)', async () => {
    fetchMock.mockReturnValue(respond(500, { error: '예약 등록하지 못했어요. 잠시 뒤 다시 눌러 주세요.' }))
    expect(await postExecute('bundle-1', { itemIds: ['a'] })).toEqual({
      ok: false,
      status: 500,
      error: '예약 등록하지 못했어요. 잠시 뒤 다시 눌러 주세요.',
      data: { error: '예약 등록하지 못했어요. 잠시 뒤 다시 눌러 주세요.' },
    })
  })

  it('서버 문장이 없는 오류는 고정 문장이다', async () => {
    fetchMock.mockReturnValue(Promise.resolve(new Response('<html>oops</html>', { status: 502 })))
    expect(await postExecute('bundle-1', { dryRun: true })).toEqual({
      ok: false,
      status: 502,
      error: '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
      data: {},
    })
  })

  it('네트워크가 끊기면 던지지 않고 status 0과 고정 문장이다(영어 원문을 노출하지 않는다)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const result = await postExecute('bundle-1', { itemIds: ['a'] })
    expect(result).toEqual({ ok: false, status: 0, error: NETWORK_ERROR_MESSAGE, data: {} })
    expect(JSON.stringify(result)).not.toContain('Failed to fetch')
  })
})
