/**
 * 밸런스 설정의 공용 읽기·저장 (티켓 20261022_1132, 운영 로직 19.1절)
 *
 * 구역 화면(서버 컴포넌트)과 `GET·PUT /api/admin/balance/[section]`이 쓴다. **구역마다 이 함수를 다시 쓰지 않는다** — 구역별 차이(칸 정의, 읽기, 쓰기, 칸 사이 검증)는
 * `BalanceSectionBinding` 한 객체가 담고, 이 파일은 그 객체를 돌려 아래 순서를 지킨다. 7-2~7-4 구역도 같은 순서를 쓴다.
 *
 * 저장 순서(`saveBalanceSection`):
 * ① 본문 모양과 메모 길이 확인 ② 칸마다 검증(정수·범위·구역 연결의 `validators`) ③ 현재 값 읽기 ④ 화면이 본 `updated_at`과 같은지(다르면 409)
 * ⑤ **바뀐 칸만** 계산(없으면 400) ⑥ 칸 사이 검증(등급 확률 합 100 등) ⑦ `updated_at` 조건 갱신(0행이면 409, 구역이 «사용자에게 보일 거절»(`rejected`)로 답하면 그 문장 그대로 400) ⑧ 변경 이력 한 줄.
 * 이력을 쓰지 못하면 방금 갱신을 이전 값으로 되돌린다. 되돌리기까지 실패하면 로그에 남기고 오류로 답한다. 응답에는 DB 오류 원문을 싣지 않는다.
 *
 * 입력은 HTTP 본문이라 `unknown`으로 받아 여기서 확인한다. 서비스 클라이언트는 인자로 받는다(시험은 가짜를 넘긴다).
 */
import { checkFieldValue, diffValues } from './fields'
import { HISTORY_DEFAULT_LIMIT, NOTE_MAX_LENGTH, listBalanceHistory, writeBalanceHistory, type BalanceHistoryEntry } from './history'
import type { BalanceChange, BalanceSectionBinding, BalanceServiceClient, BalanceSnapshot, BalanceValues } from './types'

const LOG = '[admin/balance]'

export const BALANCE_CONFLICT_MESSAGE = '다른 사람이 먼저 바꿨어요. 새로 불러온 뒤 다시 바꿔 주세요.'
export const BALANCE_NO_CHANGE_MESSAGE = '바뀐 값이 없어요.'
export const BALANCE_INVALID_MESSAGE = '값을 확인해 주세요.'
export const BALANCE_NOTE_TOO_LONG_MESSAGE = `메모는 ${NOTE_MAX_LENGTH}자까지 쓸 수 있어요.`
export const BALANCE_STAMP_MISSING_MESSAGE = '설정의 수정 시각이 필요해요. 화면을 새로 불러온 뒤 다시 저장해 주세요.'
export const BALANCE_SAVE_FAILED_MESSAGE = '설정을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
export const BALANCE_HISTORY_FAILED_MESSAGE = '변경 이력을 남기지 못해 저장을 취소했어요. 잠시 뒤 다시 시도해 주세요.'
export const BALANCE_ROLLBACK_FAILED_MESSAGE =
  '값은 바뀌었지만 변경 이력을 남기지 못했고 되돌리지도 못했어요. 화면을 새로 불러와 값을 확인하고 개발자에게 알려 주세요.'
export const BALANCE_SECTION_NOT_FOUND_MESSAGE = '찾을 수 없는 구역이에요. 주소의 구역 이름을 확인해 주세요.'
export const BALANCE_LOAD_FAILED_MESSAGE = '설정을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'

export interface SaveBalanceInput {
  binding: BalanceSectionBinding
  /** 바꿀 칸의 새 값(칸 이름 → 숫자). 바뀌지 않은 칸을 함께 보내도 된다(서버가 바뀐 칸만 가린다). */
  values: unknown
  /** 화면이 읽은 때의 `updated_at`. */
  expectedUpdatedAt: unknown
  /** 변경 메모(선택, 200자). */
  note?: unknown
  /** 바꾼 어드민의 `users.id`. */
  actor: string
}

export type SaveBalanceOutcome =
  | {
      ok: true
      /** 저장 뒤의 구역 전체 값. */
      values: BalanceValues
      updatedAt: string
      changes: BalanceChange[]
      affectsDisclosure: boolean
    }
  | { ok: false; status: 400 | 409 | 500; error: string; fieldErrors?: Record<string, string> }

function fail(status: 400 | 409 | 500, error: string, fieldErrors?: Record<string, string>): SaveBalanceOutcome {
  return { ok: false, status, error, ...(fieldErrors && Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}) }
}

/** 메모를 정리한다. 없거나 공백뿐이면 `null`, 글자가 아니거나 너무 길면 `'invalid'`. */
function normalizeNote(note: unknown): string | null | 'invalid' {
  if (note === undefined || note === null) return null
  if (typeof note !== 'string') return 'invalid'
  const trimmed = note.trim()
  if (trimmed === '') return null
  return trimmed.length > NOTE_MAX_LENGTH ? 'invalid' : trimmed
}

/** 본문의 `values`를 칸마다 검사한다. 모르는 칸·숫자가 아닌 값·범위 밖 값은 칸별 문장으로 모은다. */
function validateValues(
  binding: BalanceSectionBinding,
  input: unknown
): { values: BalanceValues; errors: Record<string, string>; shapeError: string | null } {
  const values: BalanceValues = {}
  const errors: Record<string, string> = {}
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { values, errors, shapeError: '바꿀 값을 칸 이름과 숫자로 보내 주세요.' }
  }
  const byKey = new Map(binding.fields.map((def) => [def.key, def]))
  for (const [key, raw] of Object.entries(input)) {
    const def = byKey.get(key)
    if (!def) {
      errors[key] = '알 수 없는 칸이에요.'
      continue
    }
    if (typeof raw !== 'number') {
      errors[key] = '숫자로 입력해 주세요.'
      continue
    }
    const message = checkFieldValue(def, raw) ?? (binding.validators?.[key]?.(raw) === false ? '이 값은 쓸 수 없어요. 범위를 확인해 주세요.' : null)
    if (message) errors[key] = message
    else values[key] = raw
  }
  return { values, errors, shapeError: null }
}

export async function saveBalanceSection(service: BalanceServiceClient, input: SaveBalanceInput): Promise<SaveBalanceOutcome> {
  const { binding, actor } = input

  if (typeof input.expectedUpdatedAt !== 'string' || input.expectedUpdatedAt === '') return fail(400, BALANCE_STAMP_MISSING_MESSAGE)
  const expectedUpdatedAt = input.expectedUpdatedAt

  const note = normalizeNote(input.note)
  if (note === 'invalid') return fail(400, BALANCE_NOTE_TOO_LONG_MESSAGE)

  const checked = validateValues(binding, input.values)
  if (checked.shapeError) return fail(400, checked.shapeError)
  if (Object.keys(checked.errors).length > 0) return fail(400, BALANCE_INVALID_MESSAGE, checked.errors)

  let current: BalanceSnapshot
  try {
    current = await binding.read(service)
  } catch (e) {
    console.error(`${LOG} ${binding.id} 현재 값 조회 실패:`, e instanceof Error ? e.message : e)
    return fail(500, BALANCE_SAVE_FAILED_MESSAGE)
  }
  if (current.updatedAt !== expectedUpdatedAt) return fail(409, BALANCE_CONFLICT_MESSAGE)

  const changes = diffValues(binding.fields, current.values, checked.values)
  if (changes.length === 0) return fail(400, BALANCE_NO_CHANGE_MESSAGE)

  const merged: BalanceValues = { ...current.values }
  for (const change of changes) merged[change.field] = change.to
  const togetherErrors = binding.validateTogether?.(merged) ?? {}
  if (Object.keys(togetherErrors).length > 0) return fail(400, BALANCE_INVALID_MESSAGE, togetherErrors)

  const changedValues: BalanceValues = Object.fromEntries(changes.map((change) => [change.field, change.to]))
  const written = await binding.write(service, {
    values: changedValues,
    expectedUpdatedAt,
    nextUpdatedAt: new Date().toISOString(),
  })
  if (!written.ok) {
    if (written.reason === 'conflict') return fail(409, BALANCE_CONFLICT_MESSAGE)
    // 구역이 «사용자에게 보일 거절»로 답한 경우: 그 문장을 그대로 400으로 돌려준다(시스템 오류가 아니라 로그를 더 남기지 않는다)
    if (written.reason === 'rejected') return fail(400, written.message)
    console.error(`${LOG} ${binding.id} 저장 실패:`, written.message)
    return fail(500, BALANCE_SAVE_FAILED_MESSAGE)
  }

  const affectsDisclosure = changes.some((change) => binding.fields.find((def) => def.key === change.field)?.affectsDisclosure === true)
  const history = await writeBalanceHistory(service, { sectionKey: binding.id, changes, note, affectsDisclosure, actor })
  if (!history.ok) {
    // 이력 없이 값만 바뀐 채로 두지 않는다. 방금 쓴 값을 이전 값으로 돌리고 수정 시각도 읽었던 때로 되돌린다.
    const rolledBack = await binding.write(service, {
      values: Object.fromEntries(changes.map((change) => [change.field, change.from])),
      expectedUpdatedAt: written.updatedAt,
      nextUpdatedAt: current.updatedAt,
    })
    if (!rolledBack.ok) {
      console.error(
        `${LOG} ${binding.id} 이력 쓰기 실패 뒤 되돌리기도 실패 — 값만 바뀌어 있을 수 있다:`,
        JSON.stringify(changes),
        rolledBack.reason === 'conflict' ? rolledBack.reason : rolledBack.message
      )
      return fail(500, BALANCE_ROLLBACK_FAILED_MESSAGE)
    }
    return fail(500, BALANCE_HISTORY_FAILED_MESSAGE)
  }

  return { ok: true, values: merged, updatedAt: written.updatedAt, changes, affectsDisclosure }
}

export interface LoadedBalanceSection extends BalanceSnapshot {
  /** 최근 변경. 이력을 읽지 못하면 `null`(값은 그대로 보여 주고 이력 칸만 오류로 둔다). */
  history: BalanceHistoryEntry[] | null
}

/**
 * 구역의 현재 값과 최근 변경을 읽는다. **값을 읽지 못하면 던진다**(구역 화면은 오류 카드로, 라우트는 500으로 받는다).
 * 이력만 못 읽으면 던지지 않고 `history: null`이다.
 */
export async function loadBalanceSection(
  service: BalanceServiceClient,
  binding: BalanceSectionBinding,
  historyLimit: number = HISTORY_DEFAULT_LIMIT
): Promise<LoadedBalanceSection> {
  const snapshot = await binding.read(service)
  let history: BalanceHistoryEntry[] | null = null
  try {
    history = await listBalanceHistory(service, binding.id, historyLimit)
  } catch (e) {
    console.error(`${LOG} ${binding.id} 변경 이력 조회 실패:`, e instanceof Error ? e.message : e)
  }
  return { ...snapshot, history }
}
