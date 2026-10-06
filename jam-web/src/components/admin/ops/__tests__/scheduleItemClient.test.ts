/**
 * 일정표 항목 서랍 데이터 요청 (티켓 20261006_1537 ③-b)
 *
 * `fetch`를 가짜로 바꿔 지키는 것:
 * - 항목 ID로 `GET /api/admin/ops-schedule/items/{id}`를 부르고(읽기만, 캐시 없음) 서랍이 그릴 수 있는 모양이면 `ok`다
 * - 404는 `notFound`(「찾을 수 없는 항목이에요」), 그 밖의 실패·네트워크 오류·어긋난 응답은 `error`다 — 던지지 않는다(서랍 안에서만 보이게 격리)
 * - 요청을 중단하면 `aborted`다(서랍을 닫았거나 다른 항목으로 옮겼다 — 화면은 이 결과를 버린다)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchScheduleItem } from '../scheduleItemClient'

const ITEM_ID = '3f2a9c1e-0000-4000-8000-0000000000a1'

const DETAIL = {
  itemId: ITEM_ID,
  bundleId: 'b1',
  isSample: false,
  items: [{ id: ITEM_ID, kind: 'home_feed_card', status: 'reviewing' }],
  decisions: [],
  balance: { status: 'failed' },
}

function respond(status: number, body: unknown) {
  return vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchScheduleItem', () => {
  it('항목 API를 읽기(GET) 요청으로 부르고 성공하면 서랍 데이터를 돌려준다', async () => {
    const fetchMock = respond(200, DETAIL)
    vi.stubGlobal('fetch', fetchMock)
    const outcome = await fetchScheduleItem(ITEM_ID)
    expect(outcome).toEqual({ kind: 'ok', detail: DETAIL })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`/api/admin/ops-schedule/items/${ITEM_ID}`)
    expect(init.method).toBeUndefined() // 기본 GET이다
    expect(init.cache).toBe('no-store')
  })

  it('404는 notFound다', async () => {
    vi.stubGlobal('fetch', respond(404, { error: '찾을 수 없는 항목이에요.' }))
    expect(await fetchScheduleItem(ITEM_ID)).toEqual({ kind: 'notFound' })
  })

  it.each([400, 403, 500])('%i는 error다(던지지 않는다)', async (status) => {
    vi.stubGlobal('fetch', respond(status, { error: '실패' }))
    expect(await fetchScheduleItem(ITEM_ID)).toEqual({ kind: 'error' })
  })

  it('네트워크가 끊기면 error다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    expect(await fetchScheduleItem(ITEM_ID)).toEqual({ kind: 'error' })
  })

  it('JSON이 아니거나 서랍이 그릴 수 없는 모양이면 error다', async () => {
    vi.stubGlobal('fetch', respond(200, 'not json'))
    expect(await fetchScheduleItem(ITEM_ID)).toEqual({ kind: 'error' })
    vi.stubGlobal('fetch', respond(200, { ...DETAIL, bundleId: 1 }))
    expect(await fetchScheduleItem(ITEM_ID)).toEqual({ kind: 'error' })
    vi.stubGlobal('fetch', respond(200, { ...DETAIL, items: [] }))
    expect(await fetchScheduleItem(ITEM_ID)).toEqual({ kind: 'error' })
    vi.stubGlobal('fetch', respond(200, { ...DETAIL, decisions: null }))
    expect(await fetchScheduleItem(ITEM_ID)).toEqual({ kind: 'error' })
  })

  it('요청을 중단하면 aborted다', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        controller.abort()
        throw new DOMException('aborted', 'AbortError')
      })
    )
    expect(await fetchScheduleItem(ITEM_ID, controller.signal)).toEqual({ kind: 'aborted' })
  })

  it('항목 ID는 주소에 맞게 인코딩한다', async () => {
    const fetchMock = respond(404, {})
    vi.stubGlobal('fetch', fetchMock)
    await fetchScheduleItem('a/b?c')
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/api/admin/ops-schedule/items/a%2Fb%3Fc')
  })
})
