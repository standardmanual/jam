/**
 * 투데이 카드 노출·클릭 전송 (티켓 20260924_1147)
 *
 * 확인하는 것:
 * 1. `sendTodayCardEvent` — sendBeacon 성공 시 fetch 미호출, sendBeacon이 false이거나 없으면
 *    keepalive fetch 폴백, fetch 거부는 삼킨다. 페이로드는 `cardId`·`event`만 담는다
 * 2. 노출 임계값 0.5, `sessionStorage` 기반 중복 억제와 접근 예외 안전
 * 3. `createClickReporter` — `trackClick=false`면 클릭을 보내지 않는다
 * 4. `todayCardClickParams` — GA `today_card_click` 파라미터에 그려진 모양(`shape`)이 실린다(티켓 20261001_1458)
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/cardEventClient.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  IMPRESSION_THRESHOLD,
  createClickReporter,
  hasSeenImpression,
  markImpressionSeen,
  sendTodayCardEvent,
  todayCardClickParams,
} from '../cardEventClient'

const CARD_ID = '11111111-1111-4111-8111-111111111111'

function makeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: vi.fn((k: string) => map.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => { map.set(k, v) }),
  }
}

async function blobText(blob: unknown): Promise<string> {
  return (blob as Blob).text()
}

describe('sendTodayCardEvent', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sendBeacon이 성공하면 fetch를 부르지 않고, 페이로드는 cardId·event뿐이다', async () => {
    const sendBeacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon })

    sendTodayCardEvent(CARD_ID, 'impression')

    expect(sendBeacon).toHaveBeenCalledTimes(1)
    expect(sendBeacon.mock.calls[0][0]).toBe('/api/today/events')
    expect(JSON.parse(await blobText(sendBeacon.mock.calls[0][1]))).toEqual({ cardId: CARD_ID, event: 'impression' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sendBeacon이 false를 돌려주면 keepalive fetch로 폴백한다', () => {
    vi.stubGlobal('navigator', { sendBeacon: vi.fn().mockReturnValue(false) })

    sendTodayCardEvent(CARD_ID, 'click')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/today/events')
    expect(init).toMatchObject({ method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' } })
    expect(JSON.parse(init.body)).toEqual({ cardId: CARD_ID, event: 'click' })
  })

  it('sendBeacon이 없으면 keepalive fetch로 폴백한다', () => {
    vi.stubGlobal('navigator', {})

    sendTodayCardEvent(CARD_ID, 'click')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ keepalive: true })
  })

  it('폴백 fetch가 거부돼도 예외가 밖으로 나가지 않는다', async () => {
    vi.stubGlobal('navigator', {})
    fetchMock.mockRejectedValue(new Error('network down'))

    expect(() => sendTodayCardEvent(CARD_ID, 'impression')).not.toThrow()
    await Promise.resolve()
  })
})

describe('노출 임계값·중복 억제', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('노출 임계값은 0.5다', () => {
    expect(IMPRESSION_THRESHOLD).toBe(0.5)
  })

  it('markImpressionSeen 전에는 false, 후에는 true이고 카드별로 독립이다', () => {
    vi.stubGlobal('sessionStorage', makeStorage())
    const other = '22222222-2222-4222-8222-222222222222'

    expect(hasSeenImpression(CARD_ID)).toBe(false)
    markImpressionSeen(CARD_ID)
    expect(hasSeenImpression(CARD_ID)).toBe(true)
    expect(hasSeenImpression(other)).toBe(false)
  })

  it('sessionStorage 접근이 예외를 던져도 안전하다(중복 전송 허용, 크래시 없음)', () => {
    const boom = () => { throw new Error('SecurityError') }
    vi.stubGlobal('sessionStorage', { getItem: boom, setItem: boom })

    expect(hasSeenImpression(CARD_ID)).toBe(false)
    expect(() => markImpressionSeen(CARD_ID)).not.toThrow()
  })
})

describe('createClickReporter', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('navigator', {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('trackClick=false면 undefined를 돌려줘 클릭을 보내지 않는다', () => {
    expect(createClickReporter(CARD_ID, false)).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('trackClick=true면 호출 시 click 이벤트를 보낸다', () => {
    const report = createClickReporter(CARD_ID, true)
    expect(report).toBeTypeOf('function')

    report?.()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ cardId: CARD_ID, event: 'click' })
  })
})

describe('todayCardClickParams — GA today_card_click 파라미터 (티켓 20261001_1458)', () => {
  it('기존 파라미터(card_id·content_type_id·template_type)는 그대로이고 그려진 모양(shape)이 더해진다', () => {
    expect(
      todayCardClickParams({ cardId: CARD_ID, contentTypeId: 'T05', templateType: 'drop_alert', shape: 'brief' }),
    ).toEqual({ card_id: CARD_ID, content_type_id: 'T05', template_type: 'drop_alert', shape: 'brief' })
  })

  it('옛 렌더러의 카드는 그려진 모양이 없어(null·생략) shape가 null이다', () => {
    expect(todayCardClickParams({ cardId: CARD_ID, contentTypeId: 'T05', templateType: 'drop_alert', shape: null }).shape).toBeNull()
    expect(todayCardClickParams({ cardId: CARD_ID, contentTypeId: 'T05', templateType: 'drop_alert' }).shape).toBeNull()
  })

  it('값이 없는 칸은 undefined가 아니라 null로 보낸다', () => {
    expect(todayCardClickParams({ cardId: CARD_ID })).toEqual({
      card_id: CARD_ID,
      content_type_id: null,
      template_type: null,
      shape: null,
    })
  })
})
