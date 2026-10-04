/**
 * 운영툴 결정 기록 읽기 (티켓 20261004_1639, 상위 20260930_1503 ⑤, 운영툴 PRD §11.10). `GET /api/admin/ops-decisions`가 쓰고,
 * ⑫ 화면(S6)은 서버 컴포넌트에서 같은 함수를 직접 부른다. 1504 월간 루틴은 API로 읽는다.
 *
 * - 읽기만 한다. 결정 기록(`ops_decisions`)은 서비스 롤 전용이라 서비스 클라이언트를 인자로 받는다(테스트는 가짜를 넘긴다).
 * - **시험 묶음(`ops_bundles.is_sample`)은 목록과 집계 어디에도 넣지 않는다.** API는 이 조건을 끌 수 없고, 서버 컴포넌트가 부를 때만
 *   `includeSample`로 끈다.
 * - **관리자 ID를 응답에 싣지 않는다.** `actor` 원문은 행위자 종류(`actorType`)와 에이전트 이름으로만 바꿔 싣고 변환 함수가 곧바로 버린다.
 *   `raw`(제출 원본)·`slack_result`(슬랙 결과)는 select 목록에 넣지 않는다. 원문이 필요한 `actor`는 종류를 가르려면 읽어야 해서 select에
 *   들어가지만 응답 모양(`OpsDecisionRecord`)에는 칸이 없다.
 * - 항목(`ops_bundle_items`)과 묶음(`ops_bundles`)을 inner join한다. 항목 없는 결정(묶음 단위 행)은 목록과 집계에서 빠진다.
 * - 조회 오류는 던진다(라우트가 로그를 남기고 고정 문장 500으로 받는다).
 */
import type { createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.generated'
import { fetchAllRows, type PagedQuery } from '@/lib/db/fetchAllRows'
import { isUuid } from '@/lib/admin/uuid'
import {
  OPS_DECISION_ACTION_APPROVE,
  OPS_DECISION_ACTION_CANCEL,
  OPS_DECISION_ACTION_EDIT,
  OPS_DECISION_ACTION_END,
  OPS_DECISION_ACTION_EXECUTE,
  OPS_DECISION_ACTION_EXTERNAL_CHANGE,
  OPS_DECISION_ACTION_FAIL,
  OPS_DECISION_ACTION_REJECT,
  OPS_DECISION_ACTION_REVERT,
  OPS_DECISION_ACTION_SUBMIT,
  OPS_RECONCILE_ACTOR,
} from '@/lib/admin/opsInbox/constants'
import { OPS_PATTERN_NO_PATTERN } from '@/lib/admin/opsPatterns/constants'
import { OPS_PATTERN_NO_INVALID_MESSAGE, comparePatternNo } from '@/lib/admin/opsPatterns/read'

type ServiceClient = ReturnType<typeof createServiceClient>

export const OPS_DECISION_LOAD_FAILED_MESSAGE = '결정 기록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'
export const OPS_DECISION_PERIOD_INVALID_MESSAGE =
  '기간(since·until)은 2026-10-01처럼 날짜나 2026-10-01T09:00:00+09:00처럼 시각으로 보내 주세요.'
export const OPS_DECISION_PERIOD_ORDER_MESSAGE = '기간의 시작(since)이 끝(until)보다 늦어요.'
export const OPS_DECISION_PERIOD_TOO_LONG_MESSAGE = '한 번에 읽을 수 있는 기간은 92일까지예요. 기간을 나눠서 읽어 주세요.'
export const OPS_DECISION_ACTION_INVALID_MESSAGE = '알 수 없는 행동(action)이에요.'
export const OPS_DECISION_CURSOR_INVALID_MESSAGE = '이어 읽기 값(cursor)이 올바르지 않아요. 앞 응답의 nextCursor를 그대로 보내 주세요.'

/** 쪽당 건수. 기간에 이보다 많으면 `nextCursor`로 이어 읽는다. */
export const OPS_DECISION_PAGE_SIZE = 200
/** 기간을 안 주면 읽는 기본 길이(일). 최근 4주. */
export const OPS_DECISION_DEFAULT_DAYS = 28
/** 기간 상한(일). */
export const OPS_DECISION_MAX_DAYS = 92

const DAY_MS = 24 * 60 * 60 * 1000
const KST_OFFSET = '+09:00'

/** 결정 기록의 `action` 값(`opsInbox/constants.ts`가 정본). `action`에 CHECK가 없어서 앱이 허용 목록을 둔다. */
export const OPS_DECISION_ACTIONS: readonly string[] = [
  OPS_DECISION_ACTION_SUBMIT,
  OPS_DECISION_ACTION_APPROVE,
  OPS_DECISION_ACTION_REJECT,
  OPS_DECISION_ACTION_EDIT,
  OPS_DECISION_ACTION_REVERT,
  OPS_DECISION_ACTION_EXECUTE,
  OPS_DECISION_ACTION_FAIL,
  OPS_DECISION_ACTION_CANCEL,
  OPS_DECISION_ACTION_END,
  OPS_DECISION_ACTION_EXTERNAL_CHANGE,
]

/** 에이전트 토큰 제출의 행위자 접두사(`token:<에이전트 이름>`, `app/api/admin/ops-inbox/route.ts`가 붙인다). */
const AGENT_ACTOR_PREFIX = 'token:'
/** 시스템 행위자 접두사(`system:reconcile` 등). 정본 값은 `OPS_RECONCILE_ACTOR`이고 앞으로 `system:` 아래에 값이 더 생길 수 있다. */
const SYSTEM_ACTOR_PREFIX = OPS_RECONCILE_ACTOR.slice(0, OPS_RECONCILE_ACTOR.indexOf(':') + 1)

/** 읽는 칸 목록. `raw`·`slack_result`는 일부러 넣지 않는다. 묶음의 `bundle_id`는 제출자가 정한 값이다(결정 행의 `bundle_id`는 행 ID라 쓰지 않는다). */
export const OPS_DECISION_READ_COLUMNS =
  'id, created_at, action, actor, item_id, batch_id, diff, reason, ops_bundles!inner(bundle_id, week, is_sample), ops_bundle_items!inner(item_key, kind, pattern_no, status)'
/** 집계가 읽는 칸 목록. 항목 ID로 항목 수를 센다. */
export const OPS_DECISION_AGGREGATE_COLUMNS = 'id, action, item_id, ops_bundles!inner(is_sample), ops_bundle_items!inner(pattern_no)'

// ── 응답 모양(DB 스네이크 → 카멜). `actor` 원문 칸은 없다 ─────────────────────────────────────────

export type OpsActorType = 'admin' | 'agent' | 'system'

export interface OpsDecisionRecord {
  id: string
  createdAt: string
  action: string
  actorType: OpsActorType
  /** 에이전트(토큰 제출)일 때만 이름이다. 토큰 제출의 이름은 자기 신고 값이다. */
  agentName: string | null
  /** 제출자가 정한 묶음 식별자(`ops_bundles.bundle_id`). */
  bundleId: string | null
  week: string | null
  itemId: string | null
  itemKey: string | null
  kind: string | null
  patternNo: string | null
  itemStatus: string | null
  batchId: string | null
  /** 수정 전후 차이(JSONB 그대로). 수정·되돌림 말고는 보통 `null`이다. */
  diff: Json | null
  reason: string | null
}

interface BundleEmbed {
  bundle_id: string
  week: string | null
  is_sample?: boolean
}

interface ItemEmbed {
  item_key: string | null
  kind: string | null
  pattern_no: string | null
  status: string
}

export interface OpsDecisionRow {
  id: string
  created_at: string
  action: string
  actor: string
  item_id: string | null
  batch_id: string | null
  diff: Json | null
  reason: string | null
  ops_bundles: BundleEmbed | BundleEmbed[] | null
  ops_bundle_items: ItemEmbed | ItemEmbed[] | null
}

export interface OpsDecisionAggregateRow {
  id: string
  action: string
  item_id: string | null
  ops_bundle_items: { pattern_no: string | null } | { pattern_no: string | null }[] | null
}

export interface OpsPatternDecisionCount {
  /** 패턴이 없는 항목의 결정은 `null` 한 줄로 모은다. */
  patternNo: string | null
  /** 기간 안에 결정이 한 번이라도 있었던 항목 수. */
  items: number
  /** 행동별 결정 행 수(없는 행동은 키가 없다). 비율 계산은 쓰는 쪽이 한다. */
  actions: Record<string, number>
}

export interface OpsDecisionRange {
  since: string
  until: string
}

export interface OpsDecisionsResult {
  range: OpsDecisionRange
  decisions: OpsDecisionRecord[]
  nextCursor: string | null
  byPattern: OpsPatternDecisionCount[]
}

/** to-one 임베드는 객체로 오지만 배열로 와도 첫 칸을 쓴다. */
function embedded<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/** `actor` 원문을 행위자 종류로 바꾼다. 관리자 ID는 이름 없이 `admin`이 되어 원문이 남지 않는다. */
export function classifyActor(actor: string): { actorType: OpsActorType; agentName: string | null } {
  if (actor.startsWith(AGENT_ACTOR_PREFIX)) {
    return { actorType: 'agent', agentName: actor.slice(AGENT_ACTOR_PREFIX.length) || null }
  }
  if (actor.startsWith(SYSTEM_ACTOR_PREFIX)) return { actorType: 'system', agentName: null }
  return { actorType: 'admin', agentName: null }
}

/** 행에 다른 칸(`actor` 원문·`slack_result`·`raw` 포함)이 섞여 들어와도 응답 칸만 골라 싣는다. */
export function toDecisionRecord(row: OpsDecisionRow): OpsDecisionRecord {
  const bundle = embedded(row.ops_bundles)
  const item = embedded(row.ops_bundle_items)
  return {
    id: row.id,
    createdAt: row.created_at,
    action: row.action,
    ...classifyActor(row.actor),
    bundleId: bundle?.bundle_id ?? null,
    week: bundle?.week ?? null,
    itemId: row.item_id,
    itemKey: item?.item_key ?? null,
    kind: item?.kind ?? null,
    patternNo: item?.pattern_no ?? null,
    itemStatus: item?.status ?? null,
    batchId: row.batch_id,
    diff: row.diff,
    reason: row.reason,
  }
}

// ── 쿼리 읽기 ────────────────────────────────────────────────────────────────────────────────────

export interface OpsDecisionCursor {
  /** DB가 준 `created_at` 문자열 그대로(마이크로초가 잘리지 않게 다시 파싱하지 않는다). */
  createdAt: string
  id: string
}

export interface OpsDecisionQuery {
  /** 포함(`>=`). */
  since: Date
  /** 미포함(`<`). */
  until: Date
  patternNo: string | null
  action: string | null
  cursor: OpsDecisionCursor | null
}

export type ParsedOpsDecisionQuery = { ok: true; query: OpsDecisionQuery } | { ok: false; error: string }

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/
/** 커서의 시각. DB 문자열을 PostgREST `or` 필터에 넣으므로 쉼표·괄호가 못 들어가게 모양을 좁힌다. */
const CURSOR_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/

/** `2026-02-31`처럼 달력에 없는 날짜를 거른다(`Date.parse`는 이런 날짜를 다음 달로 넘겨 받아들인다). 앞 10글자(`YYYY-MM-DD`)만 본다. */
function isRealDate(value: string): boolean {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * 시각 읽기. 날짜만(`2026-10-01`) 주면 한국 시간 기준이다 — `since`는 그날 0시, `until`은 그날이 끝나는 시각(다음 날 0시)이라 그날까지 싣는다.
 * 시각을 주면 `Z`나 `+09:00` 같은 오프셋이 꼭 있어야 한다(없으면 실행 환경 시간대에 따라 해석이 달라진다).
 */
function parseInstant(value: string, edge: 'since' | 'until'): Date | null {
  if ((DATE_ONLY.test(value) || DATE_TIME.test(value)) && !isRealDate(value)) return null
  if (DATE_ONLY.test(value)) {
    const start = Date.parse(`${value}T00:00:00${KST_OFFSET}`)
    if (Number.isNaN(start)) return null
    return new Date(edge === 'since' ? start : start + DAY_MS)
  }
  if (!DATE_TIME.test(value)) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : new Date(time)
}

function parseCursor(value: string): OpsDecisionCursor | null {
  // 주소에 `+`를 그대로 쓰면 공백으로 읽히므로 되돌린다.
  const normalized = value.replace(/ /g, '+')
  const separator = normalized.lastIndexOf('|')
  if (separator < 0) return null
  const createdAt = normalized.slice(0, separator)
  const id = normalized.slice(separator + 1)
  if (!CURSOR_TIME.test(createdAt) || !isRealDate(createdAt) || Number.isNaN(Date.parse(createdAt)) || !isUuid(id)) return null
  return { createdAt, id }
}

/** 값이 비어 있으면 안 준 것으로 본다(`?patternNo=`). */
function given(params: URLSearchParams, key: string): string | null {
  const value = params.get(key)
  return value === null || value === '' ? null : value
}

/**
 * URL 쿼리를 읽는다. 기간을 안 주면 지금까지 최근 4주다. 기간이 거꾸로이거나 92일을 넘거나, 패턴 번호·행동·커서의 모양이 틀리면
 * 조회하지 않고 오류 문장을 돌려준다(라우트가 400으로 받는다).
 */
export function parseDecisionQuery(params: URLSearchParams, now: Date = new Date()): ParsedOpsDecisionQuery {
  const sinceRaw = given(params, 'since')
  const untilRaw = given(params, 'until')
  const untilParsed = untilRaw === null ? now : parseInstant(untilRaw, 'until')
  if (untilParsed === null) return { ok: false, error: OPS_DECISION_PERIOD_INVALID_MESSAGE }
  const sinceParsed = sinceRaw === null ? new Date(untilParsed.getTime() - OPS_DECISION_DEFAULT_DAYS * DAY_MS) : parseInstant(sinceRaw, 'since')
  if (sinceParsed === null) return { ok: false, error: OPS_DECISION_PERIOD_INVALID_MESSAGE }
  if (sinceParsed.getTime() > untilParsed.getTime()) return { ok: false, error: OPS_DECISION_PERIOD_ORDER_MESSAGE }
  if (untilParsed.getTime() - sinceParsed.getTime() > OPS_DECISION_MAX_DAYS * DAY_MS) {
    return { ok: false, error: OPS_DECISION_PERIOD_TOO_LONG_MESSAGE }
  }

  const patternNo = given(params, 'patternNo')
  if (patternNo !== null && !OPS_PATTERN_NO_PATTERN.test(patternNo)) return { ok: false, error: OPS_PATTERN_NO_INVALID_MESSAGE }

  const action = given(params, 'action')
  if (action !== null && !OPS_DECISION_ACTIONS.includes(action)) return { ok: false, error: OPS_DECISION_ACTION_INVALID_MESSAGE }

  const cursorRaw = given(params, 'cursor')
  const cursor = cursorRaw === null ? null : parseCursor(cursorRaw)
  if (cursorRaw !== null && cursor === null) return { ok: false, error: OPS_DECISION_CURSOR_INVALID_MESSAGE }

  return { ok: true, query: { since: sinceParsed, until: untilParsed, patternNo, action, cursor } }
}

// ── 집계 ────────────────────────────────────────────────────────────────────────────────────────

/**
 * 결정 행을 패턴별로 센다(순수 함수). 항목 없는 행(묶음 단위)은 세지 않는다. 패턴이 없는 항목은 `patternNo: null` 한 줄이고 맨 끝이다.
 * 나머지는 패턴 번호의 숫자 순서다.
 */
export function aggregateByPattern(rows: readonly OpsDecisionAggregateRow[]): OpsPatternDecisionCount[] {
  const groups = new Map<string | null, { items: Set<string>; actions: Record<string, number> }>()
  for (const row of rows) {
    if (row.item_id === null) continue
    const patternNo = embedded(row.ops_bundle_items)?.pattern_no ?? null
    let group = groups.get(patternNo)
    if (!group) {
      group = { items: new Set(), actions: {} }
      groups.set(patternNo, group)
    }
    group.items.add(row.item_id)
    group.actions[row.action] = (group.actions[row.action] ?? 0) + 1
  }
  return [...groups.entries()]
    .map(([patternNo, group]) => ({ patternNo, items: group.items.size, actions: group.actions }))
    .sort((a, b) => {
      if (a.patternNo === null || b.patternNo === null) return Number(a.patternNo === null) - Number(b.patternNo === null)
      return comparePatternNo(a.patternNo, b.patternNo)
    })
}

// ── 읽기 ────────────────────────────────────────────────────────────────────────────────────────

/** 서비스 클라이언트의 select 빌더 중 이 파일이 쓰는 메서드만 좁힌 모양(임베드·점 경로 필터는 생성 타입이 따라오지 못한다). */
interface LooseQuery extends PromiseLike<{ data: unknown; error: { message: string } | null }> {
  select(columns: string): LooseQuery
  eq(column: string, value: unknown): LooseQuery
  gte(column: string, value: string): LooseQuery
  lt(column: string, value: string): LooseQuery
  or(filter: string): LooseQuery
  order(column: string, options?: { ascending?: boolean }): LooseQuery
  range(from: number, to: number): LooseQuery
}

function decisionsTable(service: ServiceClient): LooseQuery {
  return (service as unknown as { from(table: string): LooseQuery }).from('ops_decisions')
}

export interface ListOpsDecisionsOptions {
  /**
   * 시험 묶음의 기록까지 읽는다. **서버 컴포넌트(⑫ 화면)만 쓴다.** 라우트는 이 값을 넘기지 않고 요청에서 받지도 않는다.
   */
  includeSample?: boolean
}

/** 기간 조건과 시험 묶음 제외 조건. 목록과 집계가 같은 조건을 쓴다. */
function withPeriod(query: LooseQuery, since: Date, until: Date, includeSample: boolean): LooseQuery {
  const bounded = query.gte('created_at', since.toISOString()).lt('created_at', until.toISOString())
  return includeSample ? bounded : bounded.eq('ops_bundles.is_sample', false)
}

/** 기간 전체를 읽어 패턴별로 센다. 쪽·커서·패턴·행동 조건과 무관하게 같은 기간의 전체다. */
async function loadByPattern(service: ServiceClient, since: Date, until: Date, includeSample: boolean): Promise<OpsPatternDecisionCount[]> {
  const rows = await fetchAllRows<OpsDecisionAggregateRow>(
    '결정 기록 집계',
    'id',
    () => withPeriod(decisionsTable(service).select(OPS_DECISION_AGGREGATE_COLUMNS), since, until, includeSample) as unknown as PagedQuery<OpsDecisionAggregateRow>
  )
  return aggregateByPattern(rows)
}

/**
 * 결정 기록 한 쪽(최신순, 쪽당 200건)과 같은 기간의 패턴별 집계. 정렬은 `created_at desc, id desc`이고 커서는 `<createdAt>|<id>`다.
 * 한 건 더 읽어 다음 쪽이 있는지 알아낸다.
 */
export async function listOpsDecisions(
  service: ServiceClient,
  query: OpsDecisionQuery,
  { includeSample = false }: ListOpsDecisionsOptions = {}
): Promise<OpsDecisionsResult> {
  let list = withPeriod(decisionsTable(service).select(OPS_DECISION_READ_COLUMNS), query.since, query.until, includeSample)
  if (query.patternNo !== null) list = list.eq('ops_bundle_items.pattern_no', query.patternNo)
  if (query.action !== null) list = list.eq('action', query.action)
  if (query.cursor !== null) {
    const { createdAt, id } = query.cursor
    list = list.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`)
  }
  const { data, error } = await list
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(0, OPS_DECISION_PAGE_SIZE)
  if (error) throw new Error(`결정 기록 조회 실패: ${error.message}`)

  const rows = (data ?? []) as OpsDecisionRow[]
  const page = rows.slice(0, OPS_DECISION_PAGE_SIZE)
  const last = page[page.length - 1]
  const nextCursor = rows.length > OPS_DECISION_PAGE_SIZE && last ? `${last.created_at}|${last.id}` : null

  const byPattern = await loadByPattern(service, query.since, query.until, includeSample)
  return {
    range: { since: query.since.toISOString(), until: query.until.toISOString() },
    decisions: page.map(toDecisionRecord),
    nextCursor,
    byPattern,
  }
}
