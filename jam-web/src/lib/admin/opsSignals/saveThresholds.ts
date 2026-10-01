/**
 * 신호 기준값 읽기·저장·되돌리기 (티켓 20260930_1459 조각 C). 설정 화면(S7)의 서버 컴포넌트와
 * `GET /api/admin/ops-rules?group=signal`·`PATCH /api/admin/ops-rules/signals/[signalKey]`·
 * `DELETE /api/admin/ops-rules/signals/[signalKey]/[thresholdKey]`가 쓴다.
 *
 * **바꾼 값만 저장한다**(사용자 결정 2026-10-01). 기본값 25개는 `thresholds.ts`와 운영툴 PRD §5.1 표에만 있고, 바꾼 값만 `ops_rules`에
 * `rule_group = 'signal'`(키 = 기준값 키, 값 `{"value": <값>}`, `level = 'warn'`·`enabled = true`는 자리값) 행으로 남는다.
 * 기본값과 같아진 값은 행을 만들지 않고 있던 행은 지운다. 미리 넣는 시드가 없다.
 *
 * 카드 한 장(신호 하나)의 칸을 한 번에 저장한다:
 * 1. 카드 칸 전부를 먼저 확인한다(하나라도 틀리면 400이고 아무것도 쓰지 않는다). 맞물린 값(최소·최대 장수, 되돌아보는 기간과 횟수)은 요청의
 *    값과 저장된 값(없거나 읽을 수 없으면 기본값)을 합쳐서 확인하므로 한쪽만 따로 저장하는 요청도 400이다.
 * 2. 칸별 `expectedUpdatedAt`(행이 없으면 `null`)을 현재 행과 견준다. 다르면 409다(행이 없던 칸에 행이 생긴 경우 포함).
 * 3. 기본값과 다른 값은 한 번의 upsert로, 기본값과 같아진 값은 한 번의 delete로 쓴다. 값이 바뀌면 `previous_value`(첫 저장은 기본값)와
 *    `updated_by`·`updated_at`을 채운다.
 * 한계: 읽은 뒤 쓰기 전 사이와 upsert·delete 두 문장 사이의 동시 수정은 막지 못한다(관리자 1명 운영이라 감수한다. 운영툴 PRD §11.5).
 * 칸 하나만 되돌리는 delete는 `updated_at` 조건이 걸려 있어 원자적이다. 읽기 전용 칸(`routineCheckStartsAt`)은 쓰기를 거부한다.
 *
 * 입력은 HTTP 본문이라 `unknown`으로 받아 여기서 확인한다. 서비스 클라이언트는 인자로 받는다(테스트는 가짜를 넘긴다).
 * **응답에는 관리자 사용자 ID가 없다**(`SignalThresholdRecord`가 싣지 않는다).
 */
import type { createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.generated'
import { OPS_SIGNAL_THRESHOLD_KEYS, DEFAULT_OPS_SIGNAL_THRESHOLD_VALUES, type OpsSignalThresholdKey } from '@/lib/admin/opsSignals/thresholds'
import {
  THRESHOLD_ERRORS,
  THRESHOLD_ROW_COLUMNS,
  checkThresholdInput,
  isThresholdKey,
  readStoredThresholdValue,
  signalCard,
  thresholdField,
  thresholdInterlockErrors,
  toThresholdRecord,
  type SignalThresholdRecord,
  type ThresholdRow,
} from '@/lib/admin/opsSignals/thresholdSettings'

type ServiceClient = ReturnType<typeof createServiceClient>

const LOG = '[admin/ops-rules]'

export const SIGNAL_NOT_FOUND_MESSAGE = '찾을 수 없는 신호예요.'
export const THRESHOLD_NOT_FOUND_MESSAGE = '찾을 수 없는 기준값이에요.'
export const THRESHOLD_CONFLICT_MESSAGE = '그사이 다른 곳에서 이 신호의 기준값이 바뀌었어요. 최신 값을 불러온 뒤 다시 바꿔 주세요.'
export const THRESHOLD_SAVE_FAILED_MESSAGE = '기준값을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
const VALUES_CHECK_MESSAGE = '값을 확인해 주세요.'
const STAMP_REQUIRED_MESSAGE = '기준값의 수정 시각이 필요해요. 화면을 새로 고쳐 주세요.'

function logError(what: string, error: { message: string } | null | undefined) {
  console.error(`${LOG} ${what}:`, error?.message ?? 'unknown')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// ── 읽기 ────────────────────────────────────────────────────────────────────────────────────────

/** 기준값 25개의 현재 상태(`thresholds.ts`의 키 순서). 행이 없는 칸은 기본값 그대로다. 조회 오류는 던진다. */
export async function listSignalThresholds(service: ServiceClient): Promise<SignalThresholdRecord[]> {
  const { data, error } = await service.from('ops_rules').select(THRESHOLD_ROW_COLUMNS).eq('rule_group', 'signal')
  if (error) throw new Error(`기준값 조회 실패: ${error.message}`)
  const byKey = new Map<string, ThresholdRow>((data ?? []).map((row) => [row.rule_key, row]))
  return OPS_SIGNAL_THRESHOLD_KEYS.map((key) => toThresholdRecord(key, byKey.get(key)))
}

// ── 저장 ────────────────────────────────────────────────────────────────────────────────────────

export interface SaveThresholdsInput {
  signalKey: string
  /** 바꿀 칸: 기준값 키 → 새 값(숫자). 카드의 칸이어야 하고 읽기 전용 칸은 받지 않는다. */
  values: unknown
  /** 칸별로 화면이 본 수정 시각(행이 없으면 `null`). `values`의 모든 키가 있어야 한다. */
  expectedUpdatedAt: unknown
  /** 바꾼 관리자의 ID. */
  actor: string
}

export type SaveThresholdsOutcome =
  | {
      ok: true
      /** 실제로 쓴 것이 있었는지. 모두 현재 값과 같으면 쓰지 않는다. */
      changed: boolean
      /** 저장 뒤 카드 칸들의 현재 상태(카드의 모든 칸, 보이는 순서). */
      thresholds: SignalThresholdRecord[]
    }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string; fieldErrors?: Record<string, string> }

function fail(status: 400 | 404 | 409 | 500, error: string, fieldErrors?: Record<string, string>): SaveThresholdsOutcome {
  return { ok: false, status, error, ...(fieldErrors ? { fieldErrors } : {}) }
}

export async function saveSignalThresholds(service: ServiceClient, input: SaveThresholdsInput): Promise<SaveThresholdsOutcome> {
  const card = signalCard(input.signalKey)
  if (!card) return fail(404, SIGNAL_NOT_FOUND_MESSAGE)

  if (!isPlainObject(input.values) || Object.keys(input.values).length === 0) return fail(400, '바꿀 내용이 없어요.')
  if (!isPlainObject(input.expectedUpdatedAt)) return fail(400, STAMP_REQUIRED_MESSAGE)
  const values = input.values
  const expected = input.expectedUpdatedAt

  // 1. 칸별 확인(카드에 없는 칸·읽기 전용 칸·범위 밖 값). 하나라도 틀리면 아무것도 쓰지 않는다.
  const cardKeys = new Set<string>(card.fields.map((field) => field.key))
  const fieldErrors: Record<string, string> = {}
  for (const [key, raw] of Object.entries(values)) {
    if (!isThresholdKey(key) || !cardKeys.has(key)) fieldErrors[key] = '이 신호에 없는 기준값이에요'
    else {
      const message = checkThresholdInput(key, raw)
      if (message) fieldErrors[key] = message
    }
  }
  if (Object.keys(fieldErrors).length > 0) return fail(400, VALUES_CHECK_MESSAGE, fieldErrors)
  const requested = values as Partial<Record<OpsSignalThresholdKey, number>>
  const requestedKeys = Object.keys(requested) as OpsSignalThresholdKey[]

  for (const key of requestedKeys) {
    const stamp = expected[key]
    if (!(key in expected) || (stamp !== null && typeof stamp !== 'string')) return fail(400, STAMP_REQUIRED_MESSAGE)
  }

  // 현재 행(카드의 칸만).
  const current = await service
    .from('ops_rules')
    .select(THRESHOLD_ROW_COLUMNS)
    .eq('rule_group', 'signal')
    .in('rule_key', [...cardKeys])
  if (current.error) {
    logError('기준값 조회 실패', current.error)
    return fail(500, THRESHOLD_SAVE_FAILED_MESSAGE)
  }
  const rows = new Map<string, ThresholdRow>((current.data ?? []).map((row) => [row.rule_key, row]))

  // 2. 맞물림: 요청의 값과 저장된 값(없거나 읽을 수 없으면 기본값)을 합쳐서 확인한다.
  const merged: Partial<Record<OpsSignalThresholdKey, number>> = {}
  for (const field of card.editableFields) {
    const row = rows.get(field.key)
    const stored = row ? readStoredThresholdValue(field.key, row.value) : null
    merged[field.key] = requested[field.key] ?? ((stored?.ok ? stored.value : DEFAULT_OPS_SIGNAL_THRESHOLD_VALUES[field.key]) as number)
  }
  const interlock = thresholdInterlockErrors(merged)
  if (Object.keys(interlock).length > 0) return fail(400, VALUES_CHECK_MESSAGE, interlock as Record<string, string>)

  // 3. 충돌: 화면이 본 수정 시각과 현재 행이 같아야 한다(행이 없으면 `null`이어야 한다).
  for (const key of requestedKeys) {
    const row = rows.get(key)
    if (row ? row.updated_at !== expected[key] : expected[key] !== null) return fail(409, THRESHOLD_CONFLICT_MESSAGE)
  }

  // 4. 쓸 것: 기본값과 다른 값은 upsert, 기본값과 같아진 값은 행이 있을 때만 delete. 현재 값과 같으면 쓰지 않는다.
  const nowIso = new Date().toISOString()
  const upserts: Array<{
    rule_key: string
    rule_group: string
    value: Json
    level: string
    enabled: boolean
    updated_at: string
    updated_by: string
    previous_value: Json
  }> = []
  const deletes: string[] = []
  for (const key of requestedKeys) {
    const value = requested[key] as number
    const defaultValue = DEFAULT_OPS_SIGNAL_THRESHOLD_VALUES[key] as number
    const row = rows.get(key)
    if (value === defaultValue) {
      if (row) deletes.push(key)
      continue
    }
    const stored = row ? readStoredThresholdValue(key, row.value) : null
    if (stored?.ok && stored.value === value) continue
    upserts.push({
      rule_key: key,
      rule_group: 'signal',
      value: { value },
      level: 'warn',
      enabled: true,
      updated_at: nowIso,
      updated_by: input.actor,
      // 직전 값: 읽을 수 있는 저장값, 없으면(첫 저장·읽을 수 없는 행) 기본값
      previous_value: { value: stored?.ok ? stored.value : defaultValue },
    })
  }

  const after = new Map(rows)
  if (upserts.length === 0 && deletes.length === 0) {
    return { ok: true, changed: false, thresholds: card.fields.map((field) => toThresholdRecord(field.key, after.get(field.key))) }
  }

  if (upserts.length > 0) {
    const written = await service.from('ops_rules').upsert(upserts, { onConflict: 'rule_key' }).select(THRESHOLD_ROW_COLUMNS)
    if (written.error) {
      logError('기준값 저장 실패', written.error)
      return fail(500, THRESHOLD_SAVE_FAILED_MESSAGE)
    }
    for (const row of written.data ?? []) after.set(row.rule_key, row)
  }
  if (deletes.length > 0) {
    const removed = await service.from('ops_rules').delete().eq('rule_group', 'signal').in('rule_key', deletes)
    if (removed.error) {
      logError('기준값 삭제 실패', removed.error)
      return fail(500, THRESHOLD_SAVE_FAILED_MESSAGE)
    }
    for (const key of deletes) after.delete(key)
  }
  return { ok: true, changed: true, thresholds: card.fields.map((field) => toThresholdRecord(field.key, after.get(field.key))) }
}

// ── 칸 하나 기본값으로 되돌리기 ─────────────────────────────────────────────────────────────────

export interface RevertThresholdInput {
  signalKey: string
  thresholdKey: string
  /** 화면이 본 그 칸 행의 수정 시각. */
  expectedUpdatedAt: unknown
}

export type RevertThresholdOutcome =
  | { ok: true; /** 되돌린 뒤의 칸(기본값 그대로). */ threshold: SignalThresholdRecord }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string }

/**
 * 그 칸의 행만 지운다(변경 기록도 함께 사라진다). `updated_at` 조건이 걸린 한 문장 delete라서, 행이 없거나 그사이 바뀌었으면 0행이고 409다.
 * 읽기 전용 칸은 거부한다.
 */
export async function revertSignalThreshold(service: ServiceClient, input: RevertThresholdInput): Promise<RevertThresholdOutcome> {
  if (!signalCard(input.signalKey)) return { ok: false, status: 404, error: SIGNAL_NOT_FOUND_MESSAGE }
  const field = thresholdField(input.thresholdKey)
  if (!field || field.signal !== input.signalKey) return { ok: false, status: 404, error: THRESHOLD_NOT_FOUND_MESSAGE }
  if (field.readOnly) return { ok: false, status: 400, error: `${THRESHOLD_ERRORS.readOnly}.` }
  if (typeof input.expectedUpdatedAt !== 'string' || input.expectedUpdatedAt === '') {
    return { ok: false, status: 400, error: STAMP_REQUIRED_MESSAGE }
  }

  const removed = await service
    .from('ops_rules')
    .delete()
    .eq('rule_key', field.key)
    .eq('rule_group', 'signal')
    .eq('updated_at', input.expectedUpdatedAt)
    .select(THRESHOLD_ROW_COLUMNS)
  if (removed.error) {
    logError('기준값 되돌리기 실패', removed.error)
    return { ok: false, status: 500, error: THRESHOLD_SAVE_FAILED_MESSAGE }
  }
  if ((removed.data ?? []).length === 0) return { ok: false, status: 409, error: THRESHOLD_CONFLICT_MESSAGE }
  return { ok: true, threshold: toThresholdRecord(field.key) }
}
