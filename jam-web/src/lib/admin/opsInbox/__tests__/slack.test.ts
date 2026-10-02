/**
 * 운영툴 슬랙 알림 (티켓 20260930_1816)
 *
 * - 제출 문자열의 슬랙 특수문자(`&`·`<`·`>`)를 이스케이프한다(멘션·링크로 해석되지 않게)
 * - 환경변수가 없으면 게시를 건너뛰고 `not_configured`를 돌려준다
 * - fetch 실패·HTTP 오류·`ok: false` 응답에서도 던지지 않는다(제출 요청을 실패시키면 안 된다)
 */
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest'
import {
  escapeSlackText,
  formatArrivalMessage,
  formatCancelFailureMessage,
  formatCancelMessage,
  formatDecisionMessage,
  formatExecuteFailureMessage,
  formatExecuteSummaryMessage,
  postOpsSlack,
} from '../slack'

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

describe('formatDecisionMessage (티켓 20260930_1818)', () => {
  const label = '홈피드 카드 · 10/5(월) 09:00'

  it('승인: 항목 이름(종류 · 공개 시각)만 담는다', () => {
    expect(formatDecisionMessage({ action: 'approve', isSample: false, itemLabel: label })).toBe(
      '승인했어요 · 홈피드 카드 · 10/5(월) 09:00'
    )
  })

  it('시험 묶음이면 어느 글이든 앞에 「[시험]」이 붙는다', () => {
    const inputs = [
      { action: 'approve', isSample: true, itemLabel: label },
      { action: 'reject', isSample: true, itemLabel: label, reason: '이유' },
      { action: 'bulk_approve', isSample: true, approved: 1, excluded: 0, skipped: 0 },
      { action: 'edit', isSample: true, itemLabel: label, changedLabels: ['공개 시각'] },
      { action: 'revert', isSample: true, itemLabel: label, changedLabels: ['공개 시각'] },
    ] as const
    for (const input of inputs) expect(formatDecisionMessage(input).startsWith('[시험] '), input.action).toBe(true)
    expect(formatDecisionMessage({ action: 'approve', isSample: false, itemLabel: label }).startsWith('[시험]')).toBe(false)
  })

  it('반려: 사유를 100자까지 붙이고 줄바꿈은 공백으로 접는다', () => {
    const short = formatDecisionMessage({ action: 'reject', isSample: false, itemLabel: label, reason: '첫 줄\n둘째 줄' })
    expect(short).toBe('반려했어요 · 홈피드 카드 · 10/5(월) 09:00 · 사유: 첫 줄 둘째 줄')
    const long = formatDecisionMessage({ action: 'reject', isSample: false, itemLabel: label, reason: '가'.repeat(150) })
    expect(long.endsWith(`${'가'.repeat(100)}…`)).toBe(true)
    expect(long).not.toContain('가'.repeat(101))
  })

  it('일괄 승인: 글 1건 「N개 승인, M개 제외」, 이미 처리된 항목이 있으면 덧붙인다', () => {
    expect(formatDecisionMessage({ action: 'bulk_approve', isSample: false, approved: 11, excluded: 1, skipped: 0 })).toBe(
      '일괄 승인했어요 · 11개 승인, 1개 제외'
    )
    expect(formatDecisionMessage({ action: 'bulk_approve', isSample: false, approved: 10, excluded: 1, skipped: 1 })).toBe(
      '일괄 승인했어요 · 10개 승인, 1개 제외, 1개는 이미 처리돼 건너뜀'
    )
  })

  it('수정·되돌림: 바뀐 칸의 이름만 싣고 값은 싣지 않는다', () => {
    const edit = formatDecisionMessage({ action: 'edit', isSample: false, itemLabel: label, changedLabels: ['문안 · body', '공개 시각'] })
    expect(edit).toBe('수정했어요 · 홈피드 카드 · 10/5(월) 09:00 · 바뀐 칸: 문안 · body, 공개 시각')
    const revert = formatDecisionMessage({ action: 'revert', isSample: false, itemLabel: label, changedLabels: ['공개 시각'] })
    expect(revert).toBe('수정했어요(되돌림) · 홈피드 카드 · 10/5(월) 09:00 · 바뀐 칸: 공개 시각')
  })

  it('바뀐 칸이 많으면 「외 N칸」으로 줄인다', () => {
    const many = Array.from({ length: 12 }, (_, i) => `문안 · k${i}`)
    const text = formatDecisionMessage({ action: 'edit', isSample: false, itemLabel: label, changedLabels: many })
    expect(text).toContain('문안 · k7')
    expect(text).not.toContain('문안 · k8')
    expect(text.endsWith('외 4칸')).toBe(true)
  })

  it('제출 문자열(사유·칸 이름)의 슬랙 특수문자를 이스케이프한다', () => {
    const reject = formatDecisionMessage({ action: 'reject', isSample: false, itemLabel: label, reason: '<!channel> & <@U1>' })
    expect(reject).toContain('&lt;!channel&gt; &amp; &lt;@U1&gt;')
    expect(reject).not.toContain('<!channel>')
    const edit = formatDecisionMessage({ action: 'edit', isSample: false, itemLabel: label, changedLabels: ['문안 · <!here>'] })
    expect(edit).toContain('문안 · &lt;!here&gt;')
    expect(edit).not.toContain('<!here>')
  })
})

describe('예약 등록 글 (티켓 20261002_1123)', () => {
  const label = '홈피드 카드 · 10/10(토) 09:00'

  it('요약: 「N개 예약 등록, M개 제외」 한 건이고 실패가 있을 때만 「, K개 실패」가 붙는다', () => {
    expect(formatExecuteSummaryMessage({ isSample: false, scheduled: 11, excluded: 1, failed: 0 })).toBe('11개 예약 등록, 1개 제외')
    expect(formatExecuteSummaryMessage({ isSample: false, scheduled: 11, excluded: 1, failed: 1 })).toBe('11개 예약 등록, 1개 제외, 1개 실패')
    expect(formatExecuteSummaryMessage({ isSample: false, scheduled: 0, excluded: 0, failed: 2 })).toBe('0개 예약 등록, 0개 제외, 2개 실패')
  })

  it('시험 묶음이면 요약과 실패 글 모두 앞에 「[시험]」이 붙는다', () => {
    expect(formatExecuteSummaryMessage({ isSample: true, scheduled: 11, excluded: 1, failed: 1 })).toBe('[시험] 11개 예약 등록, 1개 제외, 1개 실패')
    const failure = formatExecuteFailureMessage({ isSample: true, failures: [{ itemLabel: label, reason: '사유' }] })
    expect(failure.startsWith('[시험] ')).toBe(true)
    expect(formatExecuteFailureMessage({ isSample: false, failures: [{ itemLabel: label, reason: '사유' }] }).startsWith('[시험]')).toBe(false)
  })

  it('실패 글: 항목 이름과 사유를 한 줄씩 싣는다', () => {
    const text = formatExecuteFailureMessage({
      isSample: false,
      failures: [
        { itemLabel: label, reason: '연결된 미션이 반려됐어요' },
        { itemLabel: '미션 · 10/10(토) 09:00', reason: '연결된 항목을 만들지 못해 함께 실패했어요' },
      ],
    })
    expect(text).toBe(
      [
        '예약 등록에 실패했어요 · 2건',
        '• 홈피드 카드 · 10/10(토) 09:00 — 연결된 미션이 반려됐어요',
        '• 미션 · 10/10(토) 09:00 — 연결된 항목을 만들지 못해 함께 실패했어요',
      ].join('\n')
    )
  })

  it('실패 글: 5건까지 나열하고 나머지는 「외 N건」이다', () => {
    const failures = Array.from({ length: 8 }, (_, i) => ({ itemLabel: `항목${i}`, reason: `사유${i}` }))
    const text = formatExecuteFailureMessage({ isSample: false, failures })
    expect(text.split('\n')).toHaveLength(1 + 5 + 1)
    expect(text).toContain('항목4 — 사유4')
    expect(text).not.toContain('항목5')
    expect(text.endsWith('외 3건')).toBe(true)
  })

  it('실패 글: 결정 기록을 남기지 못했으면 그 줄을 더하고, 실패 항목이 없어도 글이 된다', () => {
    const withFailure = formatExecuteFailureMessage({ isSample: false, failures: [{ itemLabel: label, reason: '사유' }], decisionLogFailed: true })
    expect(withFailure.split('\n').at(-1)).toBe('결정 기록을 남기지 못했어요. 서버 로그를 확인해 주세요')
    expect(formatExecuteFailureMessage({ isSample: false, failures: [], decisionLogFailed: true })).toBe(
      '결정 기록을 남기지 못했어요. 서버 로그를 확인해 주세요'
    )
  })

  it('실패 글: 사유가 길면 100자로 자르고 슬랙 특수문자를 이스케이프한다', () => {
    const long = formatExecuteFailureMessage({ isSample: false, failures: [{ itemLabel: label, reason: '가'.repeat(150) }] })
    expect(long.endsWith(`${'가'.repeat(100)}…`)).toBe(true)
    const escaped = formatExecuteFailureMessage({ isSample: false, failures: [{ itemLabel: '<!here>', reason: '<@U1> & x' }] })
    expect(escaped).toContain('&lt;!here&gt; — &lt;@U1&gt; &amp; x')
    expect(escaped).not.toContain('<!here>')
  })
})

describe('공개 전 취소 글 (티켓 20261002_1256)', () => {
  const label = '홈피드 카드 · 10/10(토) 09:00'

  it('취소 글: 건수와 항목 이름을 한 줄씩 싣는다', () => {
    expect(formatCancelMessage({ isSample: false, itemLabels: [label, '미션 · 10/10(토) 09:00'] })).toBe(
      ['공개 전 취소 2건', '• 홈피드 카드 · 10/10(토) 09:00', '• 미션 · 10/10(토) 09:00'].join('\n')
    )
    expect(formatCancelMessage({ isSample: false, itemLabels: [label] })).toBe(['공개 전 취소 1건', `• ${label}`].join('\n'))
  })

  it('취소 글: 시험 묶음이면 맨 앞에 「[시험]」이 붙는다', () => {
    expect(formatCancelMessage({ isSample: true, itemLabels: [label] }).startsWith('[시험] 공개 전 취소 1건')).toBe(true)
    expect(formatCancelMessage({ isSample: false, itemLabels: [label] }).startsWith('[시험]')).toBe(false)
  })

  it('취소 글: 5건까지 나열하고 나머지는 「외 N건」이다', () => {
    const text = formatCancelMessage({ isSample: false, itemLabels: Array.from({ length: 8 }, (_, i) => `항목${i}`) })
    expect(text.split('\n')).toHaveLength(1 + 5 + 1)
    expect(text.split('\n')[0]).toBe('공개 전 취소 8건')
    expect(text).toContain('• 항목4')
    expect(text).not.toContain('항목5')
    expect(text.endsWith('외 3건')).toBe(true)
  })

  it('취소 글: 항목 이름의 슬랙 특수문자를 이스케이프하고 60자로 자른다', () => {
    const text = formatCancelMessage({ isSample: false, itemLabels: ['<!here> & x', '가'.repeat(80)] })
    expect(text).toContain('• &lt;!here&gt; &amp; x')
    expect(text).not.toContain('<!here>')
    expect(text).toContain(`• ${'가'.repeat(60)}…`)
  })

  it('끝내지 못한 글: 취소한 건수와 남은 항목·사유를 싣는다', () => {
    const text = formatCancelFailureMessage({ isSample: false, cancelled: 1, problems: [{ itemLabel: label, reason: '카드를 지우지 못했어요' }] })
    expect(text).toBe(['공개 전 취소를 끝내지 못했어요 · 1건 취소, 1건 남음', `• ${label} — 카드를 지우지 못했어요`].join('\n'))
  })

  it('끝내지 못한 글: 시험 묶음 표시, 5건 상한과 「외 N건」, 사유 100자 자르기와 이스케이프', () => {
    const problems = Array.from({ length: 7 }, (_, i) => ({ itemLabel: `항목${i}`, reason: `사유${i}` }))
    const text = formatCancelFailureMessage({ isSample: true, cancelled: 0, problems })
    expect(text.startsWith('[시험] 공개 전 취소를 끝내지 못했어요 · 0건 취소, 7건 남음')).toBe(true)
    expect(text).toContain('• 항목4 — 사유4')
    expect(text).not.toContain('항목5')
    expect(text.endsWith('외 2건')).toBe(true)

    const long = formatCancelFailureMessage({ isSample: false, cancelled: 0, problems: [{ itemLabel: label, reason: '가'.repeat(150) }] })
    expect(long.endsWith(`${'가'.repeat(100)}…`)).toBe(true)
    const escaped = formatCancelFailureMessage({ isSample: false, cancelled: 0, problems: [{ itemLabel: '<!here>', reason: '<@U1> & x' }] })
    expect(escaped).toContain('&lt;!here&gt; — &lt;@U1&gt; &amp; x')
  })

  it('끝내지 못한 글: 결정 기록을 남기지 못했으면 그 줄을 더하고, 남은 항목이 없어도 글이 된다', () => {
    const withProblem = formatCancelFailureMessage({ isSample: false, cancelled: 1, problems: [{ itemLabel: label, reason: '사유' }], decisionLogFailed: true })
    expect(withProblem.split('\n').at(-1)).toBe('결정 기록을 남기지 못했어요. 서버 로그를 확인해 주세요')
    expect(formatCancelFailureMessage({ isSample: false, cancelled: 2, problems: [], decisionLogFailed: true })).toBe(
      '결정 기록을 남기지 못했어요. 서버 로그를 확인해 주세요'
    )
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
