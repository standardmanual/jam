/**
 * 규칙 읽기·저장 (티켓 20260930_1459 조각 B). 설정 화면(S7)의 서버 컴포넌트와 `GET·PATCH /api/admin/ops-rules`가 쓴다.
 *
 * 저장은 **조건부 update**다 — 화면이 본 수정 시각(`expectedUpdatedAt`)과 같을 때만 쓰고, 0행이면 그사이 다른 곳에서 바뀐 것이라 409다
 * (두 탭에서 같은 규칙을 바꿔도 늦게 저장한 쪽이 앞선 변경을 덮어쓰지 않는다). 값이 바뀌면 이전 값을 `previous_value`에 넣고, 저장할 때마다
 * `updated_by`(관리자 ID)·`updated_at`을 채운다. 「직전 값으로 되돌리기」는 화면이 직전 값을 새 값으로 보내는 같은 저장이다.
 *
 * 입력은 HTTP 본문이라 `unknown`으로 받아 여기서 확인한다(값은 `rules.ts`의 `validateRuleValue`가 칸별로 확인한다). 서비스 클라이언트는
 * 인자로 받는다(테스트는 가짜를 넘긴다). 규칙 키는 밸런스 규칙 8개만 받는다 — 신호 기준값(조각 C)은 같은 테이블에 들어오지만 검증이 다르다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.generated'
import {
  BALANCE_LEVELS,
  BALANCE_RULE_KEYS,
  OPS_RULE_GROUPS,
  OPS_RULE_RECORD_COLUMNS,
  isBalanceRuleKey,
  toRuleRecord,
  validateRuleValue,
  type BalanceLevel,
  type OpsRuleRecord,
  type RuleFieldErrors,
} from './rules'

type ServiceClient = ReturnType<typeof createServiceClient>

const LOG = '[admin/ops-rules]'

export const RULE_CONFLICT_MESSAGE = '그사이 다른 곳에서 이 규칙이 바뀌었어요. 최신 값을 불러온 뒤 다시 바꿔 주세요.'
export const RULE_NOT_FOUND_MESSAGE = '찾을 수 없는 규칙이에요.'
export const RULE_SAVE_FAILED_MESSAGE = '규칙을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
export const RULE_LOAD_FAILED_MESSAGE = '규칙을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'

export type OpsRuleGroup = (typeof OPS_RULE_GROUPS)[number]

export function isOpsRuleGroup(value: unknown): value is OpsRuleGroup {
  return typeof value === 'string' && (OPS_RULE_GROUPS as readonly string[]).includes(value)
}

function logError(what: string, error: { message: string } | null | undefined) {
  console.error(`${LOG} ${what}:`, error?.message ?? 'unknown')
}

/**
 * 한 묶음(`rule_group`)의 규칙을 읽는다. 밸런스 규칙은 8개 규칙의 순서(화면·평가 결과와 같다)로, 그 밖에는 키 순서로 돌려준다.
 * 조회 오류는 던진다(호출한 쪽이 구역 오류나 500으로 받는다).
 */
export async function listOpsRules(service: ServiceClient, group: OpsRuleGroup): Promise<OpsRuleRecord[]> {
  const { data, error } = await service.from('ops_rules').select(OPS_RULE_RECORD_COLUMNS).eq('rule_group', group)
  if (error) throw new Error(`규칙 조회 실패: ${error.message}`)
  const order = (key: string) => {
    const index = (BALANCE_RULE_KEYS as readonly string[]).indexOf(key)
    return index === -1 ? BALANCE_RULE_KEYS.length : index
  }
  return (data ?? [])
    .map(toRuleRecord)
    .sort((a, b) => order(a.ruleKey) - order(b.ruleKey) || a.ruleKey.localeCompare(b.ruleKey))
}

// ── 저장 ────────────────────────────────────────────────────────────────────────────────────────

export interface SaveRuleInput {
  ruleKey: string
  /** 바꿀 값. 없으면(`undefined`) 값은 그대로 둔다. R6·R7·R8은 값을 바꿀 수 없다. */
  value?: unknown
  level?: unknown
  enabled?: unknown
  /** 화면이 본 규칙의 수정 시각. 그사이 바뀌었으면 409다. */
  expectedUpdatedAt: unknown
  /** 바꾼 관리자의 ID. */
  actor: string
}

export type SaveRuleOutcome =
  | {
      ok: true
      rule: OpsRuleRecord
      /** 실제로 바뀐 것이 있었는지. 모두 현재 값과 같으면 쓰지 않고 현재 규칙을 그대로 돌려준다. */
      changed: boolean
    }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string; fieldErrors?: RuleFieldErrors }

function fail(status: 400 | 404 | 409 | 500, error: string, fieldErrors?: RuleFieldErrors): SaveRuleOutcome {
  return { ok: false, status, error, ...(fieldErrors ? { fieldErrors } : {}) }
}

/** 키 순서와 상관없이 같은 값인지 견주기 위한 글. */
function canonicalJson(value: Json | null | undefined): string {
  if (value === null || value === undefined) return 'null'
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`
  if (typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function isLevel(value: unknown): value is BalanceLevel {
  return typeof value === 'string' && (BALANCE_LEVELS as readonly string[]).includes(value)
}

export async function saveOpsRule(service: ServiceClient, input: SaveRuleInput): Promise<SaveRuleOutcome> {
  const { ruleKey, actor } = input
  if (!isBalanceRuleKey(ruleKey)) return fail(404, RULE_NOT_FOUND_MESSAGE)

  if (typeof input.expectedUpdatedAt !== 'string' || input.expectedUpdatedAt === '') {
    return fail(400, '규칙의 수정 시각이 필요해요. 화면을 새로 고쳐 주세요.')
  }
  const expectedUpdatedAt = input.expectedUpdatedAt

  if (input.value === undefined && input.level === undefined && input.enabled === undefined) {
    return fail(400, '바꿀 내용이 없어요.')
  }
  if (input.level !== undefined && !isLevel(input.level)) return fail(400, '경고 수준은 주의나 참고로 정해 주세요.')
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') return fail(400, '켜기는 켜짐이나 꺼짐으로 정해 주세요.')

  let newValue: Json | undefined
  if (input.value !== undefined) {
    const checked = validateRuleValue(ruleKey, input.value)
    if (!checked.ok) return fail(400, '값을 확인해 주세요.', checked.fieldErrors)
    newValue = checked.value
  }

  const current = await service
    .from('ops_rules')
    .select(OPS_RULE_RECORD_COLUMNS)
    .eq('rule_key', ruleKey)
    .eq('rule_group', 'balance')
    .maybeSingle()
  if (current.error) {
    logError('규칙 조회 실패', current.error)
    return fail(500, RULE_SAVE_FAILED_MESSAGE)
  }
  if (!current.data) return fail(404, RULE_NOT_FOUND_MESSAGE)
  const before = toRuleRecord(current.data)
  if (before.updatedAt !== expectedUpdatedAt) return fail(409, RULE_CONFLICT_MESSAGE)

  const valueChanged = newValue !== undefined && canonicalJson(newValue) !== canonicalJson(before.value)
  const levelChanged = input.level !== undefined && input.level !== before.level
  const enabledChanged = input.enabled !== undefined && input.enabled !== before.enabled
  if (!valueChanged && !levelChanged && !enabledChanged) return { ok: true, rule: before, changed: false }

  const update: {
    updated_at: string
    updated_by: string
    value?: Json
    previous_value?: Json | null
    level?: BalanceLevel
    enabled?: boolean
  } = { updated_at: new Date().toISOString(), updated_by: actor }
  if (valueChanged) {
    update.value = newValue
    update.previous_value = before.value
  }
  if (levelChanged) update.level = input.level as BalanceLevel
  if (enabledChanged) update.enabled = input.enabled as boolean

  const updated = await service
    .from('ops_rules')
    .update(update)
    .eq('rule_key', ruleKey)
    .eq('rule_group', 'balance')
    .eq('updated_at', expectedUpdatedAt)
    .select(OPS_RULE_RECORD_COLUMNS)
  if (updated.error) {
    logError('규칙 저장 실패', updated.error)
    return fail(500, RULE_SAVE_FAILED_MESSAGE)
  }
  const row = updated.data?.[0]
  if (!row) return fail(409, RULE_CONFLICT_MESSAGE)
  return { ok: true, rule: toRuleRecord(row), changed: true }
}
