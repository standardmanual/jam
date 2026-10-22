/**
 * 밸런스 설정 저장 요청 호출 (티켓 20261022_1132 1회) — `putBalanceSection`
 *
 * 구역 폼의 저장 흐름이 기대는 결과 모양을 고정한다(던지지 않고 결과를 돌려준다):
 * - 성공: 저장 뒤 전체 값·수정 시각·바뀐 칸·확률 반영 표시
 * - 400: 칸별 fieldErrors를 그대로(문자열이 아닌 값은 버린다), 409: 상태 코드로 충돌을 알아본다, 그 밖의 서버 오류: 서버 문장 또는 고정 문장
 * - 네트워크가 끊기면 status 0과 고정 문장(NETWORK_ERROR_MESSAGE)이고 던지지 않는다
 * - 요청 형식: PUT 본문 JSON(`values`, `expectedUpdatedAt`, 있으면 `note`), 구역 키는 주소에 인코딩해서 싣는다
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NETWORK_ERROR_MESSAGE } from '@/components/admin/data-table/admin-fetch'
import { putBalanceSection } from '../balanceClient'

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

describe('putBalanceSection', () => {
  it('PUT으로 본문을 JSON으로 보내고 성공하면 저장 뒤 값과 수정 시각을 돌려준다', async () => {
    const saved = {
      values: { intensity_normal: 4 },
      updatedAt: 't1',
      changes: [{ field: 'intensity_normal', from: 2, to: 4 }],
      affectsDisclosure: false,
    }
    fetchMock.mockReturnValue(respond(200, saved))
    const result = await putBalanceSection('jam', { values: { intensity_normal: 4 }, expectedUpdatedAt: 't0', note: '메모' })
    expect(result).toEqual({ ok: true, ...saved })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/balance/jam')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ values: { intensity_normal: 4 }, expectedUpdatedAt: 't0', note: '메모' })
  })

  it('구역 키는 주소에 인코딩해서 싣는다', async () => {
    fetchMock.mockReturnValue(respond(404, { error: '찾을 수 없는 구역이에요.' }))
    await putBalanceSection('a/b', { values: {}, expectedUpdatedAt: 't0' })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/balance/a%2Fb')
  })

  it('400은 칸별 fieldErrors를 그대로 돌려준다(문자열이 아닌 값은 버린다)', async () => {
    fetchMock.mockReturnValue(respond(400, { error: '값을 확인해 주세요.', fieldErrors: { intensity_light: '0 이상의 정수로 입력해 주세요.', bad: 3 } }))
    expect(await putBalanceSection('jam', { values: { intensity_light: -1 }, expectedUpdatedAt: 't0' })).toEqual({
      ok: false,
      status: 400,
      error: '값을 확인해 주세요.',
      fieldErrors: { intensity_light: '0 이상의 정수로 입력해 주세요.' },
    })
  })

  it('409는 상태 코드와 서버 문장을 돌려준다', async () => {
    fetchMock.mockReturnValue(respond(409, { error: '다른 사람이 먼저 바꿨어요. 새로 불러온 뒤 다시 바꿔 주세요.' }))
    expect(await putBalanceSection('jam', { values: { intensity_light: 2 }, expectedUpdatedAt: 't0' })).toEqual({
      ok: false,
      status: 409,
      error: '다른 사람이 먼저 바꿨어요. 새로 불러온 뒤 다시 바꿔 주세요.',
      fieldErrors: {},
    })
  })

  it('본문이 JSON이 아닌 서버 오류는 고정 문장이다', async () => {
    fetchMock.mockReturnValue(Promise.resolve(new Response('<html>oops</html>', { status: 502 })))
    expect(await putBalanceSection('jam', { values: { intensity_light: 2 }, expectedUpdatedAt: 't0' })).toEqual({
      ok: false,
      status: 502,
      error: '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
      fieldErrors: {},
    })
  })

  it('네트워크가 끊기면 던지지 않고 status 0과 고정 문장을 돌려준다', async () => {
    fetchMock.mockReturnValue(Promise.reject(new TypeError('Failed to fetch')))
    expect(await putBalanceSection('jam', { values: { intensity_light: 2 }, expectedUpdatedAt: 't0' })).toEqual({
      ok: false,
      status: 0,
      error: NETWORK_ERROR_MESSAGE,
      fieldErrors: {},
    })
  })
})
