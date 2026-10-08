/**
 * 취향 신호 확정·공통 규칙 고치기와 근거 후보(반려 기록) 읽기 (티켓 20261008_1712, 상위 20260930_1503 ⑩b-1, 운영툴 PRD §11.6).
 * `PATCH /api/admin/ops-patterns/taste-signals/[signalId]`, `PATCH /api/admin/ops-patterns/common-rules/[ruleNo]`,
 * `GET /api/admin/ops-patterns/[patternNo]/rejections`가 쓴다.
 *
 * - 쓰기는 `write.ts`와 같은 방식이다 — 조건부 update(화면이 본 `updated_at`과 같을 때만), 0행이면 다시 읽어 404/409, 내용이 같으면 `changed: false`.
 *   관리자 ID(`confirmed_by`·`updated_by`)는 쓰기만 하고 응답에는 싣지 않는다(`read.ts`가 읽지도 않는다).
 * - 취향 신호는 저장하면 항상 확정이다. **처음 확정할 때만** `confirmed_at`·`confirmed_by`를 정하고, 이미 확정한 신호를 고쳐도 바꾸지 않는다
 *   (「확정 · 날짜」는 처음 확정한 날). 추정으로 되돌리는 경로는 없다.
 * - 근거는 이 신호 패턴의 **시험이 아닌 반려 기록**만 붙는다. 공통 신호(`pattern_no = null`)는 근거 없이만 확정한다.
 *   근거 결정이 나중에 지워지면 FK(`ON DELETE SET NULL`)가 비워 「근거 없이 확정」으로 남는다.
 * - 근거 후보 읽기는 기간 제한이 없다(결정 기록 API의 92일 제한과 별개). `actor` 원문·`diff`·`slack_result`는 읽지도 싣지도 않는다.
 * - 입력 검사는 서버 의존이 없는 `input.ts`에 있다(⑩b-2 화면이 같은 검사를 쓴다).
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { OPS_DECISION_ACTION_REJECT } from '@/lib/admin/opsInbox/constants'
import { classifyActor, type OpsActorType } from '@/lib/admin/opsDecisions/line'
import { describeBundleItem } from '@/lib/admin/opsSignals/composition'
import type { Json } from '@/types/database.generated'
import { OPS_PATTERN_NO_PATTERN, OPS_REJECTION_PAGE_SIZE } from './constants'
import {
  TASTE_EVIDENCE_INVALID_MESSAGE,
  isUuid,
  validateCommonRuleInput,
  validateTasteSignalInput,
  type OpsPatternFieldErrors,
} from './input'
import {
  OPS_COMMON_RULE_COLUMNS,
  OPS_TASTE_SIGNAL_COLUMNS,
  toCommonRuleRecord,
  toTasteSignalRecord,
  type OpsCommonRuleRecord,
  type OpsTasteSignalRecord,
} from './read'

type ServiceClient = ReturnType<typeof createServiceClient>

const LOG = '[admin/ops-patterns]'

export const TASTE_SAVE_FAILED_MESSAGE = '취향 신호를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
export const TASTE_NOT_FOUND_MESSAGE = '찾을 수 없는 취향 신호예요.'
export const TASTE_UPDATE_CONFLICT_MESSAGE = '그사이 다른 곳에서 이 취향 신호를 고쳤어요. 최신 값을 불러와 주세요.'
export const TASTE_EXPECTED_UPDATED_AT_MESSAGE = '취향 신호의 수정 시각이 필요해요. 화면을 새로 고쳐 주세요.'
export const COMMON_RULE_SAVE_FAILED_MESSAGE = '공통 규칙을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
export const COMMON_RULE_NOT_FOUND_MESSAGE = '찾을 수 없는 공통 규칙이에요.'
export const COMMON_RULE_UPDATE_CONFLICT_MESSAGE = '그사이 다른 곳에서 이 공통 규칙을 고쳤어요. 최신 값을 불러와 주세요.'
export const COMMON_RULE_EXPECTED_UPDATED_AT_MESSAGE = '공통 규칙의 수정 시각이 필요해요. 화면을 새로 고쳐 주세요.'
export const TASTE_FIELDS_INVALID_MESSAGE = '입력한 내용을 확인해 주세요.'
export const REJECTIONS_LOAD_FAILED_MESSAGE = '반려 기록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'
export const REJECTION_OFFSET_INVALID_MESSAGE = '건너뛸 개수는 0 이상의 정수여야 해요.'

type WriteFailure = { ok: false; status: 400 | 404 | 409 | 500; error: string; fieldErrors?: OpsPatternFieldErrors }

export type OpsTasteSignalWriteOutcome = { ok: true; signal: OpsTasteSignalRecord; changed: boolean } | WriteFailure
export type OpsCommonRuleWriteOutcome = { ok: true; rule: OpsCommonRuleRecord; changed: boolean } | WriteFailure

function fail(status: WriteFailure['status'], error: string, fieldErrors?: OpsPatternFieldErrors): WriteFailure {
  return { ok: false, status, error, ...(fieldErrors ? { fieldErrors } : {}) }
}

function logError(what: string, error: { message: string } | null | undefined) {
  // 본문 원문이 섞이지 않도록 DB가 돌려준 메시지만 남긴다.
  console.error(`${LOG} ${what}:`, error?.message ?? 'unknown')
}

function readExpectedUpdatedAt(value: unknown): string | null {
  if (typeof value !== 'string' || value === '' || Number.isNaN(Date.parse(value))) return null
  return value
}

export interface TasteWriteContext {
  /** 고친 관리자의 ID. */
  actor: string
  /** 화면이 본 수정 시각. 그사이 바뀌었으면 409다. */
  expectedUpdatedAt: unknown
}

/** 임베드·점 경로 필터는 생성 타입이 따라오지 못해, 이 파일이 쓰는 select 메서드만 좁힌 모양으로 읽는다. */
interface LooseQuery extends PromiseLike<{ data: unknown; error: { message: string } | null; count?: number | null }> {
  select(columns: string, options?: { count: 'exact' }): LooseQuery
  eq(column: string, value: unknown): LooseQuery
  order(column: string, options?: { ascending?: boolean }): LooseQuery
  range(from: number, to: number): LooseQuery
  maybeSingle(): LooseQuery
}

function looseTable(service: ServiceClient, table: string): LooseQuery {
  return (service as unknown as { from(name: string): LooseQuery }).from(table)
}

// ── 취향 신호 확정·고치기 ───────────────────────────────────────────────────────────────────────

async function readSignal(service: ServiceClient, signalId: string): Promise<OpsTasteSignalRecord | null | undefined> {
  const { data, error } = await service.from('ops_pattern_taste_signals').select(OPS_TASTE_SIGNAL_COLUMNS).eq('id', signalId).maybeSingle()
  if (error) {
    logError('취향 신호 조회 실패', error)
    return undefined
  }
  return data ? toTasteSignalRecord(data) : null
}

interface EvidenceRow {
  action: string
  ops_bundles: { is_sample: boolean } | { is_sample: boolean }[] | null
  ops_bundle_items: { pattern_no: string | null } | { pattern_no: string | null }[] | null
}

function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

/** 근거로 붙일 수 있는가: 반려(`reject`) 기록이고, 항목의 패턴 번호가 이 신호의 패턴과 같고, 시험 묶음이 아니다. `undefined`는 조회 실패다. */
async function isValidEvidence(service: ServiceClient, decisionId: string, patternNo: string): Promise<boolean | undefined> {
  const { data, error } = await looseTable(service, 'ops_decisions')
    .select('id, action, ops_bundles!inner(is_sample), ops_bundle_items(pattern_no)')
    .eq('id', decisionId)
    .maybeSingle()
  if (error) {
    logError('근거 결정 기록 조회 실패', error)
    return undefined
  }
  const row = data as EvidenceRow | null
  if (!row) return false
  return row.action === OPS_DECISION_ACTION_REJECT && first(row.ops_bundles)?.is_sample === false && first(row.ops_bundle_items)?.pattern_no === patternNo
}

/**
 * 취향 신호의 이유를 고치고 확정한다(추정 → 확정, 확정 뒤 이유·근거 고치기). 저장하면 항상 `basis = 'confirmed'`다.
 * 처음 확정이면 `confirmed_at`·`confirmed_by`를 정하고, 이미 확정이면 그대로 둔다. 값(이유·근거)이 같고 이미 확정이면 쓰지 않고 `changed: false`다.
 */
export async function saveOpsTasteSignal(
  service: ServiceClient,
  signalId: string,
  rawInput: unknown,
  context: TasteWriteContext
): Promise<OpsTasteSignalWriteOutcome> {
  if (!isUuid(signalId)) return fail(404, TASTE_NOT_FOUND_MESSAGE)
  const expectedUpdatedAt = readExpectedUpdatedAt(context.expectedUpdatedAt)
  if (expectedUpdatedAt === null) return fail(400, TASTE_EXPECTED_UPDATED_AT_MESSAGE)
  const checked = validateTasteSignalInput(rawInput)
  if (!checked.ok) return fail(400, TASTE_FIELDS_INVALID_MESSAGE, checked.fieldErrors)
  const { reason, evidenceDecisionId } = checked.value

  const current = await readSignal(service, signalId)
  if (current === undefined) return fail(500, TASTE_SAVE_FAILED_MESSAGE)
  if (current === null) return fail(404, TASTE_NOT_FOUND_MESSAGE)
  if (current.updatedAt !== expectedUpdatedAt) return fail(409, TASTE_UPDATE_CONFLICT_MESSAGE)

  if (evidenceDecisionId !== null) {
    // 공통 신호는 패턴이 없어 근거를 붙일 수 없다. 패턴 번호 형식이 아닌 값도 같은 이유로 거른다.
    const patternNo = current.patternNo
    const valid = patternNo !== null && OPS_PATTERN_NO_PATTERN.test(patternNo) ? await isValidEvidence(service, evidenceDecisionId, patternNo) : false
    if (valid === undefined) return fail(500, TASTE_SAVE_FAILED_MESSAGE)
    if (!valid) return fail(400, TASTE_FIELDS_INVALID_MESSAGE, { evidenceDecisionId: TASTE_EVIDENCE_INVALID_MESSAGE })
  }

  const alreadyConfirmed = current.basis === 'confirmed'
  if (alreadyConfirmed && current.reason === reason && current.evidenceDecisionId === evidenceDecisionId) {
    return { ok: true, signal: current, changed: false }
  }

  const now = new Date().toISOString()
  const updated = await service
    .from('ops_pattern_taste_signals')
    .update({
      reason,
      basis: 'confirmed',
      evidence_decision_id: evidenceDecisionId,
      updated_at: now,
      ...(alreadyConfirmed ? {} : { confirmed_at: now, confirmed_by: context.actor }),
    })
    .eq('id', signalId)
    .eq('updated_at', expectedUpdatedAt)
    .select(OPS_TASTE_SIGNAL_COLUMNS)
  if (updated.error) {
    logError('취향 신호 저장 실패', updated.error)
    return fail(500, TASTE_SAVE_FAILED_MESSAGE)
  }
  const row = updated.data?.[0]
  if (!row) {
    // 0행: 행이 사라졌으면 404, 있으면 그사이 바뀐 것이라 409다.
    const again = await readSignal(service, signalId)
    if (again === undefined) return fail(500, TASTE_SAVE_FAILED_MESSAGE)
    if (again === null) return fail(404, TASTE_NOT_FOUND_MESSAGE)
    return fail(409, TASTE_UPDATE_CONFLICT_MESSAGE)
  }
  return { ok: true, signal: toTasteSignalRecord(row), changed: true }
}

// ── 공통 규칙 고치기 ────────────────────────────────────────────────────────────────────────────

async function readRule(service: ServiceClient, ruleNo: number): Promise<OpsCommonRuleRecord | null | undefined> {
  const { data, error } = await service.from('ops_pattern_common_rules').select(OPS_COMMON_RULE_COLUMNS).eq('rule_no', ruleNo).maybeSingle()
  if (error) {
    logError('공통 규칙 조회 실패', error)
    return undefined
  }
  return data ? toCommonRuleRecord(data) : null
}

/** 공통 규칙의 제목·본문을 고친다(추가·삭제 없음, 7개 고정). 값이 같으면 쓰지 않고 `changed: false`다. `ruleNo`는 양의 정수여야 한다(아니면 404). */
export async function saveOpsCommonRule(
  service: ServiceClient,
  ruleNo: number,
  rawInput: unknown,
  context: TasteWriteContext
): Promise<OpsCommonRuleWriteOutcome> {
  if (!Number.isInteger(ruleNo) || ruleNo <= 0) return fail(404, COMMON_RULE_NOT_FOUND_MESSAGE)
  const expectedUpdatedAt = readExpectedUpdatedAt(context.expectedUpdatedAt)
  if (expectedUpdatedAt === null) return fail(400, COMMON_RULE_EXPECTED_UPDATED_AT_MESSAGE)
  const checked = validateCommonRuleInput(rawInput)
  if (!checked.ok) return fail(400, TASTE_FIELDS_INVALID_MESSAGE, checked.fieldErrors)
  const { title, body } = checked.value

  const current = await readRule(service, ruleNo)
  if (current === undefined) return fail(500, COMMON_RULE_SAVE_FAILED_MESSAGE)
  if (current === null) return fail(404, COMMON_RULE_NOT_FOUND_MESSAGE)
  if (current.updatedAt !== expectedUpdatedAt) return fail(409, COMMON_RULE_UPDATE_CONFLICT_MESSAGE)
  if (current.title === title && current.body === body) return { ok: true, rule: current, changed: false }

  const updated = await service
    .from('ops_pattern_common_rules')
    .update({ title, body, updated_at: new Date().toISOString(), updated_by: context.actor })
    .eq('rule_no', ruleNo)
    .eq('updated_at', expectedUpdatedAt)
    .select(OPS_COMMON_RULE_COLUMNS)
  if (updated.error) {
    logError('공통 규칙 저장 실패', updated.error)
    return fail(500, COMMON_RULE_SAVE_FAILED_MESSAGE)
  }
  const row = updated.data?.[0]
  if (!row) {
    const again = await readRule(service, ruleNo)
    if (again === undefined) return fail(500, COMMON_RULE_SAVE_FAILED_MESSAGE)
    if (again === null) return fail(404, COMMON_RULE_NOT_FOUND_MESSAGE)
    return fail(409, COMMON_RULE_UPDATE_CONFLICT_MESSAGE)
  }
  return { ok: true, rule: toCommonRuleRecord(row), changed: true }
}

// ── 근거 후보: 이 패턴 항목의 반려 기록 ─────────────────────────────────────────────────────────

/** 근거 후보가 읽는 칸. `actor` 원문은 행위자 종류를 가르려고만 읽고 응답에는 싣지 않는다. 항목 `original`·`edited`는 항목 이름을 만들 때만 쓴다. */
export const OPS_REJECTION_COLUMNS =
  'id, created_at, actor, bundle_id, item_id, reason, ops_bundles!inner(is_sample), ops_bundle_items!inner(item_key, kind, pattern_no, original, edited)'

export interface OpsPatternRejectionRecord {
  /** 결정 기록 ID. 취향 신호의 근거(`evidenceDecisionId`)로 붙일 값이다. */
  id: string
  createdAt: string
  actorType: OpsActorType
  /** 에이전트(토큰 제출)일 때만 이름이다. */
  agentName: string | null
  /** 묶음 DB 행 ID(`ops_bundles.id`). 받은 기획함 링크(`opsTargetHref`)에 쓴다. */
  bundleId: string
  itemId: string | null
  /** 항목 이름(문안 제목, 없으면 항목 키, 그것도 없으면 종류 이름). */
  itemName: string
  reason: string | null
}

export interface OpsPatternRejectionsResult {
  rejections: OpsPatternRejectionRecord[]
  hasMore: boolean
  /** 이 패턴의 반려 기록 전체 개수. */
  total: number
}

interface RejectionItemEmbed {
  item_key: string | null
  kind: string | null
  original: Json
  edited: Json | null
}

export interface OpsRejectionRow {
  id: string
  created_at: string
  actor: string
  bundle_id: string
  item_id: string | null
  reason: string | null
  ops_bundle_items: RejectionItemEmbed | RejectionItemEmbed[] | null
}

/** 행에 다른 칸(`actor` 원문·`diff`·`slack_result` 포함)이 섞여 들어와도 응답 칸만 골라 싣는다. */
export function toRejectionRecord(row: OpsRejectionRow): OpsPatternRejectionRecord {
  const item = first(row.ops_bundle_items)
  return {
    id: row.id,
    createdAt: row.created_at,
    ...classifyActor(row.actor),
    bundleId: row.bundle_id,
    itemId: row.item_id,
    itemName: describeBundleItem({ original: item?.original ?? null, edited: item?.edited ?? null, itemKey: item?.item_key ?? null, kind: item?.kind ?? null }),
    reason: row.reason,
  }
}

export interface ListPatternRejectionsOptions {
  /** 건너뛸 개수(0 이상 정수). */
  offset: number
  limit?: number
}

/**
 * 이 패턴 항목의 반려 기록(시험 묶음 제외, 최신순, **기간 제한 없음**). `limit + 1`개를 읽어 `hasMore`를 가린다. 조회 오류는 던진다(라우트가 500으로 받는다).
 */
export async function listPatternRejections(
  service: ServiceClient,
  patternNo: string,
  { offset, limit = OPS_REJECTION_PAGE_SIZE }: ListPatternRejectionsOptions
): Promise<OpsPatternRejectionsResult> {
  const { data, error, count } = await looseTable(service, 'ops_decisions')
    .select(OPS_REJECTION_COLUMNS, { count: 'exact' })
    .eq('action', OPS_DECISION_ACTION_REJECT)
    .eq('ops_bundles.is_sample', false)
    .eq('ops_bundle_items.pattern_no', patternNo)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit)
  if (error) throw new Error(`반려 기록 조회 실패: ${error.message}`)
  const rows = (data ?? []) as OpsRejectionRow[]
  return { rejections: rows.slice(0, limit).map(toRejectionRecord), hasMore: rows.length > limit, total: count ?? rows.length }
}
