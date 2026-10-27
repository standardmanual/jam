/**
 * 생태계 상황판 화면용 순수 함수 (티켓 20261026_2027 3-1, PRD admin-boards §7)
 *
 * 목표 대비 줄 정렬, `?node=` 해석, 요약 줄 개수, 정책별 열린 개발 요청 찾기. 서버 모듈을 값으로 가져오지 않는다.
 */
import { ECOSYSTEM_NODE_IDS, type EcosystemNodeId, type EcosystemSnapshot, type GoalRow, type NodeStatus } from './types'

/** 목표 대비 줄을 위로 올리는 순서. 앞일수록 위에 선다(중단 → 주의 → 읽지 못함 → 부족 → 정상 → 목표 없음) */
const GOAL_ROW_ORDER: readonly NodeStatus[] = ['stop', 'warn', 'error', 'insufficient', 'ok', 'no_target']

/** 상태가 나쁜 줄이 위로 온다. 같은 상태는 원래 순서를 지킨다. 원본은 바꾸지 않는다 */
export function sortGoalRows(rows: readonly GoalRow[]): GoalRow[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => GOAL_ROW_ORDER.indexOf(a.row.status) - GOAL_ROW_ORDER.indexOf(b.row.status) || a.index - b.index)
    .map(({ row }) => row)
}

/** `?node=` 값을 마디 ID로 읽는다. 허용 밖 값(없음·빈 값·모르는 키)은 `null`, 곧 선택 없음이다 */
export function parseNodeParam(value: string | null | undefined): EcosystemNodeId | null {
  if (value === null || value === undefined) return null
  return (ECOSYSTEM_NODE_IDS as readonly string[]).includes(value) ? (value as EcosystemNodeId) : null
}

/** 요약 줄 「주의 이상 N · 읽지 못함 M」의 두 수. 스냅샷이 이미 센 값을 그대로 쓴다 */
export function summaryOf(snapshot: Pick<EcosystemSnapshot, 'attentionCount' | 'errorCount'>): {
  attention: number
  errors: number
} {
  return { attention: snapshot.attentionCount, errors: snapshot.errorCount }
}

export interface OpenRequestRef {
  id: string
  no: number
}

/**
 * 정책 ID → 열린 개발 요청. 정책 ID가 없는 요청은 건너뛰고, 같은 정책에 둘이면 번호가 큰 것을 쓴다
 * (1회차가 같은 정책의 열린 요청을 막으므로 보통 하나지만, 막기 전에 만든 행이 있어도 화면이 한쪽으로 정해지게 한다)
 */
export function openRequestByPolicy(
  requests: readonly { id: string; no: number; policyId: string | null }[]
): Map<string, OpenRequestRef> {
  const byPolicy = new Map<string, OpenRequestRef>()
  for (const request of requests) {
    if (request.policyId === null) continue
    const current = byPolicy.get(request.policyId)
    if (current === undefined || request.no > current.no) byPolicy.set(request.policyId, { id: request.id, no: request.no })
  }
  return byPolicy
}
