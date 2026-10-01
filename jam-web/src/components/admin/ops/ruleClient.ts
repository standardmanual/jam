/**
 * 운영 규칙 요청 호출 (티켓 20260930_1459 조각 B) — `PATCH /api/admin/ops-rules/[ruleKey]`, `GET /api/admin/ops-rules`.
 *
 * 설정 화면의 규칙 카드가 쓴다. `requestJson`은 실패를 메시지 문자열로만 던져서 상태 코드(409)와 칸별 문장(400의 `fieldErrors`)을 알 수 없으므로
 * `decisionClient.ts`처럼 따로 둔다. **던지지 않고** 결과를 돌려준다.
 */
import { NETWORK_ERROR_MESSAGE } from '@/components/admin/data-table/admin-fetch'
import type { OpsRuleRecord } from '@/lib/admin/opsInbox/balance/rules'

export interface RulePatchRequest {
  value?: unknown
  level?: 'info' | 'warn'
  enabled?: boolean
  /** 화면이 본 규칙의 수정 시각. 그사이 바뀌었으면 409다. */
  expectedUpdatedAt: string
}

export type RulePatchResponse =
  | { ok: true; rule: OpsRuleRecord; changed: boolean }
  | {
      ok: false
      status: number
      error: string
      /** 400: 칸 경로 → 문장(`max`·`kinds.mission.max`·`provisional` 등). */
      fieldErrors: Record<string, string>
    }

export type RuleListResponse = { ok: true; rules: OpsRuleRecord[] } | { ok: false; status: number; error: string }

const FALLBACK_ERROR = '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.'

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function stringRecord(value: unknown): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(asRecord(value))) {
    if (typeof entry === 'string') result[key] = entry
  }
  return result
}

function errorOf(data: Record<string, unknown>): string {
  return typeof data.error === 'string' && data.error ? data.error : FALLBACK_ERROR
}

export async function patchOpsRule(ruleKey: string, body: RulePatchRequest): Promise<RulePatchResponse> {
  let res: Response
  try {
    res = await fetch(`/api/admin/ops-rules/${encodeURIComponent(ruleKey)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR_MESSAGE, fieldErrors: {} }
  }

  const data = asRecord(await res.json().catch(() => null))
  if (res.ok && typeof data.rule === 'object' && data.rule !== null) {
    return { ok: true, rule: data.rule as OpsRuleRecord, changed: data.changed === true }
  }
  return { ok: false, status: res.status, error: errorOf(data), fieldErrors: stringRecord(data.fieldErrors) }
}

/** 규칙 목록을 다시 읽는다(충돌 뒤 「최신 값 불러오기」). */
export async function fetchOpsRules(group: 'balance' | 'signal' = 'balance'): Promise<RuleListResponse> {
  let res: Response
  try {
    res = await fetch(`/api/admin/ops-rules?group=${group}`, { method: 'GET', cache: 'no-store' })
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR_MESSAGE }
  }
  const data = asRecord(await res.json().catch(() => null))
  if (res.ok && Array.isArray(data.rules)) return { ok: true, rules: data.rules as OpsRuleRecord[] }
  return { ok: false, status: res.status, error: errorOf(data) }
}
