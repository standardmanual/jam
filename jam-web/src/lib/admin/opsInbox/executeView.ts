/**
 * 예약 등록·공개 전 취소 화면이 읽는 순수 함수 (티켓 20261002_1648, 상위 20260930_1500 ⑤-a, 운영툴 PRD §8.2. 공개 전 취소는 ⑤-b 티켓 20261002_1649, §8.7).
 *
 * 요약창의 구역 만들기(사전 점검 응답 → 구역·표시 순서), 실행 결과 토스트 문장, 항목별 가장 최근 실패 사유,
 * 공개 전 취소 확인창의 문장·미리 보기 읽기·결과 토스트, 요약창의 JAM! 배지 소급 미리 세기 구역(티켓 20261005_1607 ⑨-b),
 * 공개 뒤 「지금 종료」 확인창의 문장·미리 보기 읽기·결과 토스트(티켓 20261006_1038 ⑪-b, §8.7)다. 화면(client)이 값으로 가져오므로 **레지스트리·핸들러·사전 점검 모듈(`execute/*`)을 값으로 가져오지 않는다**(서버 전용 코드가
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
/** 요약창의 JAM! 배지 구역(⑨-b). 「획득」은 UX 가이드의 고정 용어이고 포인트는 「P」로 줄이지 않는다. */
export const EXECUTE_BADGE_PREVIEW_TITLE = '공개되면 바로 획득하는 유저'
export const EXECUTE_BADGE_PREVIEW_LOADING = '미리 세는 중이에요'
/** 구역 전체가 실패했을 때와 배지 한 줄을 세지 못했을 때 같은 문장이다. */
export const EXECUTE_BADGE_PREVIEW_FAILED = '미리 세지 못했어요'

/** [N개 예약 등록하기]. 예약할 항목이 없으면 「예약 등록하기」다(눌러서 왜 못 하는지 볼 수 있게 끄지 않는다). */
export function executeButtonLabel(readyCount: number): string {
  return readyCount > 0 ? `${readyCount}개 예약 등록하기` : '예약 등록하기'
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
  /** 「승인하고 예약」 점검(`{ dryRun: true, approve: true }`)에서 예약 등록과 함께 승인할 항목 ID. 응답에 없으면 빈 목록이다. */
  approving: string[]
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
    approving: stringList(data.approving),
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
  /** 예약 등록과 함께 승인할 항목(검토중이던 항목). 예약할 항목·실패로 닫을 항목 안에 든 것만 싣는다. */
  approving: SummaryItem[]
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
    approving: precheck.approving.filter((id) => readyIds.includes(id) || closeIds.includes(id)).map(nameOf),
    isSample,
    action,
    confirmLabel: action === 'close' ? '실패로 닫기' : executeButtonLabel(readyIds.length),
    pendingLabel: action === 'close' ? '실패로 닫는 중' : '예약 등록하는 중',
    requestIds: action === 'close' ? closeIds : readyIds,
  }
}

// ── JAM! 배지 소급 미리 세기 (⑨-b, 티켓 20261005_1607) ──────────────────────────────────────────

const JAM_BADGE_KIND = 'jam_badge'

/** 미리 세기 줄의 상태. 서버 `badgePreview.ts`의 `BadgePreviewStatus`와 같다(그 모듈을 값으로 가져올 수 없어 여기에 적는다). */
const BADGE_PREVIEW_STATUSES = ['counted', 'collectionReward', 'missionReward', 'notCountable', 'formatInvalid', 'failed'] as const
export type BadgePreviewStatus = (typeof BADGE_PREVIEW_STATUSES)[number]

export type BadgePreviewLine = { itemId: string; status: 'counted'; userCount: number; points: number } | { itemId: string; status: Exclude<BadgePreviewStatus, 'counted'> }

/** 배지 미리 세기 응답(`{ badgePreview: true }`)에서 요약창이 쓰는 칸. */
export interface BadgePreviewView {
  totalUsers: number
  evaluatedUsers: number
  sampled: boolean
  failedUsers: number
  lines: BadgePreviewLine[]
}

/** 요약창의 배지 구역 한 줄. `name`은 예약할 항목과 같은 표시, `text`는 센 값이나 세지 않은 이유다. */
export interface BadgePreviewLineView {
  id: string
  name: string
  text: string
}

export interface BadgePreviewLines {
  lines: BadgePreviewLineView[]
  /** 표본으로 추정했거나 일부 유저를 세지 못했다는 안내. 센 배지가 있을 때만 나온다. */
  notes: string[]
}

/** 요약창의 배지 구역 상태: 세는 중 · 실패 · 완료. 구역이 없으면(예약할 JAM! 배지가 없다) 화면이 `null`을 넘긴다. */
export type BadgePreviewSection = { status: 'loading' } | { status: 'failed' } | ({ status: 'done' } & BadgePreviewLines)

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPreviewStatus(value: unknown): value is BadgePreviewStatus {
  return typeof value === 'string' && (BADGE_PREVIEW_STATUSES as readonly string[]).includes(value)
}

/**
 * 배지 미리 세기 응답에서 요약창이 쓰는 칸을 읽는다. 응답은 JSON이라 모양을 믿지 않고 읽는다. 읽을 수 없으면 null이다(구역은 「미리 세지 못했어요」).
 * 줄에서 항목 ID가 없는 것은 버리고, 모르는 상태나 값이 틀린 센 줄은 「세지 못함」으로 둔다(숫자를 지어내지 않는다).
 */
export function readBadgePreview(data: Record<string, unknown>): BadgePreviewView | null {
  const raw = recordOf(data.badgePreview)
  if (!raw || !Array.isArray(raw.lines)) return null
  const { totalUsers, evaluatedUsers, failedUsers } = raw
  if (!isCount(totalUsers) || !isCount(evaluatedUsers) || !isCount(failedUsers)) return null

  const lines = recordList(raw.lines).flatMap((entry): BadgePreviewLine[] => {
    if (typeof entry.itemId !== 'string') return []
    const itemId = entry.itemId
    if (!isPreviewStatus(entry.status)) return [{ itemId, status: 'failed' }]
    if (entry.status !== 'counted') return [{ itemId, status: entry.status }]
    return isCount(entry.userCount) && isCount(entry.points) ? [{ itemId, status: 'counted', userCount: entry.userCount, points: entry.points }] : [{ itemId, status: 'failed' }]
  })
  return { totalUsers, evaluatedUsers, sampled: raw.sampled === true, failedUsers, lines }
}

const formatCount = (value: number): string => value.toLocaleString('ko-KR')

/** 센 줄의 문장: 「공개되면 약 N명에게 P포인트」, 배지 포인트가 0이면 「공개되면 약 N명이 획득해요」, 0명이면 「공개돼도 바로 획득하는 유저는 없어요」. */
function badgeLineText(line: BadgePreviewLine): string {
  switch (line.status) {
    case 'counted':
      if (line.userCount === 0) return '공개돼도 바로 획득하는 유저는 없어요'
      return line.points > 0 ? `공개되면 약 ${formatCount(line.userCount)}명에게 ${formatCount(line.points)}포인트` : `공개되면 약 ${formatCount(line.userCount)}명이 획득해요`
    case 'collectionReward':
      return '컬렉션을 완성하면 획득해요'
    case 'missionReward':
      return '미션 보상으로 획득해요'
    case 'notCountable':
      return '이 조건은 미리 세지 않아요'
    case 'formatInvalid':
      return '형식이 맞지 않아 세지 않았어요'
    case 'failed':
      return EXECUTE_BADGE_PREVIEW_FAILED
  }
}

/**
 * 배지 구역의 줄과 안내를 만든다. 줄 이름은 예약할 항목과 같은 표시(`itemDisplayName`)이고, 화면이 모르는 항목은 「항목」이다.
 * 안내는 센 줄이 하나라도 있을 때만 붙는다: 표본이면 「유저 M명 중 K명을 세어 추정했어요」, 세다가 오류가 난 유저가 있으면 「N명은 세지 못해 빼고 셌어요」.
 */
export function badgePreviewLines(view: BadgePreviewView, items: readonly SummarySource[]): BadgePreviewLines {
  const byId = new Map(items.map((item) => [item.id, item]))
  const lines = view.lines.map((line): BadgePreviewLineView => {
    const item = byId.get(line.itemId)
    return { id: line.itemId, name: item ? itemDisplayName(item) : UNKNOWN_ITEM_NAME, text: badgeLineText(line) }
  })
  const notes: string[] = []
  if (view.lines.some((line) => line.status === 'counted')) {
    if (view.sampled && view.totalUsers > 0 && view.evaluatedUsers > 0) notes.push(`유저 ${formatCount(view.totalUsers)}명 중 ${formatCount(view.evaluatedUsers)}명을 세어 추정했어요`)
    if (view.failedUsers > 0) notes.push(`${formatCount(view.failedUsers)}명은 세지 못해 빼고 셌어요`)
  }
  return { lines, notes }
}

/**
 * 사전 점검의 「예약할 항목」 가운데 JAM! 배지의 항목 ID. 있을 때만 배지 미리 세기를 요청한다(없으면 요청을 보내지 않는다).
 * 서버는 자기 사전 점검으로 다시 판정하므로 이 목록은 요청 여부를 정하는 데만 쓴다. 화면이 모르는 항목(`items`에 없음)은 세지 않는다.
 */
export function readyJamBadgeIds(precheck: PrecheckView, items: readonly Pick<SummarySource, 'id' | 'kind'>[]): string[] {
  const kindById = new Map(items.map((item) => [item.id, item.kind]))
  return precheck.ready.filter((id) => kindById.get(id) === JAM_BADGE_KIND)
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

// ── 공개 뒤 지금 종료 확인창 (⑪-b, PRD §8.7) ────────────────────────────────────────────────────

export const END_GUIDANCE = '게재 중인 항목이에요. 지금 종료하면 유저 화면에서 바로 내려가요.'
export const END_TITLE = '이 항목을 지금 종료할까요?'
/** 상세 카드 아래 버튼 글자이면서 확인창 주 버튼 글자다. */
export const END_BUTTON = '지금 종료하기'
export const END_PENDING = '종료하는 중'
/** 보조 버튼. 기본값 「취소」가 주 버튼과 헷갈려서 공개 전 취소와 같이 「닫기」로 바꾼다. */
export const END_CLOSE = '닫기'
export const END_LOADING = '종료 영향을 확인하는 중이에요'
export const END_REASON_LABEL = '종료 사유(선택)'
export const END_REASON_HELP = '결정 기록에 남아요'
export const END_SAMPLE_NOTICE = '시험 묶음이라 실제 자원은 바뀌지 않아요.'
export const END_IRREVERSIBLE = '지금 종료는 되돌릴 수 없어요.'
export const END_STILL_LIVE_NOTE = '이 항목을 가리키는 게재 중 항목은 함께 종료되지 않아요'
export const END_DECISION_LOG_FAILED = '결정 기록을 남기지 못했어요. 종료는 그대로예요.'

/**
 * 「지금 종료」가 있는 종류. 서버 핸들러(`execute/*`)의 `end` 유무와 같아야 하지만 그 모듈을 값으로 가져올 수 없어 여기에 적는다
 * (드랍 예약에는 `end`가 없다. 서버가 409 `noEnd`로 막는다).
 */
export const END_SUPPORTED_KINDS: readonly string[] = ['home_feed_card', 'mission', 'jam_badge', 'collection_launch', 'recipe']

/** 「게재중」이고 지금 종료가 있는 종류일 때만 상세 하단에 지금 종료 줄을 보인다. */
export function canEndItem(item: { status: string; kind: string | null }): boolean {
  return item.status === 'live' && item.kind !== null && END_SUPPORTED_KINDS.includes(item.kind)
}

export const endStillLiveTitle = (count: number): string => `계속 보이는 항목 ${count}개`

/** 영향 유저 수(미리 보기 응답의 `impact`). 세기가 실패했거나 칸이 없으면 `null`, 숫자가 없는 칸은 비어 있다. */
export interface EndImpactView {
  participants?: number
  inProgressUsers?: number
  fillingUsers?: number
}

export interface EndPreviewRead {
  isSample: boolean
  kind: string | null
  pointedByLive: Array<{ id: string; kind: string | null; label: string }>
  impact: EndImpactView | null
}

function countOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

/** 미리 보기 응답(`{ dryRun: true }`)을 읽는다. 응답은 JSON이라 모양을 믿지 않고 읽는다. */
export function readEndPreview(data: Record<string, unknown>): EndPreviewRead {
  const impactRecord = recordOf(data.impact)
  return {
    isSample: data.isSample === true,
    kind: typeof data.kind === 'string' ? data.kind : null,
    pointedByLive: recordList(data.pointedByLive).flatMap((entry) =>
      typeof entry.id === 'string'
        ? [{ id: entry.id, kind: typeof entry.kind === 'string' ? entry.kind : null, label: typeof entry.label === 'string' ? entry.label : '' }]
        : []
    ),
    impact: impactRecord
      ? { participants: countOf(impactRecord.participants), inProgressUsers: countOf(impactRecord.inProgressUsers), fillingUsers: countOf(impactRecord.fillingUsers) }
      : null,
  }
}

/**
 * 숫자가 들어가는 문장 한 줄. 수가 0이면 줄을 뺀다(null). 수를 모르면(세기 실패·칸 없음) 숫자 없는 문장이다.
 * `withCount`는 수를 받아 문장을 만든다.
 */
function countedLine(count: number | undefined, withCount: (formatted: string) => string, withoutCount: string): string | null {
  if (count === undefined) return withoutCount
  if (count === 0) return null
  return withCount(formatCount(count))
}

/** 종류별 확인창 문단(문장 배열). 지금 종료가 없는 종류는 빈 배열이다. 숫자 규칙은 `countedLine`이다. */
export function endEffectLines(kind: string | null, impact: EndImpactView | null): string[] {
  const lines: Array<string | null> = []
  if (kind === 'home_feed_card') {
    lines.push('홈피드와 카드 상세에서 바로 내려가요.')
  } else if (kind === 'mission') {
    lines.push(
      '참가와 진행 집계가 바로 멈춰요.',
      countedLine(impact?.inProgressUsers, (n) => `진행 중인 유저 ${n}명은 더는 달성할 수 없어요.`, '진행 중인 유저는 더는 달성할 수 없어요.'),
      '받은 보상은 그대로예요.',
      countedLine(impact?.participants, (n) => `다음 18시 알림에서 참가자 ${n}명에게 종료 결과 알림이 가요.`, '다음 18시 알림에서 참가자에게 종료 결과 알림이 가요.')
    )
  } else if (kind === 'jam_badge') {
    lines.push('이 배지를 더는 획득할 수 없어요.', '이미 획득한 배지는 그대로예요.')
  } else if (kind === 'collection_launch') {
    lines.push(
      '새 드랍과 완성 판정이 바로 멈춰요.',
      countedLine(impact?.fillingUsers, (n) => `아직 완성하지 못한 유저 약 ${n}명은 더는 완성 보상을 받을 수 없어요.`, '아직 완성하지 못한 유저는 더는 완성 보상을 받을 수 없어요.'),
      '장착한 배지는 그대로예요.'
    )
  } else if (kind === 'recipe') {
    lines.push('믹스 화면에서 바로 사라지고 더는 믹스할 수 없어요.', '이미 받은 결과물은 그대로예요.')
  }
  return lines.filter((line): line is string => line !== null)
}

/** 미리 보기 응답으로 만든 확인창 내용. */
export interface EndPreviewView {
  isSample: boolean
  /** 종류별 문단. */
  effectLines: string[]
  /** 함께 끝나지 않는 게재 중 항목(이 항목을 가리키는 것). 없으면 구역을 그리지 않는다. */
  stillLive: Array<{ id: string; line: string }>
}

const UNKNOWN_END_LINE = '항목'

/**
 * 미리 보기 응답에서 확인창이 쓰는 칸을 읽는다. `items`는 화면이 들고 있는 항목이고 한 줄 요약을 붙이는 데 쓴다
 * (화면에 없으면 서버 `label`, 그것도 없으면 「항목」). 이 항목 자신은 뺀다.
 */
export function buildEndPreview<T extends { id: string }>(
  data: Record<string, unknown>,
  itemId: string,
  items: readonly T[],
  lineOf: (item: T) => string
): EndPreviewView {
  const read = readEndPreview(data)
  const byId = new Map(items.map((item) => [item.id, item]))
  return {
    isSample: read.isSample,
    effectLines: endEffectLines(read.kind, read.impact),
    stillLive: read.pointedByLive
      .filter((entry) => entry.id !== itemId)
      .map((entry) => {
        const item = byId.get(entry.id)
        return { id: entry.id, line: item ? lineOf(item) : entry.label || UNKNOWN_END_LINE }
      }),
  }
}

export interface EndToast {
  message: string
  /** 결정 기록을 남기지 못했을 때만 따로 띄우는 경고 토스트. */
  logWarning: string | null
}

/** 지금 종료 응답(`{ resourceState, decisionLogFailed? }`)의 결과 토스트. */
export function endToast(data: Record<string, unknown>): EndToast {
  const message =
    data.resourceState === 'alreadyEnded'
      ? '이미 끝나 있어서 운영 항목만 종료로 닫았어요'
      : data.resourceState === 'missing'
        ? '자원이 이미 없어서 운영 항목만 종료로 닫았어요'
        : '지금 종료했어요'
  return { message, logWarning: data.decisionLogFailed === true ? END_DECISION_LOG_FAILED : null }
}

/** 지금 종료 응답이 되돌림까지 실패한 500인지(항목은 「종료」로 바뀌었는데 자원은 아직 게재 중이다). */
export function endItemEnded(data: Record<string, unknown>): boolean {
  return data.itemEnded === true
}

/**
 * 지금 종료 요청(미리 보기 포함)이 실패했을 때 화면을 새로 읽어야 하는지. 409는 그사이 다른 곳에서 바뀌었다는 뜻이고(`decisionFailureMessage`가 「화면을 새로
 * 불러왔어요」를 붙이므로 실제로 새로 읽어야 말이 맞다), 500에 `itemEnded`가 있으면 항목이 이미 「종료」로 바뀌어 있다. 그 밖의 500·네트워크 오류는 문장만 보인다.
 */
export function endNeedsRefresh(status: number, data: Record<string, unknown>): boolean {
  return status === 409 || (status === 500 && endItemEnded(data))
}
