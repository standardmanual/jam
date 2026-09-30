/**
 * 운영툴 슬랙 이력 알림 (티켓 20260930_1816) — 서버(Vercel)에서 `chat.postMessage`를 부른다.
 *
 * - 이 티켓이 쓰는 이벤트는 「기획안 도착」 하나(`#jam-report`)다. `alert` 채널은 뒤 티켓(실패·되돌림)이 쓴다.
 * - **던지지 않는다.** 환경변수가 없거나, 네트워크가 실패하거나, 슬랙이 `ok: false`로 답해도 `{ ok: false, error }`를
 *   돌려준다. 슬랙 게시 실패가 제출 요청을 실패시키면 안 된다(상위 티켓 가정 16). 오류에는 종류(이름)만 담고
 *   토큰 값·응답 본문은 담지 않는다.
 * - 환경변수: `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_JAM_REPORT`, `SLACK_CHANNEL_JAM_ALERT`
 *   (`docs/specs/prd/04_PROJECT_SPEC.md` 환경변수 표). 값이 없으면 게시를 건너뛴다.
 * - 제출 문자열(에이전트 이름 등)은 슬랙 특수문자(`&`·`<`·`>`)를 이스케이프해서 넣는다. 멘션(`<!channel>`)이나
 *   링크(`<https://…|글>`)로 해석되지 않게 하려는 것이다.
 */

export type OpsSlackChannel = 'report' | 'alert'

export interface OpsSlackResult {
  ok: boolean
  error?: string
}

const SLACK_POST_URL = 'https://slack.com/api/chat.postMessage'
const SLACK_TIMEOUT_MS = 8_000
/** 슬랙 글에 넣는 제출 문자열의 최대 길이. 본문은 1MB까지 받으므로 글이 그만큼 길어지지 않게 자른다. */
const SLACK_FIELD_MAX_CHARS = 60

/** 슬랙 mrkdwn 특수문자 이스케이프(공식 규칙: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`). `&`를 먼저 바꾼다. */
export function escapeSlackText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function safeField(value: string): string {
  const chars = [...value.replace(/\s+/g, ' ').trim()]
  const cut = chars.length > SLACK_FIELD_MAX_CHARS ? `${chars.slice(0, SLACK_FIELD_MAX_CHARS).join('')}…` : chars.join('')
  return escapeSlackText(cut)
}

export interface ArrivalMessageInput {
  author: string
  week: string | null
  itemCount: number
  formatErrorCount: number
  isSample: boolean
}

/**
 * 기획안 도착 글. 시험 묶음이면 맨 앞에 「[시험]」을 붙인다.
 * 예: `[시험] 기획안이 도착했어요 · 에이전트: 윤진 · 주차: 2026-W41 · 항목 3개 · 형식 오류 0건`
 */
export function formatArrivalMessage(input: ArrivalMessageInput): string {
  const parts = [
    '기획안이 도착했어요',
    `에이전트: ${safeField(input.author)}`,
    `주차: ${input.week ? safeField(input.week) : '없음'}`,
    `항목 ${input.itemCount}개`,
    `형식 오류 ${input.formatErrorCount}건`,
  ]
  const text = parts.join(' · ')
  return input.isSample ? `[시험] ${text}` : text
}

/** 슬랙에 글을 올린다. 던지지 않고 결과를 돌려준다. */
export async function postOpsSlack(channel: OpsSlackChannel, text: string): Promise<OpsSlackResult> {
  const token = process.env.SLACK_BOT_TOKEN
  const channelId = channel === 'report' ? process.env.SLACK_CHANNEL_JAM_REPORT : process.env.SLACK_CHANNEL_JAM_ALERT
  if (!token || !channelId) return { ok: false, error: 'not_configured' }

  try {
    const res = await fetch(SLACK_POST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel: channelId, text }),
      signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
    })
    if (!res.ok) return { ok: false, error: `http_${res.status}` }

    const json: unknown = await res.json().catch(() => null)
    if (typeof json !== 'object' || json === null || (json as { ok?: unknown }).ok !== true) {
      const error = (json as { error?: unknown } | null)?.error
      return { ok: false, error: typeof error === 'string' && error ? error : 'slack_error' }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.name ? err.name : 'fetch_failed' }
  }
}
