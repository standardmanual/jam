/**
 * 취향 신호 확정·공통 규칙 고치기·근거 후보 읽기 호출 (티켓 20261008_1754) — 던지지 않고 결과를 돌려준다.
 * - 취향 신호: PATCH, 본문 `{ reason, evidenceDecisionId, expectedUpdatedAt }`(받은 문자열 그대로)
 * - 공통 규칙: PATCH, 본문 `{ title, body, expectedUpdatedAt }`
 * - 근거 후보: GET `?offset=`
 * - 400은 `fieldErrors`(문자열만), 409는 상태 코드와 서버 문장, 끊기면 status 0과 고정 문장
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NETWORK_ERROR_MESSAGE } from '@/components/admin/data-table/admin-fetch'
import { fetchPatternRejectionsRequest, saveCommonRuleRequest, saveTasteSignalRequest } from '../tasteClient'

const UPDATED_AT = '2026-10-08T07:05:00.123456+00:00'
const EVIDENCE = '00000000-0000-4000-8000-000000000009'

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

describe('saveTasteSignalRequest', () => {
  const body = { reason: '이유', evidenceDecisionId: EVIDENCE, expectedUpdatedAt: UPDATED_AT }

  it('PATCH로 보내고 expectedUpdatedAt을 받은 문자열 그대로 싣는다', async () => {
    const signal = { id: 's1', basis: 'confirmed', updatedAt: '2026-10-08T08:00:00.000000+00:00' }
    fetchMock.mockReturnValue(respond(200, { signal, changed: true }))
    expect(await saveTasteSignalRequest('s 1', body)).toEqual({ ok: true, signal, changed: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/ops-patterns/taste-signals/s%201')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual(body)
    expect(JSON.parse(init.body).expectedUpdatedAt).toBe(UPDATED_AT)
  })

  it('내용이 같으면 changed: false', async () => {
    fetchMock.mockReturnValue(respond(200, { signal: { id: 's1' }, changed: false }))
    expect(await saveTasteSignalRequest('s1', body)).toMatchObject({ ok: true, changed: false })
  })

  it('400은 문자열 fieldErrors만 돌려준다', async () => {
    fetchMock.mockReturnValue(respond(400, { error: '입력한 내용을 확인해 주세요.', fieldErrors: { reason: '이유를 적어 주세요.', skip: 3 } }))
    expect(await saveTasteSignalRequest('s1', body)).toEqual({
      ok: false,
      status: 400,
      error: '입력한 내용을 확인해 주세요.',
      fieldErrors: { reason: '이유를 적어 주세요.' },
    })
  })

  it('409는 상태 코드와 서버 문장을 돌려준다', async () => {
    fetchMock.mockReturnValue(respond(409, { error: '그사이 다른 곳에서 이 취향 신호를 고쳤어요. 최신 값을 불러와 주세요.' }))
    expect(await saveTasteSignalRequest('s1', body)).toEqual({
      ok: false,
      status: 409,
      error: '그사이 다른 곳에서 이 취향 신호를 고쳤어요. 최신 값을 불러와 주세요.',
      fieldErrors: {},
    })
  })

  it('본문이 JSON이 아니면 기본 문장, 연결이 끊기면 status 0', async () => {
    fetchMock.mockReturnValueOnce(Promise.resolve(new Response('oops', { status: 500 })))
    expect(await saveTasteSignalRequest('s1', body)).toMatchObject({ ok: false, status: 500, error: '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.' })
    fetchMock.mockRejectedValueOnce(new TypeError('failed'))
    expect(await saveTasteSignalRequest('s1', body)).toEqual({ ok: false, status: 0, error: NETWORK_ERROR_MESSAGE, fieldErrors: {} })
  })
})

describe('saveCommonRuleRequest', () => {
  it('PATCH로 제목·본문·expectedUpdatedAt을 보낸다', async () => {
    const rule = { ruleNo: 3, title: '제목', body: '본문', updatedAt: '2026-10-08T08:00:00.000000+00:00' }
    fetchMock.mockReturnValue(respond(200, { rule, changed: true }))
    const sent = { title: '제목', body: '본문', expectedUpdatedAt: UPDATED_AT }
    expect(await saveCommonRuleRequest(3, sent)).toEqual({ ok: true, rule, changed: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/ops-patterns/common-rules/3')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual(sent)
  })

  it('409와 끊김을 던지지 않고 돌려준다', async () => {
    fetchMock.mockReturnValueOnce(respond(409, { error: '그사이 다른 곳에서 이 공통 규칙을 고쳤어요. 최신 값을 불러와 주세요.' }))
    expect(await saveCommonRuleRequest(3, { title: 'a', body: 'b', expectedUpdatedAt: UPDATED_AT })).toMatchObject({ ok: false, status: 409 })
    fetchMock.mockRejectedValueOnce(new TypeError('failed'))
    expect(await saveCommonRuleRequest(3, { title: 'a', body: 'b', expectedUpdatedAt: UPDATED_AT })).toMatchObject({ ok: false, status: 0 })
  })
})

describe('fetchPatternRejectionsRequest', () => {
  it('offset을 붙여 읽고 목록·hasMore·total을 돌려준다', async () => {
    const rejections = [{ id: EVIDENCE, itemName: '문안' }]
    fetchMock.mockReturnValue(respond(200, { rejections, hasMore: true, total: 23 }))
    expect(await fetchPatternRejectionsRequest('P03', 10)).toEqual({ ok: true, rejections, hasMore: true, total: 23 })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/ops-patterns/P03/rejections?offset=10')
  })

  it('실패와 끊김은 던지지 않고 ok: false다', async () => {
    fetchMock.mockReturnValueOnce(respond(500, { error: '반려 기록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.' }))
    expect(await fetchPatternRejectionsRequest('P03', 0)).toMatchObject({ ok: false, status: 500 })
    fetchMock.mockRejectedValueOnce(new TypeError('failed'))
    expect(await fetchPatternRejectionsRequest('P03', 0)).toMatchObject({ ok: false, status: 0 })
  })
})
