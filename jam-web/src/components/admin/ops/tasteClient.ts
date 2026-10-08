/**
 * 취향 신호 확정·공통 규칙 고치기·근거 후보 읽기 호출 (티켓 20261008_1754, 상위 20260930_1503 ⑩b-2).
 *
 * - `PATCH /api/admin/ops-patterns/taste-signals/[signalId]` (본문 `{ reason, evidenceDecisionId, expectedUpdatedAt }`)
 * - `PATCH /api/admin/ops-patterns/common-rules/[ruleNo]` (본문 `{ title, body, expectedUpdatedAt }`)
 * - `GET /api/admin/ops-patterns/[patternNo]/rejections?offset=`
 *
 * `patternClient.ts`처럼 **던지지 않고** 결과를 돌려준다 — 실패는 상태 코드(409)와 칸별 문장(400의 `fieldErrors`)까지 알아야 한다.
 * `expectedUpdatedAt`은 서버가 준 문자열을 **가공하지 않고 그대로** 싣는다(`Date`로 바꿨다 되돌리면 자릿수가 달라져 매번 409가 된다).
 */
import { NETWORK_ERROR_MESSAGE } from '@/components/admin/data-table/admin-fetch'
import type { OpsCommonRuleRecord, OpsTasteSignalRecord } from '@/lib/admin/opsPatterns/read'
import type { CommonRuleSaveBody, TasteSaveBody } from '@/lib/admin/opsPatterns/tasteDraft'
import type { OpsPatternRejectionRecord, OpsPatternRejectionsResult } from '@/lib/admin/opsPatterns/tasteWrite'

type Failure = {
  ok: false
  status: number
  error: string
  /** 400: 칸 경로(`reason`·`evidenceDecisionId`·`title`·`body`) → 화면에 보일 문장. */
  fieldErrors: Record<string, string>
}

export type TasteSignalSaveResponse = { ok: true; signal: OpsTasteSignalRecord; changed: boolean } | Failure
export type CommonRuleSaveResponse = { ok: true; rule: OpsCommonRuleRecord; changed: boolean } | Failure
export type RejectionsResponse = ({ ok: true } & OpsPatternRejectionsResult) | Failure

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

function failure(res: Response, data: Record<string, unknown>): Failure {
  const error = typeof data.error === 'string' && data.error ? data.error : FALLBACK_ERROR
  return { ok: false, status: res.status, error, fieldErrors: stringRecord(data.fieldErrors) }
}

const NETWORK_FAILURE: Failure = { ok: false, status: 0, error: NETWORK_ERROR_MESSAGE, fieldErrors: {} }

async function patch(url: string, body: unknown): Promise<{ res: Response; data: Record<string, unknown> } | null> {
  let res: Response
  try {
    res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    return null
  }
  return { res, data: asRecord(await res.json().catch(() => null)) }
}

/** 취향 신호 확정·고치기. 본문은 `tasteSaveBody`가 만든 것을 그대로 보낸다. */
export async function saveTasteSignalRequest(signalId: string, body: TasteSaveBody): Promise<TasteSignalSaveResponse> {
  const sent = await patch(`/api/admin/ops-patterns/taste-signals/${encodeURIComponent(signalId)}`, body)
  if (sent === null) return NETWORK_FAILURE
  const { res, data } = sent
  if (res.ok && typeof data.signal === 'object' && data.signal !== null) {
    return { ok: true, signal: data.signal as OpsTasteSignalRecord, changed: data.changed === true }
  }
  return failure(res, data)
}

/** 공통 규칙 고치기. */
export async function saveCommonRuleRequest(ruleNo: number, body: CommonRuleSaveBody): Promise<CommonRuleSaveResponse> {
  const sent = await patch(`/api/admin/ops-patterns/common-rules/${encodeURIComponent(String(ruleNo))}`, body)
  if (sent === null) return NETWORK_FAILURE
  const { res, data } = sent
  if (res.ok && typeof data.rule === 'object' && data.rule !== null) {
    return { ok: true, rule: data.rule as OpsCommonRuleRecord, changed: data.changed === true }
  }
  return failure(res, data)
}

/** 근거 후보(이 패턴 항목의 반려 기록) 한 쪽. `offset`은 이미 받은 건수다. */
export async function fetchPatternRejectionsRequest(patternNo: string, offset: number): Promise<RejectionsResponse> {
  let res: Response
  try {
    res = await fetch(`/api/admin/ops-patterns/${encodeURIComponent(patternNo)}/rejections?offset=${offset}`)
  } catch {
    return NETWORK_FAILURE
  }
  const data = asRecord(await res.json().catch(() => null))
  if (res.ok && Array.isArray(data.rejections)) {
    const rejections = data.rejections as OpsPatternRejectionRecord[]
    return { ok: true, rejections, hasMore: data.hasMore === true, total: typeof data.total === 'number' ? data.total : rejections.length }
  }
  return failure(res, data)
}
