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
import { CARD_SHAPES, isCardShape, type CardShape } from '@/lib/today/shape'
import {
  OPS_PATTERN_LIMITS,
  OPS_PATTERN_NO_PATTERN,
  OPS_PATTERN_SAMPLE_ROLES,
  OPS_PATTERN_STATUSES,
  type OpsPatternSampleRole,
  type OpsPatternStatus,
} from './constants'
import { OPS_PATTERN_COLUMNS, OPS_PATTERN_NOT_FOUND_MESSAGE, getOpsPattern, loadOpsPatternNos, toPatternRecord, type OpsPatternRecord } from './read'

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

// ── 입력 모양 ───────────────────────────────────────────────────────────────────────────────────

export interface OpsPatternInputSample {
  no: number
  name: string
  role: OpsPatternSampleRole
  impl: string
}

export interface OpsPatternInputCardShape {
  shape: CardShape
  note: string
}

/** 조건·장소·시간·보상 손잡이는 열린 값·닫은 값, 트라이브는 규칙·예시. 칸은 비워 둘 수 있다. */
export interface OpsPatternInputKnobs {
  condition: { open: string; closed: string }
  place: { open: string; closed: string }
  time: { open: string; closed: string }
  reward: { open: string; closed: string }
  tribe: { rule: string; example: string }
}

/** 패턴의 내용 칸 전체. 칸 이름은 `OpsPatternRecord`와 같고, `OpsPatternProposal`(패턴 제안 항목의 내용)과 같은 모양이라 ⑪이 변환 없이 넘긴다. */
export interface OpsPatternInput {
  name: string
  principle: string
  userExperience: string
  menus: string[]
  samples: OpsPatternInputSample[]
  cardShapes: OpsPatternInputCardShape[]
  knobs: OpsPatternInputKnobs
  pitfalls: string
}

export type OpsPatternFieldErrors = Record<string, string>

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

// ── 검사 ────────────────────────────────────────────────────────────────────────────────────────

const KNOB_LABELS = {
  condition: '조건',
  place: '장소',
  time: '시간',
  reward: '보상',
  tribe: '트라이브',
} as const
const KNOB_FIELD_LABELS = { open: '열린 값', closed: '닫은 값', rule: '규칙', example: '예시' } as const
const KNOB_SHAPE = {
  condition: ['open', 'closed'],
  place: ['open', 'closed'],
  time: ['open', 'closed'],
  reward: ['open', 'closed'],
  tribe: ['rule', 'example'],
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 받침에 따라 조사를 고른다(`이름` + 을/를). 한글이 아닌 끝 글자는 받침이 없는 것으로 본다. */
function withJosa(word: string, withBatchim: string, withoutBatchim: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  const hasBatchim = code >= 0 && code <= 11171 && code % 28 !== 0
  return `${word}${hasBatchim ? withBatchim : withoutBatchim}`
}

/** 선택 문자열 칸: 없으면(undefined·null) 빈 문자열, 문자열이면 앞뒤 공백을 떼고 상한을 본다, 그 밖에는 오류. */
function readOptionalText(value: unknown, path: string, label: string, max: number, errors: OpsPatternFieldErrors): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') {
    errors[path] = `${withJosa(label, '은', '는')} 글로 적어 주세요.`
    return ''
  }
  const text = value.trim()
  if (text.length > max) errors[path] = `${withJosa(label, '은', '는')} ${max.toLocaleString('ko-KR')}자까지 적을 수 있어요. 줄여서 다시 적어 주세요.`
  return text
}

function readRequiredText(value: unknown, path: string, label: string, max: number, errors: OpsPatternFieldErrors): string {
  if (typeof value !== 'string' || value.trim() === '') {
    errors[path] = `${withJosa(label, '을', '를')} 적어 주세요.`
    return ''
  }
  return readOptionalText(value, path, label, max, errors)
}

/**
 * 패턴 내용 검사(티켓 20261008_1545 D2). 통과하면 앞뒤 공백을 뗀 정규 모양(`OpsPatternInput`)을 돌려주고, 아니면 칸별 한국어 문장을 돌려준다.
 * 필수는 이름·작동 원리·유저가 겪는 것 세 칸이다. 메뉴·샘플·카드 모양·손잡이·주의점은 비워 둘 수 있고 손잡이 칸은 빈 문자열도 받는다.
 */
export function validateOpsPatternInput(raw: unknown): { ok: true; value: OpsPatternInput } | { ok: false; fieldErrors: OpsPatternFieldErrors } {
  const errors: OpsPatternFieldErrors = {}
  if (!isRecord(raw)) return { ok: false, fieldErrors: { name: '이름을 적어 주세요.', principle: '작동 원리를 적어 주세요.', userExperience: '유저가 겪는 것을 적어 주세요.' } }
  const { nameMax, longTextMax, menuMax, menusMaxCount, samplesMaxCount, cardShapeNoteMax } = OPS_PATTERN_LIMITS

  const name = readRequiredText(raw.name, 'name', '이름', nameMax, errors)
  const principle = readRequiredText(raw.principle, 'principle', '작동 원리', longTextMax, errors)
  const userExperience = readRequiredText(raw.userExperience, 'userExperience', '유저가 겪는 것', longTextMax, errors)
  const pitfalls = readOptionalText(raw.pitfalls, 'pitfalls', '주의점', longTextMax, errors)

  // 메뉴
  const menus: string[] = []
  if (raw.menus !== undefined && raw.menus !== null) {
    if (!Array.isArray(raw.menus)) errors.menus = '메뉴는 목록으로 보내 주세요.'
    else {
      if (raw.menus.length > menusMaxCount) errors.menus = `메뉴는 ${menusMaxCount}개까지 넣을 수 있어요.`
      raw.menus.forEach((entry, index) => {
        const path = `menus.${index}`
        if (typeof entry !== 'string' || entry.trim() === '') errors[path] = '메뉴 이름을 적어 주세요.'
        else if (entry.trim().length > menuMax) errors[path] = `메뉴 이름은 ${menuMax}자까지 적을 수 있어요.`
        else menus.push(entry.trim())
      })
    }
  }

  // 샘플
  const samples: OpsPatternInputSample[] = []
  if (raw.samples !== undefined && raw.samples !== null) {
    if (!Array.isArray(raw.samples)) errors.samples = '샘플은 목록으로 보내 주세요.'
    else {
      if (raw.samples.length > samplesMaxCount) errors.samples = `샘플은 ${samplesMaxCount}개까지 넣을 수 있어요.`
      const seenNos = new Set<number>()
      raw.samples.forEach((entry, index) => {
        const at = `samples.${index}`
        if (!isRecord(entry)) {
          errors[at] = '샘플 내용을 확인해 주세요.'
          return
        }
        const no = entry.no
        let noOk = false
        if (typeof no !== 'number' || !Number.isInteger(no) || no < 1) errors[`${at}.no`] = '샘플 번호는 1 이상의 정수로 적어 주세요.'
        else if (seenNos.has(no)) errors[`${at}.no`] = '이미 넣은 샘플 번호예요. 다른 번호를 적어 주세요.'
        else {
          seenNos.add(no)
          noOk = true
        }
        const sampleName = readRequiredText(entry.name, `${at}.name`, '샘플 이름', longTextMax, errors)
        const role = entry.role
        const roleOk = typeof role === 'string' && (OPS_PATTERN_SAMPLE_ROLES as readonly string[]).includes(role)
        if (!roleOk) errors[`${at}.role`] = '샘플의 역할은 주·보조 장치·걸침 중에서 골라 주세요.'
        const impl = readOptionalText(entry.impl, `${at}.impl`, '샘플 구현', longTextMax, errors)
        if (noOk && roleOk) samples.push({ no: no as number, name: sampleName, role: role as OpsPatternSampleRole, impl })
      })
    }
  }

  // 카드 모양
  const cardShapes: OpsPatternInputCardShape[] = []
  if (raw.cardShapes !== undefined && raw.cardShapes !== null) {
    if (!Array.isArray(raw.cardShapes)) errors.cardShapes = '카드 모양은 목록으로 보내 주세요.'
    else {
      raw.cardShapes.forEach((entry, index) => {
        const at = `cardShapes.${index}`
        if (!isRecord(entry)) {
          errors[at] = '카드 모양 내용을 확인해 주세요.'
          return
        }
        const shapeOk = isCardShape(entry.shape)
        if (!shapeOk) errors[`${at}.shape`] = `카드 모양은 ${CARD_SHAPES.join('·')} 중에서 골라 주세요.`
        const note = readOptionalText(entry.note, `${at}.note`, '카드 모양 메모', cardShapeNoteMax, errors)
        if (shapeOk) cardShapes.push({ shape: entry.shape as CardShape, note })
      })
    }
  }

  // 손잡이 — 칸은 선택이라 없으면 빈 문자열이다. 저장 모양은 항상 5종 × 두 칸이다.
  const knobsRaw = raw.knobs
  if (knobsRaw !== undefined && knobsRaw !== null && !isRecord(knobsRaw)) errors.knobs = '손잡이는 칸별 내용으로 보내 주세요.'
  const knobs = Object.fromEntries(
    (Object.keys(KNOB_SHAPE) as Array<keyof typeof KNOB_SHAPE>).map((key) => {
      const group = isRecord(knobsRaw) ? knobsRaw[key] : undefined
      if (group !== undefined && group !== null && !isRecord(group)) errors[`knobs.${key}`] = `${KNOB_LABELS[key]} 손잡이는 칸별 내용으로 보내 주세요.`
      const fields = KNOB_SHAPE[key].map((field) => {
        const value = isRecord(group) ? group[field] : undefined
        return [field, readOptionalText(value, `knobs.${key}.${field}`, `${KNOB_LABELS[key]} ${KNOB_FIELD_LABELS[field]}`, longTextMax, errors)] as const
      })
      return [key, Object.fromEntries(fields)] as const
    })
  ) as unknown as OpsPatternInputKnobs

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors }
  return { ok: true, value: { name, principle, userExperience, menus, samples, cardShapes, knobs, pitfalls } }
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
