/**
 * 예약 등록 요청 호출 (티켓 20261002_1648) — `POST /api/admin/ops-inbox/[bundleId]/execute`.
 *
 * 사전 점검(`{ dryRun: true }`, 쓰기 없음)과 실행(`{ itemIds }`)이 같은 호출을 쓴다. `postDecision`(`decisionClient.ts`)처럼 **던지지 않고**
 * 상태 코드와 서버 문장을 결과로 돌려준다. 409는 그사이 다른 곳에서 처리했다는 뜻이라 화면을 새로 불러왔다고 덧붙인다(호출한 쪽이
 * `router.refresh()`를 한다). 공개 전 취소 요청은 이 파일에 뒤 조각(⑤-b)이 더한다.
 */
import { NETWORK_ERROR_MESSAGE } from '@/components/admin/data-table/admin-fetch'
import { FALLBACK_ERROR, asRecord, decisionFailureMessage } from './decisionClient'

export type ExecuteRequest = { dryRun: true } | { itemIds: string[] }

export type ExecuteResponse =
  | { ok: true; data: Record<string, unknown> }
  | {
      ok: false
      /** 네트워크가 끊겨 응답을 받지 못했으면 0. */
      status: number
      error: string
      data: Record<string, unknown>
    }

export async function postExecute(bundleId: string, body: ExecuteRequest): Promise<ExecuteResponse> {
  let res: Response
  try {
    res = await fetch(`/api/admin/ops-inbox/${bundleId}/execute`, {
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
