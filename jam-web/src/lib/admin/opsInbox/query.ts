/**
 * 받은 기획함 읽기 조회 (티켓 20260930_1817) — 서버 전용(`createServiceClient`가 `next/headers`를 문다).
 *
 * **읽기만 한다.** `select`만 부르고 `insert`·`update`·`upsert`·`delete`는 부르지 않는다. 화면을 열거나 새로 고치는 것만으로
 * 상태가 바뀌지 않는다는 완료 조건이다(`__tests__/query.test.ts`가 지킨다). 「도착 → 검토중」 전환은 화면이 따로 요청하는
 * `POST /api/admin/ops-inbox/[bundleId]/open`이 한다.
 *
 * 묶음 상태는 저장하지 않고 항목 상태에서 계산하므로(`bundleStatus.ts`) 목록은 서버에서 계산한 뒤 거르고 정렬하고
 * 50건씩 자른다. 묶음 목록에는 제출 원본(`raw`, 최대 1MB)을 가져오지 않는다.
 *
 * 기획 상세에는 밸런스 평가 결과(`balance`)가 함께 온다(티켓 20260930_1459). 규칙(`ops_rules`)과 서비스 상태를 읽어 계산하고
 * 어느 쪽이 실패해도 던지지 않는다 — 실패는 `balance.status = 'failed'`로 화면에 넘어가고 기획 상세는 그대로 열린다.
 *
 * 기획 상세에는 예약 등록 요약(`execution`)도 함께 온다(티켓 20261002_1648, 운영툴 PRD §8.2). 항목 원본 행으로 사전 점검(`precheckBundle`)을 돌려
 * [N건 승인하고 예약]의 N 가운데 승인돼 예약을 기다리는 항목 수를 센다. 레지스트리·카드 핸들러가 클라이언트 번들로 끌려가지 않도록 화면은 이 계산을
 * 하지 않고 결과만 받는다. 이 계산도 던지지 않는다.
 *
 * ⚠️ **PostgREST 기본 페이지 상한(1000행)** — 에러 없이 잘린 목록이 돌아오므로 `range`로 끝까지 넘겨 전량을 받는다
 * (`badge-families-query.ts`의 `fetchActivityFamilyBadges`와 같은 방식이다).
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.generated'
import { ADMIN_LIST_PAGE_SIZE, pageRange, totalPagesOf } from '@/lib/admin/list-params'
import { throwOnQueryError } from '@/lib/admin/queryError'
import { isUuid } from '@/lib/admin/uuid'
import {
  OPS_INBOX_TABS,
  computeBundleStatus,
  tabOfBundleStage,
  type OpsBundleStage,
  type OpsInboxTab,
} from '@/lib/admin/opsInbox/bundleStatus'
import {
  MAX_RATIONALES_PER_ITEM,
  OPS_RATIONALE_KINDS,
  OPS_ROUTINE_STAGES,
  type OpsRationaleKind,
  type OpsRoutineStage,
} from '@/lib/admin/opsInbox/constants'
import { OPS_RULE_COLUMNS, parseBalanceRules, type BalanceRules } from '@/lib/admin/opsInbox/balance/rules'
import {
  collectBalanceReferences,
  countOpenCollectionsAt,
  evaluateBundleBalance,
  type BalanceItemInput,
} from '@/lib/admin/opsInbox/balance/evaluate'
import { loadBalanceState } from '@/lib/admin/opsInbox/balance/state'
import type { OpsBundleBalance } from '@/lib/admin/opsInbox/balance/view'
import type { ExecuteHandlerRegistry, ExecuteItem } from '@/lib/admin/opsInbox/execute/handlers'
import { precheckBundle } from '@/lib/admin/opsInbox/execute/precheck'
import { EXECUTE_HANDLERS } from '@/lib/admin/opsInbox/execute/registry'
import { readOpsPreviewNames, type OpsPreviewNames } from '@/lib/admin/opsInbox/previewNames'

const FETCH_PAGE_SIZE = 1000
const ERROR_LABEL = 'ops-inbox'

// ── 목록 조건 ────────────────────────────────────────────────────────────────────────────────────

export const OPS_INBOX_SORT_KEYS = ['received_at', 'week', 'items'] as const
export type OpsInboxSortKey = (typeof OPS_INBOX_SORT_KEYS)[number]

export interface OpsInboxParams {
  tab: OpsInboxTab
  sortKey: OpsInboxSortKey
  sortDesc: boolean
  page: number
}

const DEFAULT_SORT: Pick<OpsInboxParams, 'sortKey' | 'sortDesc'> = { sortKey: 'received_at', sortDesc: true }

/**
 * `sort` 값을 읽는다. 표 머리 칸 클릭이 쓰는 공용 훅은 `received_at_desc`·`week_asc` 모양으로 쓰고(`list-params.ts`),
 * 설계의 `-received_at`(앞에 `-`이 내림차순)도 받는다. 목록에 없는 값은 기본(받은 시각 최신순)이다.
 */
function parseSort(raw: string | undefined): Pick<OpsInboxParams, 'sortKey' | 'sortDesc'> {
  if (!raw) return DEFAULT_SORT
  const suffix = /^(.+)_(asc|desc)$/.exec(raw)
  const prefixed = raw.startsWith('-') ? raw.slice(1) : null
  const key = suffix ? suffix[1] : (prefixed ?? raw)
  if (!(OPS_INBOX_SORT_KEYS as readonly string[]).includes(key)) return DEFAULT_SORT
  const desc = suffix ? suffix[2] === 'desc' : prefixed !== null
  return { sortKey: key as OpsInboxSortKey, sortDesc: desc }
}

/** URL 쿼리를 목록 조건으로 바꾼다. 모르는 값은 기본값(`tab=all`, 받은 시각 최신순, 1쪽)이다. */
export function parseOpsInboxParams(raw: Record<string, string | undefined>): OpsInboxParams {
  const tab = (OPS_INBOX_TABS as readonly string[]).includes(raw.tab ?? '') ? (raw.tab as OpsInboxTab) : 'all'
  const page = Math.max(1, parseInt(raw.page ?? '1', 10) || 1)
  return { tab, ...parseSort(raw.sort), page }
}

// ── 목록 ─────────────────────────────────────────────────────────────────────────────────────────

export interface OpsBundleListRow {
  /** DB 행 ID(`ops_bundles.id`). 상세 경로에 쓴다. 제출자가 정한 `bundle_id`가 아니다. */
  id: string
  week: string | null
  hypothesis: string | null
  author: string
  isSample: boolean
  formatErrorCount: number
  receivedAt: string
  itemCount: number
  stage: OpsBundleStage
  partialFailure: boolean
  /** 도착·검토중이 아닌 항목 수(「결정 3/12」). */
  decidedCount: number
}

export interface OpsBundleListResult {
  /** 지금 쪽에 보일 묶음. */
  rows: OpsBundleListRow[]
  /** 실제로 적용한 쪽(요청한 쪽이 마지막 쪽을 넘으면 마지막 쪽으로 맞춘다). */
  page: number
  totalPages: number
  /** 지금 탭에 맞는 묶음 수(쪽 나누기 전). */
  total: number
  /** 탭별 묶음 수. 탭 제목의 숫자다. */
  counts: Record<OpsInboxTab, number>
}

interface BundleListSource {
  id: string
  week: string | null
  hypothesis: string | null
  author: string
  is_sample: boolean
  format_errors: Json
  received_at: string
}

interface ItemStatusSource {
  bundle_id: string
  status: string
}

/** jsonb 배열 칸에서 문자열만 뽑는다(모양이 틀려도 화면이 죽지 않게 한다). */
function stringList(value: Json | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function compareNullableLast<T>(a: T | null, b: T | null, compare: (x: T, y: T) => number, desc: boolean): number {
  if (a === null && b === null) return 0
  if (a === null) return 1 // 값이 없는 묶음은 방향과 무관하게 맨 끝이다
  if (b === null) return -1
  return desc ? compare(b, a) : compare(a, b)
}

function receivedTime(row: OpsBundleListRow): number {
  const time = Date.parse(row.receivedAt)
  return Number.isNaN(time) ? 0 : time
}

function sortRows(rows: OpsBundleListRow[], sortKey: OpsInboxSortKey, desc: boolean): OpsBundleListRow[] {
  const byKey = (a: OpsBundleListRow, b: OpsBundleListRow): number => {
    if (sortKey === 'items') return desc ? b.itemCount - a.itemCount : a.itemCount - b.itemCount
    if (sortKey === 'week') return compareNullableLast(a.week, b.week, (x, y) => (x < y ? -1 : x > y ? 1 : 0), desc)
    return desc ? receivedTime(b) - receivedTime(a) : receivedTime(a) - receivedTime(b)
  }
  return [...rows].sort((a, b) => {
    const primary = byKey(a, b)
    if (primary !== 0) return primary
    // 같은 값이면 받은 시각 최신순, 그래도 같으면 ID로 순서를 고정한다(쪽을 넘겨도 순서가 흔들리지 않게)
    const time = receivedTime(b) - receivedTime(a)
    if (time !== 0) return time
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/**
 * 묶음·항목 상태 원본에서 목록을 만든다(순수 함수). 묶음마다 항목 상태로 단계를 계산하고, 탭별 개수를 센 뒤,
 * 지금 탭으로 거르고 정렬하고 50건씩 자른다.
 */
export function buildOpsBundleList(
  bundles: readonly BundleListSource[],
  itemStatuses: readonly ItemStatusSource[],
  params: OpsInboxParams
): OpsBundleListResult {
  const statusesByBundle = new Map<string, string[]>()
  for (const item of itemStatuses) {
    const list = statusesByBundle.get(item.bundle_id)
    if (list) list.push(item.status)
    else statusesByBundle.set(item.bundle_id, [item.status])
  }

  const all: OpsBundleListRow[] = bundles.map((bundle) => {
    const statuses = statusesByBundle.get(bundle.id) ?? []
    const status = computeBundleStatus(statuses)
    return {
      id: bundle.id,
      week: bundle.week,
      hypothesis: bundle.hypothesis,
      author: bundle.author,
      isSample: bundle.is_sample,
      formatErrorCount: stringList(bundle.format_errors).length,
      receivedAt: bundle.received_at,
      itemCount: statuses.length,
      stage: status.stage,
      partialFailure: status.partialFailure,
      decidedCount: status.decidedCount,
    }
  })

  const counts: Record<OpsInboxTab, number> = { all: all.length, decide: 0, progress: 0, closed: 0 }
  for (const row of all) counts[tabOfBundleStage(row.stage)] += 1

  const matched = params.tab === 'all' ? all : all.filter((row) => tabOfBundleStage(row.stage) === params.tab)
  const sorted = sortRows(matched, params.sortKey, params.sortDesc)

  const totalPages = totalPagesOf(sorted.length, ADMIN_LIST_PAGE_SIZE)
  const page = Math.min(params.page, totalPages)
  const [from, to] = pageRange(page, ADMIN_LIST_PAGE_SIZE)

  return { rows: sorted.slice(from, to + 1), page, totalPages, total: sorted.length, counts }
}

const BUNDLE_LIST_COLUMNS = 'id, week, hypothesis, author, is_sample, format_errors, received_at'

/** 받은 기획함 목록. 묶음 전체와 항목 상태를 끝까지 받아 계산한다(조회 오류는 던져 `error.tsx`가 받는다). */
export async function listOpsBundles(params: OpsInboxParams): Promise<OpsBundleListResult> {
  const supabase = createServiceClient()

  const bundles: BundleListSource[] = []
  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('ops_bundles')
      .select(BUNDLE_LIST_COLUMNS)
      .order('received_at', { ascending: false })
      .order('id')
      .range(from, from + FETCH_PAGE_SIZE - 1)
    throwOnQueryError(error, ERROR_LABEL)
    const page = data ?? []
    bundles.push(...page)
    if (page.length < FETCH_PAGE_SIZE) break
  }

  const itemStatuses: ItemStatusSource[] = []
  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('ops_bundle_items')
      .select('bundle_id, status')
      .order('id')
      .range(from, from + FETCH_PAGE_SIZE - 1)
    throwOnQueryError(error, ERROR_LABEL)
    const page = data ?? []
    itemStatuses.push(...page)
    if (page.length < FETCH_PAGE_SIZE) break
  }

  return buildOpsBundleList(bundles, itemStatuses, params)
}

// ── 상세 ─────────────────────────────────────────────────────────────────────────────────────────

export interface OpsBundleHeader {
  id: string
  /** 제출자가 정한 묶음 식별자. 자기 신고라 제목으로 쓰지 않는다. */
  bundleId: string
  week: string | null
  hypothesis: string | null
  /** 기획 제목(티켓 20261026_2021). 제출에 없었거나 형식이 틀려 저장하지 않았으면 null이다. */
  title: string | null
  /** 읽은 트렌드. 제출에 없었거나 형식이 틀려 저장하지 않았으면 null이다. 모양은 `OpsTrend`다. */
  trends: Json | null
  /** 에이전트 단계 기록(`routine_run.stages`에서 꺼낸 것). 없거나 모양이 틀린 원소는 빠진다. */
  stages: OpsRoutineStageRecord[]
  author: string
  isSample: boolean
  formatErrors: string[]
  receivedAt: string
}

/** `routine_run.stages[]` 한 원소(어드민 상황판 PRD §5.3). 검사를 통과한 값만 담고 나머지 칸은 null이다. */
export interface OpsRoutineStageRecord {
  agent: string
  stage: OpsRoutineStage
  startedAt: string | null
  endedAt: string | null
  inCount: number | null
  outCount: number | null
  excludedCount: number | null
}

/** 항목 하나의 기획 이유 한 개(어드민 상황판 PRD §5.2). */
export interface OpsItemRationale {
  kind: OpsRationaleKind
  label: string
  note: string | null
  sourceId: string | number | null
}

function countOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

function timeOrNull(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null
}

/**
 * 묶음의 `routine_run`에서 단계 기록을 꺼낸다(순수 함수). 객체가 아니거나 `stages`가 배열이 아니면 빈 배열이다.
 * 원소는 `agent`(비어 있지 않은 문자열)와 `stage`(허용값)가 맞는 것만 남기고, 나머지 칸은 맞을 때만 값을 싣고 아니면 null이다.
 */
export function readOpsRoutineStages(routineRun: Json | null | undefined): OpsRoutineStageRecord[] {
  if (!routineRun || typeof routineRun !== 'object' || Array.isArray(routineRun)) return []
  const stages = (routineRun as { [key: string]: Json | undefined }).stages
  if (!Array.isArray(stages)) return []
  const records: OpsRoutineStageRecord[] = []
  for (const entry of stages) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const { agent, stage, started_at, ended_at, in_count, out_count, excluded_count } = entry as { [key: string]: Json | undefined }
    if (typeof agent !== 'string' || agent.trim() === '') continue
    if (typeof stage !== 'string' || !(OPS_ROUTINE_STAGES as readonly string[]).includes(stage)) continue
    records.push({
      agent,
      stage: stage as OpsRoutineStage,
      startedAt: timeOrNull(started_at),
      endedAt: timeOrNull(ended_at),
      inCount: countOrNull(in_count),
      outCount: countOrNull(out_count),
      excludedCount: countOrNull(excluded_count),
    })
  }
  return records
}

/**
 * 항목 원본(`original`, 수정본이 있으면 수정본)에서 기획 이유 목록을 꺼낸다(순수 함수). 배열이 아니면 빈 배열이고,
 * `kind`가 허용값이 아니거나 `label`이 비어 있는 원소는 빠진다. 최대 3개까지만 돌려준다.
 */
export function readOpsItemRationales(source: Json | null | undefined): OpsItemRationale[] {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return []
  const list = (source as { [key: string]: Json | undefined }).rationale
  if (!Array.isArray(list)) return []
  const rationales: OpsItemRationale[] = []
  for (const entry of list) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const { kind, label, note, source_id } = entry as { [key: string]: Json | undefined }
    if (typeof kind !== 'string' || !(OPS_RATIONALE_KINDS as readonly string[]).includes(kind)) continue
    if (typeof label !== 'string' || label.trim() === '') continue
    rationales.push({
      kind: kind as OpsRationaleKind,
      label,
      note: typeof note === 'string' ? note : null,
      sourceId: typeof source_id === 'string' || typeof source_id === 'number' ? source_id : null,
    })
    if (rationales.length >= MAX_RATIONALES_PER_ITEM) break
  }
  return rationales
}

/** 항목 원본(수정본이 있으면 수정본)의 `highlight`(핵심 항목 표시). `true`일 때만 참이다. */
export function readOpsItemHighlight(source: Json | null | undefined): boolean {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return false
  return (source as { [key: string]: Json | undefined }).highlight === true
}

export interface OpsItemRecord {
  id: string
  position: number
  /** 제출자가 정한 값. 묶음 안에서 겹칠 수 있어 선택·연결의 기준으로 쓰지 않는다. */
  itemKey: string | null
  kind: string | null
  patternNo: string | null
  startsAt: string | null
  endsAt: string | null
  status: string
  /** 제출 항목 원본(바뀌지 않는다). */
  original: Json
  /** 직접 수정본(1818이 채운다). */
  edited: Json | null
  formatErrors: string[]
  updatedAt: string
}

export interface OpsDecisionRecord {
  id: string
  itemId: string | null
  action: string
  actor: string
  batchId: string | null
  diff: Json | null
  reason: string | null
  slackResult: Json | null
  createdAt: string
}

/** 예약 등록 요약(티켓 20261002_1648). 기획 상세를 읽을 때마다 그 순간의 항목과 지금 연결된 핸들러로 센다. 저장하지 않는다. */
export interface OpsBundleExecution {
  /** 「승인됨」 항목 수. 화면이 버튼을 끄지 않을지 가르는 데 쓴다. */
  approvedCount: number
  /** 사전 점검의 「예약할 항목」 수. [N건 승인하고 예약]의 N에 더해지는 몫이다. */
  readyCount: number
}

export interface OpsBundleDetail {
  bundle: OpsBundleHeader
  /** `position` 순. */
  items: OpsItemRecord[]
  /** 최신순. */
  decisions: OpsDecisionRecord[]
  /**
   * 밸런스 평가 결과(티켓 20260930_1459, 운영툴 PRD §5.2). 기획 상세를 읽을 때마다 그 순간의 규칙 값과 서비스 상태로 계산하고
   * 저장하지 않는다. 평가가 실패하면 `status: 'failed'`이고 상세는 그대로 열린다.
   */
  balance: OpsBundleBalance
  /** 예약 등록 요약(티켓 20261002_1648). */
  execution: OpsBundleExecution
  /** 레시피·드랍 미리보기가 쓰는 배지·지점·컬렉션 이름(티켓 20261007_1401). 읽지 못하면 빈 맵이다. */
  previewNames: OpsPreviewNames
}

const BUNDLE_DETAIL_COLUMNS =
  'id, bundle_id, week, hypothesis, title, trends, routine_run, author, is_sample, format_errors, received_at'
// `created_resource`는 사전 점검(연결 대상이 만든 자원 확인)만 읽는다. 화면 항목(`OpsItemRecord`)에는 싣지 않는다.
const ITEM_DETAIL_COLUMNS =
  'id, position, item_key, kind, pattern_no, starts_at, ends_at, status, original, edited, created_resource, format_errors, updated_at'
const DECISION_COLUMNS = 'id, item_id, action, actor, batch_id, diff, reason, slack_result, created_at'

// ── 밸런스 평가 (티켓 20260930_1459) ─────────────────────────────────────────────────────────────

/** 밸런스 규칙을 읽는다. 조회 오류나 빈 규칙 테이블은 평가 실패다(던진다). */
async function readBalanceRules(supabase: ReturnType<typeof createServiceClient>): Promise<BalanceRules> {
  const { data, error } = await supabase
    .from('ops_rules')
    .select(OPS_RULE_COLUMNS)
    .eq('rule_group', 'balance')
  if (error) throw new Error(`규칙 조회 실패: ${error.message}`)
  const rules = parseBalanceRules(data ?? [])
  if (rules === null) throw new Error('밸런스 규칙 행이 없어요')
  return rules
}

/** 항목마다 가장 최근 승인 결정의 시각. 결정 기록은 최신순이라 처음 만난 승인이 가장 최근이다. */
function latestApprovalTimes(decisions: readonly OpsDecisionRecord[]): Map<string, string> {
  const times = new Map<string, string>()
  for (const decision of decisions) {
    if (decision.action === 'approve' && decision.itemId !== null && !times.has(decision.itemId)) {
      times.set(decision.itemId, decision.createdAt)
    }
  }
  return times
}

/**
 * 묶음의 밸런스를 평가한다. **던지지 않는다** — 규칙이나 서비스 상태를 읽지 못하는 등 어떤 실패도 `status: 'failed'`로 돌려주어
 * 기획 상세가 그대로 열리고 승인·반려가 막히지 않는다. 읽기만 한다(`select`).
 */
export async function evaluateOpsBundleBalance(
  supabase: ReturnType<typeof createServiceClient>,
  bundleDbId: string,
  // `createdResource`는 화면 항목(`OpsItemRecord`)에 싣지 않는 칸이라 평가 호출부가 따로 붙인다(R7이 이미 만든 배지를 두 번 세지 않는 데 쓴다).
  items: readonly (OpsItemRecord & { createdResource?: Json | null })[],
  decisions: readonly OpsDecisionRecord[],
  nowIso: string = new Date().toISOString()
): Promise<OpsBundleBalance> {
  try {
    const rules = await readBalanceRules(supabase)
    const approvedAt = latestApprovalTimes(decisions)
    const inputs: BalanceItemInput[] = items.map((item) => ({
      id: item.id,
      position: item.position,
      itemKey: item.itemKey,
      kind: item.kind,
      status: item.status,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      original: item.original,
      edited: item.edited,
      approvedAt: approvedAt.get(item.id) ?? null,
      createdResource: item.createdResource ?? null,
    }))
    const state = await loadBalanceState(supabase, {
      currentBundleId: bundleDbId,
      references: collectBalanceReferences(inputs),
    })
    const evaluation = evaluateBundleBalance(inputs, rules, state, nowIso)
    return {
      status: 'ok',
      ...evaluation,
      openCollectionsNow: state.books.ok ? countOpenCollectionsAt(state.books.data, nowIso) : null,
    }
  } catch (error) {
    console.error(`[admin/${ERROR_LABEL}] 밸런스 평가 실패:`, error)
    return { status: 'failed' }
  }
}

// ── 예약 등록 요약 (티켓 20261002_1648) ──────────────────────────────────────────────────────────

/**
 * 묶음의 예약 등록 요약을 만든다. `items`는 한 묶음의 항목 전부다(결정 전·멈춘 항목 포함: 그룹 판정에 필요하다).
 * 사전 점검이 던져도 기획 상세가 열리도록 던지지 않고, 그때는 예약할 항목 0개로 둔다(요약창은 열 때 사전 점검을 새로 보낸다).
 */
export function buildOpsExecution(
  items: readonly ExecuteItem[],
  now: Date,
  handlers: ExecuteHandlerRegistry = EXECUTE_HANDLERS
): OpsBundleExecution {
  const approvedCount = items.filter((item) => item.status === 'approved').length
  try {
    return { approvedCount, readyCount: precheckBundle(items, { now, handlers }).ready.length }
  } catch (error) {
    console.error(`[admin/${ERROR_LABEL}] 예약 등록 요약 실패:`, error)
    return { approvedCount, readyCount: 0 }
  }
}

/** 기획 상세. UUID가 아니거나 없는 묶음이면 null이다(조회 오류는 던진다). 밸런스 평가 실패는 던지지 않고 `balance`에 담는다. */
export async function getOpsBundleDetail(id: string): Promise<OpsBundleDetail | null> {
  if (!isUuid(id)) return null
  const supabase = createServiceClient()

  const bundleResult = await supabase.from('ops_bundles').select(BUNDLE_DETAIL_COLUMNS).eq('id', id).maybeSingle()
  throwOnQueryError(bundleResult.error, ERROR_LABEL)
  const bundle = bundleResult.data
  if (!bundle) return null

  const [itemsResult, decisionsResult] = await Promise.all([
    supabase.from('ops_bundle_items').select(ITEM_DETAIL_COLUMNS).eq('bundle_id', id).order('position'),
    supabase.from('ops_decisions').select(DECISION_COLUMNS).eq('bundle_id', id).order('created_at', { ascending: false }),
  ])
  throwOnQueryError(itemsResult.error, ERROR_LABEL)
  throwOnQueryError(decisionsResult.error, ERROR_LABEL)

  const itemRows = itemsResult.data ?? []
  const items: OpsItemRecord[] = itemRows.map((item) => ({
    id: item.id,
    position: item.position,
    itemKey: item.item_key,
    kind: item.kind,
    patternNo: item.pattern_no,
    startsAt: item.starts_at,
    endsAt: item.ends_at,
    status: item.status,
    original: item.original,
    edited: item.edited,
    formatErrors: stringList(item.format_errors),
    updatedAt: item.updated_at,
  }))
  const decisions: OpsDecisionRecord[] = (decisionsResult.data ?? []).map((decision) => ({
    id: decision.id,
    itemId: decision.item_id,
    action: decision.action,
    actor: decision.actor,
    batchId: decision.batch_id,
    diff: decision.diff,
    reason: decision.reason,
    slackResult: decision.slack_result,
    createdAt: decision.created_at,
  }))

  return {
    bundle: {
      id: bundle.id,
      bundleId: bundle.bundle_id,
      week: bundle.week,
      hypothesis: bundle.hypothesis,
      title: bundle.title,
      trends: bundle.trends,
      stages: readOpsRoutineStages(bundle.routine_run),
      author: bundle.author,
      isSample: bundle.is_sample,
      formatErrors: stringList(bundle.format_errors),
      receivedAt: bundle.received_at,
    },
    items,
    decisions,
    balance: await evaluateOpsBundleBalance(
      supabase,
      bundle.id,
      items.map((item, index) => ({ ...item, createdResource: itemRows[index].created_resource })),
      decisions
    ),
    execution: buildOpsExecution(
      itemRows.map((row) => ({ ...row, bundle_id: bundle.id })),
      new Date()
    ),
    previewNames: await readOpsPreviewNames(supabase, items),
  }
}
