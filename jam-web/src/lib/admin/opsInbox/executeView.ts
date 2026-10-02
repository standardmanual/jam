/**
 * 예약 등록·공개 전 취소 화면이 읽는 순수 함수 (티켓 20261002_1648, 상위 20260930_1500 ⑤-a, 운영툴 PRD §8.2. 공개 전 취소는 ⑤-b 티켓 20261002_1649, §8.7).
 *
 * 요약창의 구역 만들기(사전 점검 응답 → 구역·표시 순서), 실행 결과 토스트 문장, 항목별 가장 최근 실패 사유, 「아직 연결하지 않은 종류」
 * 안내 문장, 공개 전 취소 확인창의 문장·미리 보기 읽기·결과 토스트다. 화면(client)이 값으로 가져오므로 **레지스트리·핸들러·사전 점검 모듈(`execute/*`)을 값으로 가져오지 않는다**(서버 전용 코드가
 * 클라이언트 번들로 들어간다). 사전 점검은 서버 로더(`query.ts`)와 실행 API의 `{ dryRun: true }`만 부르고, 이 파일은 그 응답을 읽기만 한다.
 */
import { OPS_DECISION_ACTION_FAIL } from '@/lib/admin/opsInbox/constants'
import { truncateText, userExperienceOf } from '@/lib/admin/opsInbox/itemView'
import { formatKstDayTime, kindLabel } from '@/lib/admin/opsInbox/labels'
import type { OpsDecisionRecord, OpsItemRecord } from '@/lib/admin/opsInbox/query'

// ── 화면 문구 ───────────────────────────────────────────────────────────────────────────────────

export const EXECUTE_SUMMARY_TITLE = '예약 등록 전에 확인해 주세요'
/**
 * 「기다리는 항목」의 이유. 사전 점검의 문장(`PRECHECK_MESSAGES.waiting`)과 같아야 한다 — 그 모듈을 값으로 가져올 수 없어 여기에 적고
 * `executeView.test.ts`가 둘이 같은지 지킨다.
 */
export const EXECUTE_WAITING_REASON = '연결된 항목이 아직 결정 전이에요'
export const EXECUTE_FAIL_CLOSE_NOTE = '예약 등록하면 실패로 닫혀요'
export const EXECUTE_SAMPLE_NOTICE = '시험 묶음이라 자원은 만들지 않아요'
export const EXECUTE_NOTHING_TO_RUN = '지금 예약할 수 있는 항목이 없어요'
export const EXECUTE_LOADING = '사전 점검하는 중이에요'
export const EXECUTE_DECISION_LOG_FAILED = '결정 기록을 남기지 못했어요. 예약은 그대로예요.'

/** [N개 예약 등록하기]. 예약할 항목이 없으면 「예약 등록하기」다(눌러서 왜 못 하는지 볼 수 있게 끄지 않는다). */
export function executeButtonLabel(readyCount: number): string {
  return readyCount > 0 ? `${readyCount}개 예약 등록하기` : '예약 등록하기'
}

/** 「아직 연결하지 않은 종류」 안내. 연결하지 않은 종류가 없으면 null이다(알림 줄을 그리지 않는다). */
export function unconnectedKindsNotice(kinds: readonly string[]): string | null {
  if (kinds.length === 0) return null
  return `${kinds.map((kind) => kindLabel(kind)).join('·')} 항목은 아직 예약 등록을 연결하지 않았어요. 승인해도 예약되지 않아요.`
}

// ── 사전 점검 응답 읽기 ─────────────────────────────────────────────────────────────────────────

/** 사전 점검 응답(`{ dryRun: true }`)에서 요약창이 쓰는 칸. 응답은 JSON이라 모양을 믿지 않고 읽는다. */
export interface PrecheckView {
  ready: string[]
  waiting: string[]
  blocked: Array<{ id: string; reasons: string[] }>
  failClose: Array<{ id: string; reason: string }>
  /** 그룹마다 이번에 만들 항목 ID(생성 순서). */
  groups: Array<{ executeIds: string[] }>
  warnings: Array<{ itemIds: string[]; message: string }>
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function recordList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  const records: Record<string, unknown>[] = []
  for (const entry of value) {
    const record = recordOf(entry)
    if (record) records.push(record)
  }
  return records
}

export function readPrecheck(data: Record<string, unknown>): PrecheckView {
  return {
    ready: stringList(data.ready),
    waiting: stringList(data.waiting),
    blocked: recordList(data.blocked).flatMap((entry) =>
      typeof entry.id === 'string' ? [{ id: entry.id, reasons: stringList(entry.reasons) }] : []
    ),
    failClose: recordList(data.failClose).flatMap((entry) =>
      typeof entry.id === 'string' && typeof entry.reason === 'string' ? [{ id: entry.id, reason: entry.reason }] : []
    ),
    groups: recordList(data.groups).map((entry) => ({ executeIds: stringList(entry.executeIds) })),
    warnings: recordList(data.warnings).flatMap((entry) =>
      typeof entry.message === 'string' ? [{ itemIds: stringList(entry.itemIds), message: entry.message }] : []
    ),
  }
}

// ── 요약창 구역 ─────────────────────────────────────────────────────────────────────────────────

/** 항목 이름을 만들 때 읽는 칸(`OpsItemRecord`의 일부). */
export type SummarySource = Pick<OpsItemRecord, 'id' | 'position' | 'kind' | 'startsAt' | 'original' | 'edited'>

const NAME_TITLE_MAX = 24
const UNKNOWN_ITEM_NAME = '항목'

/** 항목 이름. 목록 행과 같은 표시다: 종류 · 공개 시각(KST) · 유저가 겪는 것(24자까지). */
export function itemDisplayName(item: SummarySource): string {
  const startsAt = formatKstDayTime(item.startsAt)
  return [kindLabel(item.kind), startsAt ? `${startsAt} 시작` : '', truncateText(userExperienceOf(item), NAME_TITLE_MAX)]
    .filter(Boolean)
    .join(' · ')
}

export interface SummaryItem {
  id: string
  name: string
}

/** 예약할 항목의 한 줄. 연결 묶음은 한 덩어리(`group`)로 묶어 보인다. */
export type ReadyEntry = { type: 'single'; item: SummaryItem } | { type: 'group'; items: SummaryItem[] }

export type ExecuteAction = 'schedule' | 'close' | 'none'

export interface ExecuteSummary {
  /** 예약할 항목 수. */
  readyCount: number
  /** 공개 시각 순. 연결 묶음은 한 덩어리다. */
  ready: ReadyEntry[]
  waiting: SummaryItem[]
  blocked: Array<SummaryItem & { reasons: string[] }>
  failClose: Array<SummaryItem & { reason: string }>
  warnings: Array<{ message: string; names: string[] }>
  isSample: boolean
  /** 주 버튼이 하는 일: 예약 등록 / 실패로 닫기(예약할 항목은 없고 실패로 닫을 항목만 있다) / 할 일 없음(버튼이 꺼진다). */
  action: ExecuteAction
  confirmLabel: string
  pendingLabel: string
  /** 실행 요청의 `itemIds`. 요약창이 보인 예약할 항목, 없으면 실패로 닫을 항목이다. */
  requestIds: string[]
}

function startTime(item: SummarySource | undefined): number {
  const time = item?.startsAt ? Date.parse(item.startsAt) : NaN
  return Number.isNaN(time) ? Infinity : time
}

/** 예약할 항목을 공개 시각 순으로 늘어놓는다(같으면 제출 순서). 연결 그룹의 예약할 항목이 둘 이상이면 한 덩어리로 묶고 안은 생성 순서다. */
function orderReady(precheck: PrecheckView, byId: ReadonlyMap<string, SummarySource>, nameOf: (id: string) => SummaryItem): ReadyEntry[] {
  const readySet = new Set(precheck.ready)
  const placed = new Set<string>()
  const chunks: string[][] = []
  for (const group of precheck.groups) {
    const ids = group.executeIds.filter((id) => readySet.has(id) && !placed.has(id))
    if (ids.length === 0) continue
    ids.forEach((id) => placed.add(id))
    chunks.push(ids)
  }
  for (const id of precheck.ready) if (!placed.has(id)) chunks.push([id])

  const keyOf = (ids: string[]) => ({
    at: Math.min(...ids.map((id) => startTime(byId.get(id)))),
    position: Math.min(...ids.map((id) => byId.get(id)?.position ?? Infinity)),
  })
  return chunks
    .map((ids) => ({ ids, key: keyOf(ids) }))
    .sort((a, b) => a.key.at - b.key.at || a.key.position - b.key.position)
    .map(({ ids }): ReadyEntry => (ids.length > 1 ? { type: 'group', items: ids.map(nameOf) } : { type: 'single', item: nameOf(ids[0]) }))
}

/**
 * 사전 점검 응답으로 요약창의 구역을 만든다. `items`는 화면이 들고 있는 항목이고 이름을 붙이는 데만 쓴다(없는 ID는 「항목」이다).
 * 구역은 예약할 항목 · 기다리는 항목 · 예약할 수 없는 항목 · 실패로 닫을 항목 · 경고 순이고, 비어 있는 구역은 화면이 그리지 않는다.
 */
export function buildExecuteSummary(precheck: PrecheckView, items: readonly SummarySource[], isSample: boolean): ExecuteSummary {
  const byId = new Map(items.map((item) => [item.id, item]))
  const nameOf = (id: string): SummaryItem => {
    const item = byId.get(id)
    return { id, name: item ? itemDisplayName(item) : UNKNOWN_ITEM_NAME }
  }

  const ready = orderReady(precheck, byId, nameOf)
  const readyIds = ready.flatMap((entry) => (entry.type === 'group' ? entry.items.map((item) => item.id) : [entry.item.id]))
  const closeIds = precheck.failClose.map((entry) => entry.id)
  const action: ExecuteAction = readyIds.length > 0 ? 'schedule' : closeIds.length > 0 ? 'close' : 'none'

  return {
    readyCount: readyIds.length,
    ready,
    waiting: precheck.waiting.map(nameOf),
    blocked: precheck.blocked.map((entry) => ({ ...nameOf(entry.id), reasons: entry.reasons })),
    failClose: precheck.failClose.map((entry) => ({ ...nameOf(entry.id), reason: entry.reason })),
    warnings: precheck.warnings.map((warning) => ({ message: warning.message, names: warning.itemIds.map((id) => nameOf(id).name) })),
    isSample,
    action,
    confirmLabel: action === 'close' ? '실패로 닫기' : executeButtonLabel(readyIds.length),
    pendingLabel: action === 'close' ? '실패로 닫는 중' : '예약 등록하는 중',
    requestIds: action === 'close' ? closeIds : readyIds,
  }
}

// ── 실행 결과 ───────────────────────────────────────────────────────────────────────────────────

export interface ExecuteResult {
  scheduled: number
  failed: number
  skipped: number
  decisionLogFailed: boolean
}

/** 실행 응답(`{ scheduled, failed, skipped, decisionLogFailed? }`)에서 개수만 읽는다. */
export function readExecuteResult(data: Record<string, unknown>): ExecuteResult {
  const count = (value: unknown) => (Array.isArray(value) ? value.length : 0)
  return {
    scheduled: count(data.scheduled),
    failed: count(data.failed),
    skipped: count(data.skipped),
    decisionLogFailed: data.decisionLogFailed === true,
  }
}

export interface ExecuteToast {
  /** 실패한 항목이나 건너뛴 항목이 있으면 `warning`이다. */
  level: 'success' | 'warning'
  message: string
  /** 결정 기록을 남기지 못했을 때만 따로 띄우는 경고 토스트. */
  logWarning: string | null
}

/** 결과 토스트 문장. 건너뛴 항목이 있으면 그 수를 덧붙인다. */
export function executeToast(result: ExecuteResult): ExecuteToast {
  const { scheduled, failed, skipped, decisionLogFailed } = result
  const parts: string[] = []
  if (scheduled > 0) {
    parts.push(failed > 0 ? `${scheduled}개를 예약 등록했고 ${failed}개는 실패했어요` : `${scheduled}개를 예약 등록했어요`)
  } else if (failed > 0) {
    parts.push(`${failed}개를 실패로 닫았어요`)
  }
  if (skipped > 0) parts.push(`${skipped}개는 그사이 바뀌어 건너뛰었어요`)
  if (parts.length === 0) parts.push('예약 등록한 항목이 없어요')
  return {
    level: failed > 0 || skipped > 0 ? 'warning' : 'success',
    message: parts.join('. '),
    logWarning: decisionLogFailed ? EXECUTE_DECISION_LOG_FAILED : null,
  }
}

// ── 실패 사유 ───────────────────────────────────────────────────────────────────────────────────

/**
 * 항목마다 가장 최근 실패(`fail`)의 사유. 결정 기록은 최신순이라 처음 만난 `fail`이 가장 최근이다. 사유가 비어 있으면 건너뛴다.
 * 목록의 「실패」 행이 칩 아래에 한 줄로 보인다(밸런스의 `linesByItem`과 같은 방식으로 셸이 만들어 넘긴다).
 */
export function latestFailReasons(decisions: readonly Pick<OpsDecisionRecord, 'itemId' | 'action' | 'reason'>[]): Record<string, string> {
  const reasons: Record<string, string> = {}
  for (const decision of decisions) {
    if (decision.action !== OPS_DECISION_ACTION_FAIL || decision.itemId === null) continue
    const reason = decision.reason?.trim()
    if (reason && !Object.prototype.hasOwnProperty.call(reasons, decision.itemId)) reasons[decision.itemId] = reason
  }
  return reasons
}

// ── 공개 전 취소 확인창 (⑤-b, PRD §8.7) ─────────────────────────────────────────────────────────

export const CANCEL_GUIDANCE = '예약된 항목이에요. 공개 시각 전에는 취소할 수 있어요.'
export const CANCEL_TITLE = '이 항목을 공개 전에 취소할까요?'
/** 상세 카드 아래 버튼 글자이면서 확인창 주 버튼의 기본 글자다(함께 취소될 항목이 있으면 `cancelButtonLabel`). */
export const CANCEL_BUTTON = '공개 전 취소하기'
export const CANCEL_PENDING = '취소하는 중'
/** 보조 버튼. 기본값 「취소」가 주 버튼 「공개 전 취소하기」와 겹쳐서 「닫기」로 바꾼다. */
export const CANCEL_CLOSE = '닫기'
export const CANCEL_LOADING = '함께 취소될 항목을 확인하는 중이에요'
export const CANCEL_REASON_LABEL = '취소 사유(선택)'
export const CANCEL_REASON_HELP = '결정 기록에 남아요'
export const CANCEL_IRREVERSIBLE = '공개 전 취소는 되돌릴 수 없어요. 예약해 둔 자원도 지워져요.'
export const CANCEL_IRREVERSIBLE_SAMPLE = '공개 전 취소는 되돌릴 수 없어요. 시험 묶음이라 지울 자원은 없어요.'
export const CANCEL_DECISION_LOG_FAILED = '결정 기록을 남기지 못했어요. 취소는 그대로예요.'

/** 확인창 마지막 줄. 시험 묶음은 지울 자원이 없다(§8.8). */
export function cancelIrreversibleNotice(isSample: boolean): string {
  return isSample ? CANCEL_IRREVERSIBLE_SAMPLE : CANCEL_IRREVERSIBLE
}

export const cancelAlsoTitle = (count: number): string => `함께 취소될 항목 ${count}개`
export const cancelBlockersTitle = (count: number): string => `취소를 막는 항목 ${count}개`

/** 확인창 주 버튼. 함께 취소될 항목이 있으면 「N개 공개 전 취소하기」(N은 이 항목 포함)다. */
export function cancelButtonLabel(alsoCount: number): string {
  return alsoCount > 0 ? `${alsoCount + 1}개 ${CANCEL_BUTTON}` : CANCEL_BUTTON
}

/** 미리 보기 응답(`{ dryRun: true }`)으로 만든 확인창 내용. */
export interface CancelPreviewView {
  /** 함께 취소될 항목: 미리 보기의 `cancelIds`에서 이 항목을 뺀 것(제출 순서). */
  also: Array<{ id: string; line: string }>
  /** 취소를 막는 항목과 서버 이유. 있으면 확인 버튼을 끈다. */
  blockers: Array<{ id: string; line: string; reason: string }>
  canConfirm: boolean
  confirmLabel: string
}

const UNKNOWN_CANCEL_LINE = '항목'

/**
 * 미리 보기 응답에서 확인창이 쓰는 칸을 읽는다. 응답은 JSON이라 모양을 믿지 않고 읽는다. `items`는 화면이 들고 있는 항목이고 한 줄 요약을 붙이는 데만 쓴다
 * (없는 ID는 「항목」). 막는 항목의 이유가 비어 있으면 그 항목은 이유 없이 한 줄만 보인다.
 */
export function buildCancelPreview<T extends { id: string }>(
  data: Record<string, unknown>,
  itemId: string,
  items: readonly T[],
  lineOf: (item: T) => string
): CancelPreviewView {
  const byId = new Map(items.map((item) => [item.id, item]))
  const lineById = (id: string): string => {
    const item = byId.get(id)
    return item ? lineOf(item) : UNKNOWN_CANCEL_LINE
  }
  const also = stringList(data.cancelIds)
    .filter((id) => id !== itemId)
    .map((id) => ({ id, line: lineById(id) }))
  const blockers = recordList(data.blockers).flatMap((entry) =>
    typeof entry.id === 'string' ? [{ id: entry.id, line: lineById(entry.id), reason: typeof entry.reason === 'string' ? entry.reason : '' }] : []
  )
  return { also, blockers, canConfirm: blockers.length === 0, confirmLabel: cancelButtonLabel(also.length) }
}

export interface CancelToast {
  message: string
  /** 결정 기록을 남기지 못했을 때만 따로 띄우는 경고 토스트. */
  logWarning: string | null
}

/** 취소 응답(`{ cancelled, missing, decisionLogFailed? }`)의 결과 토스트. 1개면 「공개 전에 취소했어요」, 2개 이상이면 「N개를 공개 전에 취소했어요」다. */
export function cancelToast(data: Record<string, unknown>): CancelToast {
  const count = stringList(data.cancelled).length
  return {
    message: count > 1 ? `${count}개를 공개 전에 취소했어요` : '공개 전에 취소했어요',
    logWarning: data.decisionLogFailed === true ? CANCEL_DECISION_LOG_FAILED : null,
  }
}

/**
 * 취소 요청(미리 보기 포함)이 실패했을 때 화면을 새로 읽어야 하는지. 409는 그사이 다른 곳에서 바뀌었다는 뜻이고(`decisionFailureMessage`가 「화면을 새로
 * 불러왔어요」를 붙이므로 실제로 새로 읽어야 말이 맞다), 500에 `cancelled`가 있으면 일부만 취소한 것이라 항목 상태가 바뀌어 있다. 그 밖의 500·네트워크 오류는 문장만 보인다.
 */
export function cancelNeedsRefresh(status: number, data: Record<string, unknown>): boolean {
  return status === 409 || (status === 500 && Array.isArray(data.cancelled))
}
