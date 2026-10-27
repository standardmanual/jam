/**
 * 마디와 정책의 연결, 목표 대비 행 만들기 (티켓 20261026_2027 2회차, PRD admin-boards §7)
 *
 * 정책 대시보드 항목(`PolicyItem.nodes`)에서 마디별 정책 목록을 묶고, 밸런스 목표 정책 5개를 밸런스 읽기 결과와 이어 목표 대비 행으로 만든다.
 *
 * 순수 모듈이다. 서버 모듈을 값으로 가져오지 않는다.
 */
import type { BalanceDashboardData } from '@/lib/admin/balanceDashboard/types'
import { METRIC_SPECS, partSpec } from '@/lib/admin/balanceDashboard/targets'
import type { PolicyItem } from '@/lib/admin/policyDashboard/types'
import { GOAL_POLICY_LINKS } from './nodes'
import { markerOf, statusOfPart, worstStatus } from './status'
import type { EcosystemNodeId, GoalPart, GoalRow, NodeStatus } from './types'

/**
 * 마디의 정책을 [값 바꾸기] 대상(`admin_link`), [개발 요청] 대상(`code_constant`), 그 밖으로 묶는다.
 * 묶음 안의 순서는 `policies`의 순서다
 */
export interface NodePolicyGroups {
  /** 설정 화면에서 값을 바꾸는 정책 */
  changeable: readonly PolicyItem[]
  /** 코드에 고정돼 개발 요청으로 바꾸는 정책 */
  codeFixed: readonly PolicyItem[]
  /** 티켓 결정·오픈 전 대기 */
  other: readonly PolicyItem[]
}

export function policiesOfNode(policies: readonly PolicyItem[], nodeId: EcosystemNodeId): NodePolicyGroups {
  const ofNode = policies.filter((policy) => policy.nodes?.includes(nodeId) === true)
  return {
    changeable: ofNode.filter((policy) => policy.type === 'admin_link'),
    codeFixed: ofNode.filter((policy) => policy.type === 'code_constant'),
    other: ofNode.filter((policy) => policy.type !== 'admin_link' && policy.type !== 'code_constant'),
  }
}

/** 마디가 하나도 없는 정책. 3회차 화면이 「순환 밖」으로 보인다 */
export function policiesOutsideLoop(policies: readonly PolicyItem[]): PolicyItem[] {
  return policies.filter((policy) => (policy.nodes?.length ?? 0) === 0)
}

/**
 * 밸런스 목표 정책 5개의 목표 대비 행. 정책마다 연결된 지표(`GOAL_POLICY_LINKS`)의 칸을 모두 담는다.
 * 읽지 못한 지표는 `error` 상태 하나로 세고(칸은 없다), 행 상태는 모든 상태 중 가장 나쁜 것이다(`worstStatus`: 중단 > 주의 > 읽지 못함 > 부족 > 정상).
 * 정책이 카탈로그에 없으면 지표 제목을 행 제목으로 쓴다
 */
export function goalRowsOf(balanceData: BalanceDashboardData, policies: readonly PolicyItem[]): GoalRow[] {
  return GOAL_POLICY_LINKS.map(({ policyId, metricKeys }) => {
    const title =
      policies.find((policy) => policy.id === policyId)?.title ?? METRIC_SPECS[metricKeys[0]].title
    const parts: GoalPart[] = []
    const statuses: NodeStatus[] = []
    for (const key of metricKeys) {
      const result = balanceData.metrics.find((metric) => metric.key === key)
      if (result === undefined || result.status === 'error') {
        statuses.push('error')
        continue
      }
      for (const part of result.parts) {
        const spec = partSpec(key, part.id)
        const status = statusOfPart(part, spec)
        statuses.push(status)
        const measurement = part.measurement
        const value = measurement.status === 'ready' ? measurement.value : null
        parts.push({
          partId: `${key}:${part.id}`,
          label: spec.label,
          value,
          unit: spec.unit,
          ...(measurement.status === 'ready' ? { sample: { value: measurement.sample, unit: measurement.sampleUnit } } : {}),
          targetText: spec.target?.text ?? null,
          status,
          marker: value !== null && spec.target !== null ? markerOf(value, spec.target) : null,
        })
      }
    }
    return { policyId, title, status: worstStatus(statuses), parts }
  })
}
