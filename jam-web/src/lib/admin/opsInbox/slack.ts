/**
 * 운영툴 슬랙 이력 알림 (티켓 20260930_1816) — 서버(Vercel)에서 `chat.postMessage`를 부른다.
 *
 * - 쓰는 이벤트는 「기획안 도착」(티켓 20260930_1816)과 결정 글(승인·반려·일괄 승인·수정·되돌림, 티켓 20260930_1818),
 *   예약 등록 요약(티켓 20261002_1123)과 공개 전 취소 글(티켓 20261002_1256)이 `#jam-report`, 예약 등록 실패 글(티켓 20261002_1123)과
 *   취소를 끝내지 못한 글(티켓 20261002_1256)이 `#jam-alert`다. 상태 맞추기(티켓 20261002_1813)는 공개·종료 요약을 `#jam-report`로, 실패·밖에서 지워짐을 `#jam-alert`로 보낸다.
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

// ── 예약 등록 글 (티켓 20261002_1123) ───────────────────────────────────────────────────────────

/** 실패 글에 항목을 나열하는 건수. 넘으면 「외 N건」으로 줄인다. */
const SLACK_EXECUTE_FAILURES_MAX = 5

export interface ExecuteSummaryMessageInput {
  isSample: boolean
  /** 예약 등록한 항목 수. */
  scheduled: number
  /** 제외한 항목 수: 사전 점검에서 실행하지 못한 승인 항목과 그사이 바뀌어 건너뛴 항목. */
  excluded: number
  /** 실패한 항목 수. */
  failed: number
}

/**
 * 예약 등록 요약 글(`#jam-report`). 실행 한 번에 한 건이다. 시험 묶음이면 맨 앞에 「[시험]」을 붙인다.
 * 예: `[시험] 11개 예약 등록, 1개 제외, 1개 실패`(실패가 없으면 뒤 구절이 없다)
 */
export function formatExecuteSummaryMessage(input: ExecuteSummaryMessageInput): string {
  const failed = input.failed > 0 ? `, ${input.failed}개 실패` : ''
  const text = `${input.scheduled}개 예약 등록, ${input.excluded}개 제외${failed}`
  return input.isSample ? `[시험] ${text}` : text
}

export interface ExecuteFailureMessageInput {
  isSample: boolean
  /** 항목 이름(「종류 · 공개 시각(KST)」)과 사유(쉬운 문장). DB 오류 원문은 싣지 않는다. */
  failures: ReadonlyArray<{ itemLabel: string; reason: string }>
  /** 자원은 만들었는데 결정 기록을 남기지 못했다. */
  decisionLogFailed?: boolean
}

/**
 * 예약 등록 실패 글(`#jam-alert`). 실행 한 번에 한 건이고, 항목은 5건까지 나열하고 나머지는 「외 N건」이다.
 * 결정 기록을 남기지 못했으면 그 줄이 더해진다. 시험 묶음이면 맨 앞에 「[시험]」을 붙인다.
 */
export function formatExecuteFailureMessage(input: ExecuteFailureMessageInput): string {
  const lines: string[] = []
  if (input.failures.length > 0) {
    lines.push(`예약 등록에 실패했어요 · ${input.failures.length}건`)
    for (const failure of input.failures.slice(0, SLACK_EXECUTE_FAILURES_MAX)) {
      lines.push(`• ${safeField(failure.itemLabel)} — ${safeField(failure.reason, SLACK_REASON_MAX_CHARS)}`)
    }
    const rest = input.failures.length - SLACK_EXECUTE_FAILURES_MAX
    if (rest > 0) lines.push(`외 ${rest}건`)
  }
  if (input.decisionLogFailed) lines.push('결정 기록을 남기지 못했어요. 서버 로그를 확인해 주세요')
  const text = lines.join('\n')
  return input.isSample ? `[시험] ${text}` : text
}

// ── 공개 전 취소 글 (티켓 20261002_1256) ────────────────────────────────────────────────────────

/** 취소 글에 항목을 나열하는 건수(예약 등록 글과 같다). 넘으면 「외 N건」으로 줄인다. */
const SLACK_CANCEL_ITEMS_MAX = 5

export interface CancelMessageInput {
  isSample: boolean
  /** 취소한 항목 이름(「종류 · 공개 시각(KST)」). */
  itemLabels: readonly string[]
}

/**
 * 공개 전 취소 글(`#jam-report`). 취소 한 번에 한 건이고, 함께 취소한 항목을 한 건에 모은다. 항목은 5건까지 나열하고 나머지는 「외 N건」이다.
 * 시험 묶음이면 맨 앞에 「[시험]」을 붙인다. 예: `[시험] 공개 전 취소 2건` 다음 줄부터 `• 홈피드 카드 · 10/10(토) 09:00`
 */
export function formatCancelMessage(input: CancelMessageInput): string {
  const lines = [`공개 전 취소 ${input.itemLabels.length}건`]
  for (const label of input.itemLabels.slice(0, SLACK_CANCEL_ITEMS_MAX)) lines.push(`• ${safeField(label)}`)
  const rest = input.itemLabels.length - SLACK_CANCEL_ITEMS_MAX
  if (rest > 0) lines.push(`외 ${rest}건`)
  const text = lines.join('\n')
  return input.isSample ? `[시험] ${text}` : text
}

export interface CancelFailureMessageInput {
  isSample: boolean
  /** 취소를 끝내지 못해 남은 항목: 이름(「종류 · 공개 시각(KST)」)과 사유(쉬운 문장). DB 오류 원문은 싣지 않는다. */
  problems: ReadonlyArray<{ itemLabel: string; reason: string }>
  /** 취소를 마친 항목 수. */
  cancelled: number
  /** 취소했는데 결정 기록을 남기지 못했다. */
  decisionLogFailed?: boolean
}

/**
 * 공개 전 취소를 끝내지 못했을 때의 글(`#jam-alert`). 취소 한 번에 한 건이다. 항목은 5건까지 나열하고 나머지는 「외 N건」이다.
 * 결정 기록을 남기지 못했으면 그 줄이 더해진다. 시험 묶음이면 맨 앞에 「[시험]」을 붙인다.
 */
export function formatCancelFailureMessage(input: CancelFailureMessageInput): string {
  const lines: string[] = []
  if (input.problems.length > 0) {
    lines.push(`공개 전 취소를 끝내지 못했어요 · ${input.cancelled}건 취소, ${input.problems.length}건 남음`)
    for (const problem of input.problems.slice(0, SLACK_CANCEL_ITEMS_MAX)) {
      lines.push(`• ${safeField(problem.itemLabel)} — ${safeField(problem.reason, SLACK_REASON_MAX_CHARS)}`)
    }
    const rest = input.problems.length - SLACK_CANCEL_ITEMS_MAX
    if (rest > 0) lines.push(`외 ${rest}건`)
  }
  if (input.decisionLogFailed) lines.push('결정 기록을 남기지 못했어요. 서버 로그를 확인해 주세요')
  const text = lines.join('\n')
  return input.isSample ? `[시험] ${text}` : text
}

// ── 지금 종료 글 (티켓 20261006_0950) ───────────────────────────────────────────────────────────

export interface EndMessageInput {
  isSample: boolean
  /** 끝낸 항목 이름(「종류 · 공개 시각(KST)」). */
  itemLabel: string
  /** 운영자가 적은 사유. 없으면 `null`이다. */
  reason: string | null
  /** `ended`는 이번에 자원의 종료 시각을 바꿨고, `alreadyEnded`·`missing`은 자원을 건드리지 않았다(이미 끝나 있었거나 이미 없었다). */
  resourceState: 'ended' | 'alreadyEnded' | 'missing'
}

const END_STATE_SUFFIX: Readonly<Record<EndMessageInput['resourceState'], string>> = {
  ended: '',
  alreadyEnded: ' (이미 끝나 있었어요)',
  missing: ' (자원이 이미 없었어요)',
}

/**
 * 지금 종료 글(`#jam-report`). 요청 한 번에 항목 한 건이다. 자원이 이미 끝났거나 없었으면 항목 줄 끝에 표시하고, 사유가 있으면 줄을 더한다.
 * 시험 묶음이면 맨 앞에 「[시험]」을 붙인다. 예: `지금 종료 1건` 다음 줄 `• 홈피드 카드 · 10/10(토) 09:00`, `사유: 오류가 있었어요`
 */
export function formatEndMessage(input: EndMessageInput): string {
  const lines = ['지금 종료 1건', `• ${safeField(input.itemLabel)}${END_STATE_SUFFIX[input.resourceState]}`]
  if (input.reason) lines.push(`사유: ${safeField(input.reason, SLACK_REASON_MAX_CHARS)}`)
  const text = lines.join('\n')
  return input.isSample ? `[시험] ${text}` : text
}

export interface EndFailureMessageInput {
  isSample: boolean
  /** 끝내지 못한 항목: 이름(「종류 · 공개 시각(KST)」)과 사유(쉬운 문장). DB 오류 원문은 싣지 않는다. 종료는 됐는데 결정 기록만 못 남겼으면 `null`이다. */
  problem: { itemLabel: string; reason: string } | null
  /** 결정 기록을 남기지 못했다. */
  decisionLogFailed?: boolean
}

/**
 * 지금 종료를 끝내지 못했을 때의 글(`#jam-alert`). 요청 한 번에 한 건이다. 결정 기록을 남기지 못했으면 그 줄이 더해진다(종료는 됐고 기록만 못 남긴 경우는 이 줄만 있다).
 * 시험 묶음이면 맨 앞에 「[시험]」을 붙인다.
 */
export function formatEndFailureMessage(input: EndFailureMessageInput): string {
  const lines: string[] = []
  if (input.problem) {
    lines.push('지금 종료를 끝내지 못했어요', `• ${safeField(input.problem.itemLabel)} — ${safeField(input.problem.reason, SLACK_REASON_MAX_CHARS)}`)
  }
  if (input.decisionLogFailed) lines.push('결정 기록을 남기지 못했어요. 서버 로그를 확인해 주세요')
  const text = lines.join('\n')
  return input.isSample ? `[시험] ${text}` : text
}

// ── 상태 맞추기 글 (티켓 20261002_1813) ─────────────────────────────────────────────────────────

/** 상태 맞추기 글에 항목을 나열하는 건수(예약 등록 글과 같다). 넘으면 「외 N건」으로 줄인다. */
const SLACK_RECONCILE_ITEMS_MAX = 5

export interface ReconcileReportMessageInput {
  isSample: boolean
  /** 공개한 항목 이름(「종류 · 공개 시각(KST)」). */
  published: readonly string[]
  /** 종료 시각이 지나 종료한 항목 이름. */
  ended: readonly string[]
}

/**
 * 상태 맞추기 요약 글(`#jam-report`). 한 회차에 한 건이고, 공개·종료가 있을 때만 보낸다. 항목은 5건까지 나열하고 나머지는 「외 N건」이다.
 * 시험 묶음이면 맨 앞에 「[시험]」을 붙인다. 예: `3개 공개, 2개 종료` 다음 줄부터 `• 공개 · 홈피드 카드 · 10/10(토) 09:00`
 */
export function formatReconcileReportMessage(input: ReconcileReportMessageInput): string {
  const counts = [
    ...(input.published.length > 0 ? [`${input.published.length}개 공개`] : []),
    ...(input.ended.length > 0 ? [`${input.ended.length}개 종료`] : []),
  ]
  const entries = [...input.published.map((label) => `공개 · ${safeField(label)}`), ...input.ended.map((label) => `종료 · ${safeField(label)}`)]
  const lines = [counts.join(', '), ...entries.slice(0, SLACK_RECONCILE_ITEMS_MAX).map((entry) => `• ${entry}`)]
  const rest = entries.length - SLACK_RECONCILE_ITEMS_MAX
  if (rest > 0) lines.push(`외 ${rest}건`)
  const text = lines.join('\n')
  return input.isSample ? `[시험] ${text}` : text
}

export interface ReconcileAlertItem {
  /** 항목 이름(「종류 · 공개 시각(KST)」). */
  itemLabel: string
  /** 쉬운 문장. DB 오류 원문은 싣지 않는다. */
  reason: string
  /** 지우지 못해 남은 자원의 ID. 운영자가 직접 정리해야 해서 이 글에만 싣는다. */
  resourceId?: string | null
}

export interface ReconcileAlertMessageInput {
  isSample: boolean
  failed: readonly ReconcileAlertItem[]
  /** 예약됨인데 자원이 운영툴 밖에서 지워져 취소한 항목. */
  cancelled: readonly ReconcileAlertItem[]
  /** 게재중인데 자원이 운영툴 밖에서 지워져 종료한 항목. */
  ended: readonly ReconcileAlertItem[]
  /** 상태는 바꿨는데 결정 기록을 남기지 못했다. */
  decisionLogFailed?: boolean
}

/**
 * 상태 맞추기 알림 글(`#jam-alert`). 한 회차에 한 건이고, 실패·밖에서 지워짐이 있을 때 보낸다. 항목은 실패, 취소, 종료 순으로 5건까지 나열하고 나머지는 「외 N건」이다.
 * 결정 기록을 남기지 못했으면 그 줄이 더해진다. 시험 묶음이면 맨 앞에 「[시험]」을 붙인다.
 * 예: `상태 맞추기에서 확인할 항목이 있어요 · 실패 1건, 취소 1건` 다음 줄부터 `• 실패 · 홈피드 카드 · 10/10(토) 09:00 — 예약 등록이 끝나지 않았어요`
 */
export function formatReconcileAlertMessage(input: ReconcileAlertMessageInput): string {
  const groups = [
    { label: '실패', items: input.failed },
    { label: '취소', items: input.cancelled },
    { label: '종료', items: input.ended },
  ].filter((group) => group.items.length > 0)

  const lines: string[] = []
  if (groups.length > 0) {
    lines.push(`상태 맞추기에서 확인할 항목이 있어요 · ${groups.map((group) => `${group.label} ${group.items.length}건`).join(', ')}`)
    const entries = groups.flatMap((group) =>
      group.items.map((item) => {
        const resource = item.resourceId ? ` · 자원 ID: ${safeField(item.resourceId)}` : ''
        return `• ${group.label} · ${safeField(item.itemLabel)} — ${safeField(item.reason, SLACK_REASON_MAX_CHARS)}${resource}`
      })
    )
    lines.push(...entries.slice(0, SLACK_RECONCILE_ITEMS_MAX))
    const rest = entries.length - SLACK_RECONCILE_ITEMS_MAX
    if (rest > 0) lines.push(`외 ${rest}건`)
  }
  if (input.decisionLogFailed) lines.push('결정 기록을 남기지 못했어요. 서버 로그를 확인해 주세요')
  const text = lines.join('\n')
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
