/**
 * 운영 패턴 사전 읽기 (티켓 20261001_2134, 상위 20260930_1503 ②, 운영툴 PRD §11.6). `GET /api/admin/ops-patterns`와
 * `GET /api/admin/ops-patterns/[patternNo]`가 쓰고, 조합 뽑기·패턴 거르기(1153)가 같은 함수를 다시 쓴다.
 *
 * - 읽기만 한다. 패턴 사전 테이블 3개(`ops_patterns`·`ops_pattern_taste_signals`·`ops_pattern_common_rules`)는 서비스 롤 전용이라
 *   서비스 클라이언트를 인자로 받는다(테스트는 가짜를 넘긴다).
 * - **관리자 ID(`updated_by`·`confirmed_by`)는 select 목록에서부터 뺀다.** 읽지도 돌려주지도 않는다 — 읽기 토큰으로 읽는 응답에 사용자 ID가
 *   나가지 않게 한다(티켓 20260930_1459 조각 B 게이트 발견물과 같은 원칙, PRD §10.1 「읽기 응답 규칙」).
 * - 보관(`archived`) 패턴은 기본으로 뺀다. 번호로 직접 읽으면(`getOpsPattern`) 보관한 패턴도 돌려준다. 취향 신호는 보관한 패턴 것까지
 *   싣는다(PRD §10.1 「보관한 패턴의 취향 신호는 에이전트가 계속 읽는다」).
 * - 조회 오류는 던진다(라우트가 로그를 남기고 고정 문장 500으로 받는다).
 */
import type { createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.generated'
import {
  OPS_PATTERN_STATUS_LABELS,
  type OpsPatternOrigin,
  type OpsPatternStatus,
  type OpsTasteBasis,
} from './constants'

type ServiceClient = ReturnType<typeof createServiceClient>

export const OPS_PATTERN_LOAD_FAILED_MESSAGE = '패턴 사전을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'
export const OPS_PATTERN_NO_INVALID_MESSAGE = '패턴 번호는 P01처럼 P 뒤에 숫자 두 자리 이상이어야 해요.'
export const OPS_PATTERN_NOT_FOUND_MESSAGE = '찾을 수 없는 패턴이에요.'

/** 읽는 칸 목록. `updated_by`·`confirmed_by`는 일부러 넣지 않는다. */
export const OPS_PATTERN_COLUMNS =
  'pattern_no, name, principle, user_experience, menus, samples, card_shapes, knobs, pitfalls, status, pause_reason, origin, origin_item_id, created_at, updated_at'
export const OPS_TASTE_SIGNAL_COLUMNS = 'id, pattern_no, name, reason, basis, evidence_decision_id, confirmed_at, sort_order, updated_at'
export const OPS_COMMON_RULE_COLUMNS = 'rule_no, title, body, updated_at'

// ── 응답 모양(DB 스네이크 → 카멜). 관리자 ID 칸은 없다 ────────────────────────────────────────────

export interface OpsPatternRecord {
  patternNo: string
  name: string
  principle: string
  userExperience: string
  menus: string[]
  /** JSONB는 그대로 넘긴다. */
  samples: Json
  cardShapes: Json
  knobs: Json
  pitfalls: string
  status: OpsPatternStatus
  /** 상태의 한국어 이름표(사용 중·쉬는 중·보관). */
  statusLabel: string
  pauseReason: string | null
  origin: OpsPatternOrigin
  originItemId: string | null
  createdAt: string
  updatedAt: string
}

export interface OpsTasteSignalRecord {
  id: string
  /** 공통 신호는 `null`. */
  patternNo: string | null
  name: string
  reason: string
  basis: OpsTasteBasis
  evidenceDecisionId: string | null
  confirmedAt: string | null
  sortOrder: number
  /** 마지막으로 고친 시각. 고치기 요청의 `expectedUpdatedAt`에 그대로 돌려보낸다(티켓 20261008_1712). */
  updatedAt: string
}

export interface OpsCommonRuleRecord {
  ruleNo: number
  title: string
  body: string
  updatedAt: string
}

export interface OpsPatternRow {
  pattern_no: string
  name: string
  principle: string
  user_experience: string
  menus: string[]
  samples: Json
  card_shapes: Json
  knobs: Json
  pitfalls: string
  status: string
  pause_reason: string | null
  origin: string
  origin_item_id: string | null
  created_at: string
  updated_at: string
}

export interface OpsTasteSignalRow {
  id: string
  pattern_no: string | null
  name: string
  reason: string
  basis: string
  evidence_decision_id: string | null
  confirmed_at: string | null
  sort_order: number
  updated_at: string
}

export interface OpsCommonRuleRow {
  rule_no: number
  title: string
  body: string
  updated_at: string
}

/** 행에 다른 칸(관리자 ID 포함)이 섞여 들어와도 응답 칸만 골라 싣는다. 상태·출처 값은 DB CHECK가 지킨다(`migration.test.ts`). */
export function toPatternRecord(row: OpsPatternRow): OpsPatternRecord {
  const status = row.status as OpsPatternStatus
  return {
    patternNo: row.pattern_no,
    name: row.name,
    principle: row.principle,
    userExperience: row.user_experience,
    menus: row.menus,
    samples: row.samples,
    cardShapes: row.card_shapes,
    knobs: row.knobs,
    pitfalls: row.pitfalls,
    status,
    statusLabel: OPS_PATTERN_STATUS_LABELS[status] ?? row.status,
    pauseReason: row.pause_reason,
    origin: row.origin as OpsPatternOrigin,
    originItemId: row.origin_item_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toTasteSignalRecord(row: OpsTasteSignalRow): OpsTasteSignalRecord {
  return {
    id: row.id,
    patternNo: row.pattern_no,
    name: row.name,
    reason: row.reason,
    basis: row.basis as OpsTasteBasis,
    evidenceDecisionId: row.evidence_decision_id,
    confirmedAt: row.confirmed_at,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  }
}

export function toCommonRuleRecord(row: OpsCommonRuleRow): OpsCommonRuleRecord {
  return { ruleNo: row.rule_no, title: row.title, body: row.body, updatedAt: row.updated_at }
}

// ── 정렬 ────────────────────────────────────────────────────────────────────────────────────────

/** 패턴 번호의 숫자 부분(`P09` → 9). 글자 순서로 정렬하면 P100이 P20 앞에 오므로 숫자로 견준다. */
function patternNumber(patternNo: string): number {
  return Number(patternNo.slice(1))
}

/** 패턴 번호의 숫자 순서(P09 < P10 < P100). 숫자가 같으면(P9와 P09 같은 변칙) 글자 순서로 가른다. */
export function comparePatternNo(a: string, b: string): number {
  return patternNumber(a) - patternNumber(b) || a.localeCompare(b)
}

/** 취향 신호의 순서: 공통(`patternNo: null`)이 먼저, 그다음 패턴 번호의 숫자 순서, 같은 패턴 안에서는 `sortOrder`(같으면 이름). */
export function compareTasteSignals(a: OpsTasteSignalRecord, b: OpsTasteSignalRecord): number {
  if (a.patternNo === null || b.patternNo === null) {
    return Number(b.patternNo === null) - Number(a.patternNo === null) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  }
  return comparePatternNo(a.patternNo, b.patternNo) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
}

// ── 읽기 ────────────────────────────────────────────────────────────────────────────────────────

/** 패턴 목록(번호의 숫자 순서). `includeArchived`가 참일 때만 보관 패턴을 싣는다. 테이블이 비어 있으면 빈 목록이다. */
export async function listOpsPatterns(service: ServiceClient, { includeArchived }: { includeArchived: boolean }): Promise<OpsPatternRecord[]> {
  const query = service.from('ops_patterns').select(OPS_PATTERN_COLUMNS)
  const { data, error } = await (includeArchived ? query : query.neq('status', 'archived'))
  if (error) throw new Error(`패턴 조회 실패: ${error.message}`)
  return (data ?? []).map(toPatternRecord).sort((a, b) => comparePatternNo(a.patternNo, b.patternNo))
}

/**
 * 사전에 있는 패턴 번호 전체(티켓 20261007_1745). 운영 묶음 항목의 `pattern_no`가 사전에 있는 번호인지 보는 재료다.
 * 상태로 거르지 않는다 — 보관(`archived`) 패턴도 번호는 지우지 않고 보관만 하므로 사전에 있는 번호다. 조회 오류는 던진다.
 */
export async function loadOpsPatternNos(service: ServiceClient): Promise<Set<string>> {
  const { data, error } = await service.from('ops_patterns').select('pattern_no')
  if (error) throw new Error(`패턴 번호 조회 실패: ${error.message}`)
  return new Set((data ?? []).map((row) => row.pattern_no))
}

/** 제안 항목으로 만든 패턴(`origin_item_id`가 그 항목인 행). 없으면 `null`이다. 제안 승인을 다시 했을 때 이미 만든 패턴을 찾는 데 쓴다(티켓 20261008_1845). 조회 오류는 던진다. */
export async function findOpsPatternByOriginItem(service: ServiceClient, itemId: string): Promise<OpsPatternRecord | null> {
  const { data, error } = await service.from('ops_patterns').select(OPS_PATTERN_COLUMNS).eq('origin_item_id', itemId).maybeSingle()
  if (error) throw new Error(`패턴 조회 실패: ${error.message}`)
  return data ? toPatternRecord(data) : null
}

/** 패턴 한 건. 보관한 패턴도 번호로 직접 읽으면 돌려준다. 없으면 `null`이다. */
export async function getOpsPattern(service: ServiceClient, patternNo: string): Promise<OpsPatternRecord | null> {
  const { data, error } = await service.from('ops_patterns').select(OPS_PATTERN_COLUMNS).eq('pattern_no', patternNo).maybeSingle()
  if (error) throw new Error(`패턴 조회 실패: ${error.message}`)
  return data ? toPatternRecord(data) : null
}

/**
 * 취향 신호. `patternNo`를 주면 그 패턴 것만(`sortOrder` 순서), 안 주면 전부다(공통 먼저, 패턴 번호의 숫자 순서).
 * 보관한 패턴의 취향 신호도 싣는다.
 */
export async function listOpsTasteSignals(service: ServiceClient, { patternNo }: { patternNo?: string } = {}): Promise<OpsTasteSignalRecord[]> {
  const query = service.from('ops_pattern_taste_signals').select(OPS_TASTE_SIGNAL_COLUMNS)
  const { data, error } = await (patternNo === undefined ? query : query.eq('pattern_no', patternNo))
  if (error) throw new Error(`취향 신호 조회 실패: ${error.message}`)
  return (data ?? []).map(toTasteSignalRecord).sort(compareTasteSignals)
}

/** 공통 규칙 전부(`ruleNo` 순서). */
export async function listOpsCommonRules(service: ServiceClient): Promise<OpsCommonRuleRecord[]> {
  const { data, error } = await service.from('ops_pattern_common_rules').select(OPS_COMMON_RULE_COLUMNS)
  if (error) throw new Error(`공통 규칙 조회 실패: ${error.message}`)
  return (data ?? []).map(toCommonRuleRecord).sort((a, b) => a.ruleNo - b.ruleNo)
}

/** 패턴 제안 항목의 종류 값(`ops_bundle_items.kind`). 사전에 넣을 제안이라 조합 뽑기는 세지 않는다. */
const PATTERN_PROPOSAL_KIND = 'pattern_proposal'
/** 아직 결정하지 않은 항목 상태: 도착·검토 중. */
const PENDING_DECISION_STATUSES: readonly string[] = ['arrived', 'reviewing']

/** `count` 읽기에 필요한 select 빌더 메서드만 좁힌 모양(임베드 필터는 생성 타입이 따라오지 못한다). */
interface CountQuery extends PromiseLike<{ count: number | null; error: { message: string } | null }> {
  select(columns: string, options: { count: 'exact'; head: true }): CountQuery
  eq(column: string, value: unknown): CountQuery
  in(column: string, values: readonly string[]): CountQuery
}

/**
 * 승인 대기 제안 건수(티켓 20261008_1400, 패턴 사전 화면의 「승인 대기 제안 N건」). 종류가 `pattern_proposal`이고 상태가 결정 전(도착·검토 중)이며
 * 시험 묶음이 아닌 항목의 개수다. 조회 오류는 던진다(화면이 이 줄만 「읽지 못했어요」로 바꾼다 — 실패를 0건으로 보이지 않는다).
 */
export async function countPendingPatternProposals(service: ServiceClient): Promise<number> {
  const query = (service as unknown as { from(table: string): CountQuery }).from('ops_bundle_items')
  const { count, error } = await query
    .select('id, ops_bundles!inner(is_sample)', { count: 'exact', head: true })
    .eq('kind', PATTERN_PROPOSAL_KIND)
    .in('status', PENDING_DECISION_STATUSES)
    .eq('ops_bundles.is_sample', false)
  if (error) throw new Error(`승인 대기 제안 조회 실패: ${error.message}`)
  return count ?? 0
}
