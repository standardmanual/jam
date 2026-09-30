/**
 * 운영툴 슬랙 알림 (티켓 20260930_1816)
 *
 * - 제출 문자열의 슬랙 특수문자(`&`·`<`·`>`)를 이스케이프한다(멘션·링크로 해석되지 않게)
 * - 환경변수가 없으면 게시를 건너뛰고 `not_configured`를 돌려준다
 * - fetch 실패·HTTP 오류·`ok: false` 응답에서도 던지지 않는다(제출 요청을 실패시키면 안 된다)
 */
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest'
import { escapeSlackText, formatArrivalMessage, postOpsSlack } from '../slack'

describe('escapeSlackText', () => {
  it('&, <, >를 슬랙 규칙대로 바꾼다', () => {
    expect(escapeSlackText('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d')
  })

  it('멘션·링크 문법이 그대로 해석되지 않는다', () => {
    expect(escapeSlackText('<!channel> <@U123> <https://x.test|열기>')).toBe(
      '&lt;!channel&gt; &lt;@U123&gt; &lt;https://x.test|열기&gt;'
    )
  })

  it('이미 이스케이프된 문자열도 한 번 더 바꾼다(& 를 먼저 처리해 꼬이지 않는다)', () => {
    expect(escapeSlackText('&lt;')).toBe('&amp;lt;')
  })

  it('특수문자가 없으면 그대로다', () => {
    expect(escapeSlackText('윤진 2026-W41')).toBe('윤진 2026-W41')
  })
})

describe('formatArrivalMessage', () => {
  const base = { author: '윤진', week: '2026-W41', itemCount: 3, formatErrorCount: 2, isSample: false }

  it('에이전트, 주차, 항목 수, 형식 오류 수를 담는다', () => {
    expect(formatArrivalMessage(base)).toBe(
      '기획안이 도착했어요 · 에이전트: 윤진 · 주차: 2026-W41 · 항목 3개 · 형식 오류 2건'
    )
  })

  it('시험 묶음이면 앞에 「[시험]」을 붙인다', () => {
    expect(formatArrivalMessage({ ...base, isSample: true }).startsWith('[시험] 기획안이 도착했어요')).toBe(true)
    expect(formatArrivalMessage(base).startsWith('[시험]')).toBe(false)
  })

  it('주차가 없으면 「없음」이다', () => {
    expect(formatArrivalMessage({ ...base, week: null })).toContain('주차: 없음')
  })

  it('에이전트 이름의 특수문자를 이스케이프한다', () => {
    const text = formatArrivalMessage({ ...base, author: '<!channel> & <@U1>' })
    expect(text).toContain('에이전트: &lt;!channel&gt; &amp; &lt;@U1&gt;')
    expect(text).not.toContain('<')
  })

  it('줄바꿈은 공백으로 접고 긴 값은 자른다', () => {
    const text = formatArrivalMessage({ ...base, author: `첫 줄\n둘째 줄 ${'가'.repeat(200)}` })
    expect(text).not.toContain('\n')
    expect(text.length).toBeLessThan(200)
    expect(text).toContain('…')
  })
})

describe('postOpsSlack', () => {
  const ENV_KEYS = ['SLACK_BOT_TOKEN', 'SLACK_CHANNEL_JAM_REPORT', 'SLACK_CHANNEL_JAM_ALERT'] as const
  const saved: Record<string, string | undefined> = {}
  const fetchMock = vi.fn()

  beforeEach(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key]
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token'
    process.env.SLACK_CHANNEL_JAM_REPORT = 'CREPORT'
    process.env.SLACK_CHANNEL_JAM_ALERT = 'CALERT'
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    vi.unstubAllGlobals()
  })

  it('report 채널에 chat.postMessage를 부르고 ok를 돌려준다', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
    const result = await postOpsSlack('report', '안녕')
    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://slack.com/api/chat.postMessage')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer xoxb-test-token')
    expect(JSON.parse(init.body)).toEqual({ channel: 'CREPORT', text: '안녕' })
  })

  it('alert 채널은 다른 채널 ID를 쓴다', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
    await postOpsSlack('alert', '실패')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).channel).toBe('CALERT')
  })

  it.each([
    ['토큰 없음', 'SLACK_BOT_TOKEN'],
    ['report 채널 ID 없음', 'SLACK_CHANNEL_JAM_REPORT'],
  ])('%s이면 게시하지 않고 not_configured를 돌려준다', async (_label, key) => {
    delete process.env[key]
    const result = await postOpsSlack('report', '안녕')
    expect(result).toEqual({ ok: false, error: 'not_configured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('alert 채널 ID만 없으면 alert만 건너뛴다', async () => {
    delete process.env.SLACK_CHANNEL_JAM_ALERT
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
    expect(await postOpsSlack('alert', 'x')).toEqual({ ok: false, error: 'not_configured' })
    expect((await postOpsSlack('report', 'x')).ok).toBe(true)
  })

  it('슬랙이 ok: false로 답하면 실패로 보고 오류 이름을 돌려준다(던지지 않는다)', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: false, error: 'channel_not_found' }) })
    await expect(postOpsSlack('report', '안녕')).resolves.toEqual({ ok: false, error: 'channel_not_found' })
  })

  it('ok: false인데 오류 이름이 없으면 slack_error다', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: false }) })
    await expect(postOpsSlack('report', '안녕')).resolves.toEqual({ ok: false, error: 'slack_error' })
  })

  it('HTTP 오류 상태는 http_<상태>로 돌려준다', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })
    await expect(postOpsSlack('report', '안녕')).resolves.toEqual({ ok: false, error: 'http_503' })
  })

  it('응답이 JSON이 아니어도 던지지 않는다', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('bad json')
      },
    })
    await expect(postOpsSlack('report', '안녕')).resolves.toEqual({ ok: false, error: 'slack_error' })
  })

  it('fetch가 던져도(네트워크 오류·시간 초과) 던지지 않고 오류 이름만 돌려준다', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed: token xoxb-test-token'))
    const result = await postOpsSlack('report', '안녕')
    expect(result).toEqual({ ok: false, error: 'TypeError' })
    expect(JSON.stringify(result)).not.toContain('xoxb-test-token')
  })
})
