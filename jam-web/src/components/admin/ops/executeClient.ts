/**
 * 예약 등록·공개 전 취소·공개 뒤 지금 종료 요청 호출 (티켓 20261002_1648 ⑤-a, 20261002_1649 ⑤-b, 20261006_1038 ⑪-b).
 *
 * - `postExecute` — `POST /api/admin/ops-inbox/[bundleId]/execute`. 사전 점검(`{ dryRun: true }`, 쓰기 없음)·배지 미리 세기(`{ badgePreview: true }`, 쓰기 없음, 티켓 20261005_1607)·실행(`{ itemIds }`)이 같은 호출을 쓴다.
 *   셋 모두 `approve: true`를 함께 보내면 검토중 항목도 대상이 되고 실행은 먼저 승인한 뒤 예약한다(「승인하고 예약」, 티켓 20261026_2031·2022).
 * - `postCancel` — `POST /api/admin/ops-inbox/[bundleId]/items/[itemId]/cancel`. 미리 보기(`{ dryRun: true }`, 쓰기 없음)와 취소(`{ reason? }`)가 같은 호출을 쓴다.
 * - `postEnd` — `POST /api/admin/ops-inbox/[bundleId]/items/[itemId]/end`. 미리 보기(`{ dryRun: true }`, 쓰기 없음)와 지금 종료(`{ reason? }`)가 같은 호출을 쓴다.
 *
 * 모두 `postDecision`(`decisionClient.ts`)처럼 **던지지 않고** 상태 코드와 서버 문장을 결과로 돌려준다(요청 순서는 `postOpsJson` 한 곳이다).
 * 409는 그사이 다른 곳에서 처리했다는 뜻이라 화면을 새로 불러왔다고 덧붙인다(호출한 쪽이 `router.refresh()`를 한다).
 */
import { badgePreviewLines, readBadgePreview, type BadgePreviewSection, type SummarySource } from '@/lib/admin/opsInbox/executeView'
import { postOpsJson, type OpsJsonResponse } from './decisionClient'

export type ExecuteRequest = { dryRun: true; approve?: true } | { badgePreview: true; approve?: true } | { itemIds: string[]; approve?: true }

export type ExecuteResponse = OpsJsonResponse

export function postExecute(bundleId: string, body: ExecuteRequest): Promise<ExecuteResponse> {
  return postOpsJson(`/api/admin/ops-inbox/${bundleId}/execute`, body)
}

/**
 * 요약창의 JAM! 배지 구역을 채운다(티켓 20261005_1607 ⑨-b). 배지 미리 세기(`{ badgePreview: true }`)를 따로 요청하고 응답을 구역 상태로 바꾼다.
 * 던지지 않는다 — 요청이 실패하거나 응답을 읽을 수 없으면 `failed`다(요약창과 주 버튼은 이 결과와 무관하다). 읽기 전용 요청이다.
 */
export async function fetchBadgePreview(
  bundleId: string,
  items: readonly SummarySource[],
  /** 주어지면 이 항목의 줄만 싣는다. `approve: true` 미리 세기는 검토중 항목 전부를 세므로, 체크하지 않은 배지는 여기서 거른다. */
  onlyItemIds?: ReadonlySet<string>
): Promise<Exclude<BadgePreviewSection, { status: 'loading' }>> {
  const result = await postExecute(bundleId, { badgePreview: true, approve: true })
  const view = result.ok ? readBadgePreview(result.data) : null
  if (!view) return { status: 'failed' }
  const scoped = onlyItemIds ? { ...view, lines: view.lines.filter((line) => onlyItemIds.has(line.itemId)) } : view
  return { status: 'done', ...badgePreviewLines(scoped, items) }
}

/** 미리 보기(`{ dryRun: true }`)이거나 취소(`{ reason? }`). 사유는 선택이고 서버가 앞뒤 공백을 떼고 500자까지 받는다. */
export type CancelRequest = { dryRun: true } | { reason?: string }

export type CancelResponse = OpsJsonResponse

export function postCancel(bundleId: string, itemId: string, body: CancelRequest): Promise<CancelResponse> {
  return postOpsJson(`/api/admin/ops-inbox/${bundleId}/items/${itemId}/cancel`, body)
}

/** 미리 보기(`{ dryRun: true }`)이거나 지금 종료(`{ reason? }`). 사유는 선택이고 서버가 앞뒤 공백을 떼고 500자까지 받는다. */
export type EndRequest = { dryRun: true } | { reason?: string }

export type EndResponse = OpsJsonResponse

export function postEnd(bundleId: string, itemId: string, body: EndRequest): Promise<EndResponse> {
  return postOpsJson(`/api/admin/ops-inbox/${bundleId}/items/${itemId}/end`, body)
}
