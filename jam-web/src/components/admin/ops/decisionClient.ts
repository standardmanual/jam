/**
 * 결정 요청 호출 (티켓 20260930_1818) — `POST /api/admin/ops-inbox/[bundleId]/decisions`.
 *
 * 화면 부품(승인·반려·일괄 승인·수정·되돌리기)이 같은 호출을 쓴다. `requestJson`은 실패를 메시지 문자열로만 던져서 상태 코드와
 * 칸별 문장(400의 `fieldErrors`)을 알 수 없으므로 따로 둔다. **던지지 않고** 결과를 돌려준다.
 */
import { NETWORK_ERROR_MESSAGE } from '@/components/admin/data-table/admin-fetch'

export type DecisionRequest =
  | { action: 'approve'; itemId: string }
  | { action: 'reject'; itemId: string; reason: string }
  | { action: 'bulk_approve'; itemIds: string[] }
  | { action: 'edit'; itemId: string; values: Record<string, string>; reason?: string; expectedUpdatedAt: string }
  | { action: 'revert'; itemId: string }

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

export async function postDecision(bundleId: string, body: DecisionRequest): Promise<DecisionResponse> {
  let res: Response
  try {
    res = await fetch(`/api/admin/ops-inbox/${bundleId}/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR_MESSAGE, fieldErrors: {}, data: {} }
  }

  const data = asRecord(await res.json().catch(() => null))
  if (res.ok) return { ok: true, data }
  const error = typeof data.error === 'string' && data.error ? data.error : FALLBACK_ERROR
  return { ok: false, status: res.status, error: decisionFailureMessage(res.status, error), fieldErrors: stringRecord(data.fieldErrors), data }
}
