/**
 * 결정 요청 호출 (티켓 20260930_1818) — `POST /api/admin/ops-inbox/[bundleId]/decisions`.
 *
 * 화면 부품(승인·반려·일괄 승인·수정·되돌리기)이 같은 호출을 쓴다. `requestJson`은 실패를 메시지 문자열로만 던져서 상태 코드와
 * 칸별 문장(400의 `fieldErrors`)을 알 수 없으므로 따로 둔다. **던지지 않고** 결과를 돌려준다.
 *
 * 요청 순서(fetch → 네트워크 오류 → JSON 읽기 → 오류 문장)는 `postOpsJson` 한 곳에 있고, 결정 요청(`postDecision`)·예약 등록 요청(`postExecute`)·
 * 공개 전 취소 요청(`postCancel`, `executeClient.ts`)이 그 위에서 주소와 본문만 다르게 부른다(티켓 20261002_1649).
 */
import { NETWORK_ERROR_MESSAGE } from '@/components/admin/data-table/admin-fetch'

export type DecisionRequest =
  | { action: 'approve'; itemId: string }
  | { action: 'reject'; itemId: string; reason: string }
  | { action: 'bulk_approve'; itemIds: string[] }
  | { action: 'edit'; itemId: string; values: Record<string, string>; reason?: string; expectedUpdatedAt: string }
  | { action: 'revert'; itemId: string }
  | { action: 'fill_color'; itemId: string; bg: string; end: string; expectedUpdatedAt: string }

export type DecisionResponse =
  | { ok: true; data: Record<string, unknown> }
  | {
      ok: false
      status: number
      error: string
      /** 400: 고친 칸별 문장(경로 → 문장). */
      fieldErrors: Record<string, string>
      data: Record<string, unknown>
    }

/** 서버 문장이 없을 때 쓰는 고정 문장. 예약 등록 호출(`executeClient.ts`)도 같은 문장을 쓴다. */
export const FALLBACK_ERROR = '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.'

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function stringRecord(value: unknown): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(asRecord(value))) {
    if (typeof entry === 'string') result[key] = entry
  }
  return result
}

/**
 * 실패 문장. 409는 그 사이 다른 곳에서 처리했다는 뜻이라 화면을 새로 불러왔다고 덧붙인다(호출한 쪽이 `router.refresh()`를 한다).
 */
export function decisionFailureMessage(status: number, error: string): string {
  return status === 409 ? `${error} 화면을 새로 불러왔어요.` : error
}

/**
 * 단건 승인이 끝났을 때의 토스트 문장(티켓 20261008_1845). 패턴 제안을 승인하면 응답에 `pattern`(사전에 넣은 번호)이나 `patternSkipped: 'sample'`(시험 묶음이라 안 넣음)이 실려 온다.
 * 패턴 제안이 아닌 승인은 그 칸이 없어 지금과 같은 「승인했어요」다.
 */
export function approveToastMessage(data: Record<string, unknown>): string {
  const patternNo = asRecord(data.pattern).patternNo
  if (typeof patternNo === 'string' && patternNo !== '') return `승인했어요. 패턴 사전에 ${patternNo}로 넣었어요`
  if (data.patternSkipped === 'sample') return '승인했어요. 시험 묶음이라 패턴 사전에는 넣지 않았어요'
  return '승인했어요'
}

/** 운영툴 요청의 결과. 네트워크가 끊겨 응답을 받지 못했으면 `status`는 0이다. 실패의 `error`는 화면에 그대로 보일 수 있는 문장이다. */
export type OpsJsonResponse =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; error: string; data: Record<string, unknown> }

/**
 * 운영툴 API에 JSON 본문을 POST한다. **던지지 않는다.** 서버 문장이 없으면 고정 문장(`FALLBACK_ERROR`)이고,
 * 409는 `decisionFailureMessage`가 「화면을 새로 불러왔어요」를 덧붙인다(호출한 쪽이 `router.refresh()`를 한다). 서버가 함께 실은 값은 `data`에 남는다.
 */
export async function postOpsJson(url: string, body: unknown): Promise<OpsJsonResponse> {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR_MESSAGE, data: {} }
  }

  const data = asRecord(await res.json().catch(() => null))
  if (res.ok) return { ok: true, data }
  const error = typeof data.error === 'string' && data.error ? data.error : FALLBACK_ERROR
  return { ok: false, status: res.status, error: decisionFailureMessage(res.status, error), data }
}

export async function postDecision(bundleId: string, body: DecisionRequest): Promise<DecisionResponse> {
  const result = await postOpsJson(`/api/admin/ops-inbox/${bundleId}/decisions`, body)
  if (result.ok) return result
  return { ...result, fieldErrors: stringRecord(result.data.fieldErrors) }
}
