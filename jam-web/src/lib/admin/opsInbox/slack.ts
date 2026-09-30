/**
 * 운영툴 슬랙 이력 알림 (티켓 20260930_1816) — 서버(Vercel)에서 `chat.postMessage`를 부른다.
 *
 * - 쓰는 이벤트는 「기획안 도착」(티켓 20260930_1816)과 결정 글(승인·반려·일괄 승인·수정·되돌림, 티켓 20260930_1818)이고 모두
 *   `#jam-report`다. `alert` 채널은 뒤 티켓(실패·되돌림 실패)이 쓴다.
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

function safeField(value: string, maxChars: number = SLACK_FIELD_MAX_CHARS): string {
  const chars = [...value.replace(/\s+/g, ' ').trim()]
  const cut = chars.length > maxChars ? `${chars.slice(0, maxChars).join('')}…` : chars.join('')
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

/** 반려 글에 붙이는 사유의 최대 길이(글자). 사유는 500자까지 받으므로 글이 길어지지 않게 자른다. */
const SLACK_REASON_MAX_CHARS = 100
/** 수정 글에 이름을 나열하는 칸 수. 넘으면 「외 N칸」으로 줄인다. */
const SLACK_CHANGED_LABELS_MAX = 8

/**
 * 결정 글의 재료(티켓 20260930_1818). `itemLabel`은 「종류 · 공개 시각(KST)」이다 — 제출자가 적은 `author`·`item_key`는
 * 자기 신고라 쓰지 않는다. 수정·되돌림 글에는 항목 이름과 바뀐 칸의 이름만 싣고 값은 싣지 않는다.
 */
export type DecisionMessageInput =
  | { action: 'approve'; isSample: boolean; itemLabel: string }
  | { action: 'reject'; isSample: boolean; itemLabel: string; reason: string }
  | { action: 'bulk_approve'; isSample: boolean; approved: number; excluded: number; skipped: number }
  | { action: 'edit' | 'revert'; isSample: boolean; itemLabel: string; changedLabels: readonly string[] }

/**
 * 결정 글. 시험 묶음이면 맨 앞에 「[시험]」을 붙인다. 모든 제출 문자열은 `escapeSlackText`를 거친다.
 * 예: `[시험] 승인했어요 · 홈피드 카드 · 10/5(월) 09:00`, `[시험] 일괄 승인했어요 · 11개 승인, 1개 제외`
 */
export function formatDecisionMessage(input: DecisionMessageInput): string {
  let text: string
  switch (input.action) {
    case 'approve':
      text = `승인했어요 · ${safeField(input.itemLabel)}`
      break
    case 'reject':
      text = `반려했어요 · ${safeField(input.itemLabel)} · 사유: ${safeField(input.reason, SLACK_REASON_MAX_CHARS)}`
      break
    case 'bulk_approve': {
      const skipped = input.skipped > 0 ? `, ${input.skipped}개는 이미 처리돼 건너뜀` : ''
      text = `일괄 승인했어요 · ${input.approved}개 승인, ${input.excluded}개 제외${skipped}`
      break
    }
    case 'edit':
    case 'revert': {
      const shown = input.changedLabels.slice(0, SLACK_CHANGED_LABELS_MAX).map((label) => safeField(label))
      const rest = input.changedLabels.length - shown.length
      const changed = shown.length > 0 ? ` · 바뀐 칸: ${shown.join(', ')}${rest > 0 ? ` 외 ${rest}칸` : ''}` : ''
      const head = input.action === 'revert' ? '수정했어요(되돌림)' : '수정했어요'
      text = `${head} · ${safeField(input.itemLabel)}${changed}`
      break
    }
  }
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
