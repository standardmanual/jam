/**
 * 운영 규칙 요청 호출 (티켓 20260930_1459 조각 B) — `patchOpsRule`·`fetchOpsRules`
 *
 * 카드의 저장 흐름이 기대는 결과 모양을 고정한다(던지지 않고 결과를 돌려준다):
 * - 성공: 저장된 규칙과 changed
 * - 400: 칸별 fieldErrors를 그대로, 409: 상태 코드로 충돌을 알아본다, 그 밖의 서버 오류: 서버 문장 또는 고정 문장
 * - 네트워크가 끊기면 status 0과 고정 문장(NETWORK_ERROR_MESSAGE)이고 던지지 않는다
 * - 요청 형식: PATCH 본문 JSON, 규칙 키는 주소에 인코딩해서 싣는다
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NETWORK_ERROR_MESSAGE } from '@/components/admin/data-table/admin-fetch'
import { fetchOpsRules, patchOpsRule } from '../ruleClient'

const RULE = {
  ruleKey: 'open_collections_max',
  group: 'balance',
  value: { max: 9, provisional: false },
  level: 'warn',
  enabled: true,
  updatedAt: '2026-10-01T06:30:00+00:00',
  updatedBy: 'admin-1',
  previousValue: { max: 6, provisional: true },
}

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

describe('patchOpsRule', () => {
  it('PATCH로 본문을 JSON으로 보내고 성공하면 저장된 규칙을 돌려준다', async () => {
    fetchMock.mockReturnValue(respond(200, { rule: RULE, changed: true }))
    const result = await patchOpsRule('open_collections_max', { value: { max: 9, provisional: false }, expectedUpdatedAt: 't0' })
    expect(result).toEqual({ ok: true, rule: RULE, changed: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/ops-rules/open_collections_max')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ value: { max: 9, provisional: false }, expectedUpdatedAt: 't0' })
  })

  it('규칙 키는 주소에 인코딩해서 싣는다', async () => {
    fetchMock.mockReturnValue(respond(404, { error: '찾을 수 없는 규칙이에요.' }))
    await patchOpsRule('a/b', { enabled: true, expectedUpdatedAt: 't0' })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/ops-rules/a%2Fb')
  })

  it('400은 칸별 fieldErrors를 그대로 돌려준다(문자열이 아닌 값은 버린다)', async () => {
    fetchMock.mockReturnValue(respond(400, { error: '값을 확인해 주세요.', fieldErrors: { max: '값을 적어 주세요', bad: 3 } }))
    expect(await patchOpsRule('open_collections_max', { value: {}, expectedUpdatedAt: 't0' })).toEqual({
      ok: false,
      status: 400,
      error: '값을 확인해 주세요.',
      fieldErrors: { max: '값을 적어 주세요' },
    })
  })

  it('409는 상태 코드로 알아본다', async () => {
    fetchMock.mockReturnValue(respond(409, { error: '그사이 다른 곳에서 이 규칙이 바뀌었어요.' }))
    expect(await patchOpsRule('open_collections_max', { enabled: false, expectedUpdatedAt: 'old' })).toMatchObject({ ok: false, status: 409 })
  })

  it('서버 문장이 없으면 고정 문장이다', async () => {
    fetchMock.mockReturnValue(Promise.resolve(new Response('<html>oops</html>', { status: 502 })))
    expect(await patchOpsRule('open_collections_max', { enabled: false, expectedUpdatedAt: 't0' })).toEqual({
      ok: false,
      status: 502,
      error: '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
      fieldErrors: {},
    })
  })

  it('200인데 규칙이 없는 응답은 실패로 본다', async () => {
    fetchMock.mockReturnValue(respond(200, { ok: true }))
    expect(await patchOpsRule('open_collections_max', { enabled: false, expectedUpdatedAt: 't0' })).toMatchObject({ ok: false, status: 200 })
  })

  it('네트워크가 끊기면 던지지 않고 status 0과 고정 문장이다(영어 원문을 노출하지 않는다)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const result = await patchOpsRule('open_collections_max', { enabled: false, expectedUpdatedAt: 't0' })
    expect(result).toEqual({ ok: false, status: 0, error: NETWORK_ERROR_MESSAGE, fieldErrors: {} })
    expect(JSON.stringify(result)).not.toContain('Failed to fetch')
  })
})

describe('fetchOpsRules', () => {
  it('규칙 목록을 읽는다(캐시하지 않는다)', async () => {
    fetchMock.mockReturnValue(respond(200, { group: 'balance', rules: [RULE] }))
    expect(await fetchOpsRules('balance')).toEqual({ ok: true, rules: [RULE] })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/ops-rules?group=balance')
    expect(init.method).toBe('GET')
    expect(init.cache).toBe('no-store')
  })

  it('실패하면 던지지 않고 ok:false다', async () => {
    fetchMock.mockReturnValue(respond(500, { error: '규칙을 불러오지 못했어요.' }))
    expect(await fetchOpsRules()).toEqual({ ok: false, status: 500, error: '규칙을 불러오지 못했어요.' })
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await fetchOpsRules()).toEqual({ ok: false, status: 0, error: NETWORK_ERROR_MESSAGE })
  })
})
