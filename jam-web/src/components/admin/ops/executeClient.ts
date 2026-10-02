/**
 * 예약 등록·공개 전 취소 요청 호출 (티켓 20261002_1648 ⑤-a, 20261002_1649 ⑤-b).
 *
 * - `postExecute` — `POST /api/admin/ops-inbox/[bundleId]/execute`. 사전 점검(`{ dryRun: true }`, 쓰기 없음)과 실행(`{ itemIds }`)이 같은 호출을 쓴다.
 * - `postCancel` — `POST /api/admin/ops-inbox/[bundleId]/items/[itemId]/cancel`. 미리 보기(`{ dryRun: true }`, 쓰기 없음)와 취소(`{ reason? }`)가 같은 호출을 쓴다.
 *
 * 둘 다 `postDecision`(`decisionClient.ts`)처럼 **던지지 않고** 상태 코드와 서버 문장을 결과로 돌려준다(요청 순서는 `postOpsJson` 한 곳이다).
 * 409는 그사이 다른 곳에서 처리했다는 뜻이라 화면을 새로 불러왔다고 덧붙인다(호출한 쪽이 `router.refresh()`를 한다).
 */
import { postOpsJson, type OpsJsonResponse } from './decisionClient'

export type ExecuteRequest = { dryRun: true } | { itemIds: string[] }

export type ExecuteResponse = OpsJsonResponse

export function postExecute(bundleId: string, body: ExecuteRequest): Promise<ExecuteResponse> {
  return postOpsJson(`/api/admin/ops-inbox/${bundleId}/execute`, body)
}

/** 미리 보기(`{ dryRun: true }`)이거나 취소(`{ reason? }`). 사유는 선택이고 서버가 앞뒤 공백을 떼고 500자까지 받는다. */
export type CancelRequest = { dryRun: true } | { reason?: string }

export type CancelResponse = OpsJsonResponse

export function postCancel(bundleId: string, itemId: string, body: CancelRequest): Promise<CancelResponse> {
  return postOpsJson(`/api/admin/ops-inbox/${bundleId}/items/${itemId}/cancel`, body)
}
