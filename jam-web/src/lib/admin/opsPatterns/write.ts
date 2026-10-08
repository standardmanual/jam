/**
 * 운영 패턴 사전 쓰기 (티켓 20261008_1545, 상위 20260930_1503 ⑩a-1, 운영툴 PRD §11.6). `POST /api/admin/ops-patterns`(만들기)와
 * `PATCH /api/admin/ops-patterns/[patternNo]`(고치기·상태 바꾸기)가 쓰고, ⑪(패턴 제안 승인)이 `createOpsPattern`을 그대로 부른다.
 *
 * - 읽기 모양(`OpsPatternRecord`)과 읽기 함수는 `read.ts`를 다시 쓴다. 관리자 ID(`updated_by`)는 쓰기만 하고 응답에는 싣지 않는다.
 * - 입력은 HTTP 본문이라 `unknown`으로 받아 여기서 칸별로 검사한다(`validateOpsPatternInput`). 알 수 없는 키는 버리고 문자열은 앞뒤 공백을 뗀다.
 *   `fieldErrors`의 키는 칸 경로(`name`·`samples.2.role`·`knobs.place.open`)이고 값은 화면에 그대로 보일 한국어 문장이다.
 * - 고치기·상태 바꾸기는 **조건부 update**다 — 화면이 본 수정 시각(`expectedUpdatedAt`)과 같을 때만 쓴다(`balance/save.ts`와 같은 방식).
 *   다르면 409이고 DB는 그대로다. 내용이 같으면 쓰지 않고 `changed: false`로 현재 값을 돌려준다(수정 시각도 그대로).
 * - 번호·출처는 만들 때만 정해지고 고치기로 못 바꾼다. 번호는 지우지 않는다(삭제 없음, PRD §10.1).
 *
 * ⑪이 부르는 법:
 *   `await createOpsPattern(service, proposal, { actor, origin: 'proposal', originItemId: item.id })`
 *   `proposal`은 `OpsPatternProposal`(`opsInbox/fields.ts`) 그대로 넘긴다 — 칸 이름이 같아 변환이 필요 없다(`OpsPatternInput`에 대입 가능).
 *   같은 제안 항목으로 두 번 만들면 409(`PATTERN_ORIGIN_CONFLICT_MESSAGE`)다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.generated'
import { OPS_PATTERN_LIMITS, OPS_PATTERN_NO_PATTERN, OPS_PATTERN_STATUSES, type OpsPatternStatus } from './constants'
import { validateOpsPatternInput, type OpsPatternFieldErrors, type OpsPatternInput } from './input'
import { OPS_PATTERN_COLUMNS, OPS_PATTERN_NOT_FOUND_MESSAGE, getOpsPattern, loadOpsPatternNos, toPatternRecord, type OpsPatternRecord } from './read'

// 입력 모양과 검사는 서버 의존이 없는 `input.ts`로 옮겼다(티켓 20261008_1617). 기존 import 경로가 그대로 되도록 다시 내보낸다.
export { validateOpsPatternInput } from './input'
export type {
  OpsPatternFieldErrors,
  OpsPatternInput,
  OpsPatternInputCardShape,
  OpsPatternInputKnobs,
  OpsPatternInputSample,
} from './input'

type ServiceClient = ReturnType<typeof createServiceClient>

const LOG = '[admin/ops-patterns]'

export const PATTERN_SAVE_FAILED_MESSAGE = '패턴을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
export const PATTERN_CREATE_CONFLICT_MESSAGE = '그사이 다른 패턴이 만들어졌어요. 다시 저장해 주세요.'
export const PATTERN_ORIGIN_CONFLICT_MESSAGE = '이 제안으로 이미 만든 패턴이 있어요.'
export const PATTERN_UPDATE_CONFLICT_MESSAGE = '그사이 다른 곳에서 이 패턴을 고쳤어요. 최신 내용을 불러와 주세요.'
export const PATTERN_STATUS_CONFLICT_MESSAGE = '그사이 상태가 바뀌었어요. 최신 내용을 불러와 주세요.'
export const PATTERN_FIELDS_INVALID_MESSAGE = '입력한 내용을 확인해 주세요.'
export const PATTERN_EXPECTED_UPDATED_AT_MESSAGE = '패턴의 수정 시각이 필요해요. 화면을 새로 고쳐 주세요.'
export const PATTERN_MIXED_PATCH_MESSAGE = '상태 바꾸기와 내용 고치기는 따로 저장해 주세요.'

export type OpsPatternWriteOutcome =
  | {
      ok: true
      pattern: OpsPatternRecord
      /** 고치기·상태 바꾸기에서 실제로 바뀐 것이 있었는지(만들기에는 없다). */
      changed?: boolean
    }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string; fieldErrors?: OpsPatternFieldErrors }

function fail(status: 400 | 404 | 409 | 500, error: string, fieldErrors?: OpsPatternFieldErrors): OpsPatternWriteOutcome {
  return { ok: false, status, error, ...(fieldErrors ? { fieldErrors } : {}) }
}

function logError(what: string, error: { message: string } | null | undefined) {
  // 본문 원문이 섞이지 않도록 DB가 돌려준 메시지만 남긴다.
  console.error(`${LOG} ${what}:`, error?.message ?? 'unknown')
}

// ── 번호 ────────────────────────────────────────────────────────────────────────────────────────

/** 다음 패턴 번호: 사전의 가장 큰 번호 + 1(두 자리 이상, P18 → P19, P99 → P100). 형식이 맞지 않는 값은 건너뛰고 비어 있으면 P01이다. */
export function nextPatternNo(existingNos: Iterable<string>): string {
  let max = 0
  for (const no of existingNos) {
    if (!OPS_PATTERN_NO_PATTERN.test(no)) continue
    max = Math.max(max, Number(no.slice(1)))
  }
  return `P${String(max + 1).padStart(2, '0')}`
}

// ── 공통 ────────────────────────────────────────────────────────────────────────────────────────

/** 키 순서와 상관없이 같은 값인지 견주기 위한 글(JSONB는 키 순서를 보존하지 않는다). */
function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function sameContent(record: OpsPatternRecord, input: OpsPatternInput): boolean {
  return (
    record.name === input.name &&
    record.principle === input.principle &&
    record.userExperience === input.userExperience &&
    record.pitfalls === input.pitfalls &&
    canonicalJson(record.menus) === canonicalJson(input.menus) &&
    canonicalJson(record.samples) === canonicalJson(input.samples) &&
    canonicalJson(record.cardShapes) === canonicalJson(input.cardShapes) &&
    canonicalJson(record.knobs) === canonicalJson(input.knobs)
  )
}

function readExpectedUpdatedAt(value: unknown): string | null {
  if (typeof value !== 'string' || value === '' || Number.isNaN(Date.parse(value))) return null
  return value
}

/** 번호로 현재 패턴을 읽는다. 조회 오류는 로그를 남기고 `undefined`로 돌려준다(호출한 쪽이 500으로 받는다). */
async function readCurrent(service: ServiceClient, patternNo: string): Promise<OpsPatternRecord | null | undefined> {
  try {
    return await getOpsPattern(service, patternNo)
  } catch (error) {
    logError('패턴 조회 실패', error instanceof Error ? error : null)
    return undefined
  }
}

/** 조건부 update가 0행일 때: 행이 사라졌으면 404, 있으면 그사이 바뀐 것이라 409다. */
async function resolveEmptyUpdate(service: ServiceClient, patternNo: string, conflictMessage: string): Promise<OpsPatternWriteOutcome> {
  const again = await readCurrent(service, patternNo)
  if (again === undefined) return fail(500, PATTERN_SAVE_FAILED_MESSAGE)
  if (again === null) return fail(404, OPS_PATTERN_NOT_FOUND_MESSAGE)
  return fail(409, conflictMessage)
}

// ── 만들기 ──────────────────────────────────────────────────────────────────────────────────────

export interface CreateOpsPatternContext {
  /** 만든 관리자의 ID. */
  actor: string
  /** 사전에 들어온 경로. 기본은 `manual`이고 ⑪(제안 승인)은 `proposal`을 넘긴다. */
  origin?: 'manual' | 'proposal'
  /** `origin`이 `proposal`일 때 만든 근거가 된 제안 항목의 ID. 같은 항목으로 두 번 만들 수 없다. */
  originItemId?: string | null
}

/**
 * 패턴 만들기(D3). 번호는 서버가 사전의 가장 큰 번호 + 1로 정하고 상태는 `active`다. 번호가 겹치면(동시에 둘이 만든 경우) 재시도하지 않고 409로
 * 돌려준다 — 화면이 사용자에게 다시 저장하게 한다. 성공하면 만든 패턴을 돌려준다(`changed` 없음).
 */
export async function createOpsPattern(service: ServiceClient, rawInput: unknown, context: CreateOpsPatternContext): Promise<OpsPatternWriteOutcome> {
  const checked = validateOpsPatternInput(rawInput)
  if (!checked.ok) return fail(400, PATTERN_FIELDS_INVALID_MESSAGE, checked.fieldErrors)
  const input = checked.value

  let existing: Set<string>
  try {
    existing = await loadOpsPatternNos(service)
  } catch (error) {
    logError('패턴 번호 조회 실패', error instanceof Error ? error : null)
    return fail(500, PATTERN_SAVE_FAILED_MESSAGE)
  }

  const origin = context.origin ?? 'manual'
  const inserted = await service
    .from('ops_patterns')
    .insert({
      pattern_no: nextPatternNo(existing),
      name: input.name,
      principle: input.principle,
      user_experience: input.userExperience,
      menus: input.menus,
      samples: input.samples as unknown as Json,
      card_shapes: input.cardShapes as unknown as Json,
      knobs: input.knobs as unknown as Json,
      pitfalls: input.pitfalls,
      status: 'active',
      pause_reason: null,
      origin,
      origin_item_id: origin === 'proposal' ? (context.originItemId ?? null) : null,
      updated_by: context.actor,
    })
    .select(OPS_PATTERN_COLUMNS)

  if (inserted.error) {
    if (inserted.error.code === '23505') {
      const text = `${inserted.error.message} ${inserted.error.details ?? ''}`
      return fail(409, text.includes('origin_item_id') ? PATTERN_ORIGIN_CONFLICT_MESSAGE : PATTERN_CREATE_CONFLICT_MESSAGE)
    }
    logError('패턴 만들기 실패', inserted.error)
    return fail(500, PATTERN_SAVE_FAILED_MESSAGE)
  }
  const row = inserted.data?.[0]
  if (!row) {
    logError('패턴 만들기 실패', { message: '삽입한 행이 돌아오지 않았다' })
    return fail(500, PATTERN_SAVE_FAILED_MESSAGE)
  }
  return { ok: true, pattern: toPatternRecord(row) }
}

// ── 고치기 ──────────────────────────────────────────────────────────────────────────────────────

export interface UpdateOpsPatternContext {
  /** 고친 관리자의 ID. */
  actor: string
  /** 화면이 본 패턴의 수정 시각. 그사이 바뀌었으면 409다. */
  expectedUpdatedAt: unknown
}

/**
 * 패턴 내용 고치기(D4). 내용 칸 전체를 받아 덮어쓴다(부분 수정 아님). 번호·출처·상태·쉬는 이유는 이 경로로 바꾸지 않는다.
 * 값이 현재와 같으면 쓰지 않고 `changed: false`로 현재 패턴을 돌려준다(수정 시각도 그대로).
 */
export async function updateOpsPattern(
  service: ServiceClient,
  patternNo: string,
  rawInput: unknown,
  context: UpdateOpsPatternContext
): Promise<OpsPatternWriteOutcome> {
  if (!OPS_PATTERN_NO_PATTERN.test(patternNo)) return fail(404, OPS_PATTERN_NOT_FOUND_MESSAGE)
  const expectedUpdatedAt = readExpectedUpdatedAt(context.expectedUpdatedAt)
  if (expectedUpdatedAt === null) return fail(400, PATTERN_EXPECTED_UPDATED_AT_MESSAGE)
  const checked = validateOpsPatternInput(rawInput)
  if (!checked.ok) return fail(400, PATTERN_FIELDS_INVALID_MESSAGE, checked.fieldErrors)
  const input = checked.value

  const current = await readCurrent(service, patternNo)
  if (current === undefined) return fail(500, PATTERN_SAVE_FAILED_MESSAGE)
  if (current === null) return fail(404, OPS_PATTERN_NOT_FOUND_MESSAGE)
  if (current.updatedAt !== expectedUpdatedAt) return fail(409, PATTERN_UPDATE_CONFLICT_MESSAGE)
  if (sameContent(current, input)) return { ok: true, pattern: current, changed: false }

  const updated = await service
    .from('ops_patterns')
    .update({
      name: input.name,
      principle: input.principle,
      user_experience: input.userExperience,
      menus: input.menus,
      samples: input.samples as unknown as Json,
      card_shapes: input.cardShapes as unknown as Json,
      knobs: input.knobs as unknown as Json,
      pitfalls: input.pitfalls,
      updated_at: new Date().toISOString(),
      updated_by: context.actor,
    })
    .eq('pattern_no', patternNo)
    .eq('updated_at', expectedUpdatedAt)
    .select(OPS_PATTERN_COLUMNS)
  if (updated.error) {
    logError('패턴 고치기 실패', updated.error)
    return fail(500, PATTERN_SAVE_FAILED_MESSAGE)
  }
  const row = updated.data?.[0]
  if (!row) return resolveEmptyUpdate(service, patternNo, PATTERN_UPDATE_CONFLICT_MESSAGE)
  return { ok: true, pattern: toPatternRecord(row), changed: true }
}

// ── 상태 바꾸기 ─────────────────────────────────────────────────────────────────────────────────

export interface ChangeOpsPatternStatusInput {
  status: unknown
  /** 쉬는 중으로 바꿀 때만 쓴다(1~200자). 다른 상태로 바꾸면 쉬는 이유는 지워진다. */
  pauseReason?: unknown
}

/**
 * 상태 바꾸기(D5). 사용 중·쉬는 중·보관 사이의 모든 전환을 받는다. 쉬는 중은 이유가 필수이고, 쉬는 중이 아닌 상태로 바꾸면 쉬는 이유를 지운다.
 * 같은 상태로 바꾸는 요청은 쉬는 중의 이유가 달라진 경우만 쓰고, 그 밖에는 `changed: false`다.
 */
export async function changeOpsPatternStatus(
  service: ServiceClient,
  patternNo: string,
  input: ChangeOpsPatternStatusInput,
  context: UpdateOpsPatternContext
): Promise<OpsPatternWriteOutcome> {
  if (!OPS_PATTERN_NO_PATTERN.test(patternNo)) return fail(404, OPS_PATTERN_NOT_FOUND_MESSAGE)
  const expectedUpdatedAt = readExpectedUpdatedAt(context.expectedUpdatedAt)
  if (expectedUpdatedAt === null) return fail(400, PATTERN_EXPECTED_UPDATED_AT_MESSAGE)

  const status = input.status
  if (typeof status !== 'string' || !(OPS_PATTERN_STATUSES as readonly string[]).includes(status)) {
    return fail(400, PATTERN_FIELDS_INVALID_MESSAGE, { status: '상태는 사용 중·쉬는 중·보관 중에서 골라 주세요.' })
  }
  const nextStatus = status as OpsPatternStatus
  let pauseReason: string | null = null
  if (nextStatus === 'paused') {
    const reason = typeof input.pauseReason === 'string' ? input.pauseReason.trim() : ''
    const { pauseReasonMax } = OPS_PATTERN_LIMITS
    if (reason === '' || reason.length > pauseReasonMax) {
      return fail(400, PATTERN_FIELDS_INVALID_MESSAGE, { pauseReason: `쉬는 이유를 ${pauseReasonMax}자 이내로 적어 주세요.` })
    }
    pauseReason = reason
  }

  const current = await readCurrent(service, patternNo)
  if (current === undefined) return fail(500, PATTERN_SAVE_FAILED_MESSAGE)
  if (current === null) return fail(404, OPS_PATTERN_NOT_FOUND_MESSAGE)
  if (current.updatedAt !== expectedUpdatedAt) return fail(409, PATTERN_STATUS_CONFLICT_MESSAGE)
  if (current.status === nextStatus && current.pauseReason === pauseReason) return { ok: true, pattern: current, changed: false }

  const updated = await service
    .from('ops_patterns')
    .update({ status: nextStatus, pause_reason: pauseReason, updated_at: new Date().toISOString(), updated_by: context.actor })
    .eq('pattern_no', patternNo)
    .eq('updated_at', expectedUpdatedAt)
    .select(OPS_PATTERN_COLUMNS)
  if (updated.error) {
    logError('패턴 상태 바꾸기 실패', updated.error)
    return fail(500, PATTERN_SAVE_FAILED_MESSAGE)
  }
  const row = updated.data?.[0]
  if (!row) return resolveEmptyUpdate(service, patternNo, PATTERN_STATUS_CONFLICT_MESSAGE)
  return { ok: true, pattern: toPatternRecord(row), changed: true }
}
