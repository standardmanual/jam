/**
 * 생태계 상황판 화면 시험의 고정 입력 (티켓 20261026_2027 3-1)
 *
 * 정상·주의·중단·부족·읽지 못함·목표 없음 여섯 상태를 모두 담은 스냅샷이다. 실제 DB 값이 아니다.
 */
import { ECOSYSTEM_NODES } from '@/lib/admin/ecosystem/nodes'
import type { EcosystemNodeId, EcosystemSnapshot, GoalPart, GoalRow, NodeIndicator, NodeStatus } from '@/lib/admin/ecosystem/types'

export const GENERATED_AT = '2026-10-27T06:30:00.000Z' // 2026.10.27 15:30 KST

/** 마디별 고정 상태와 대표 값 */
const NODE_FIXTURE: Record<EcosystemNodeId, Partial<NodeIndicator> & { statusKind: NodeStatus }> = {
  sync: {
    statusKind: 'no_target',
    headline: { label: '동기화된 활동 건수', value: 1234, unit: 'count' },
    sub: { label: '동기화 실패 건수', value: 2, unit: 'count' },
  },
  jam: {
    statusKind: 'no_target',
    headline: { label: '지급된 잼 합계', value: 0, unit: 'jam' },
    sub: { label: '쓴 잼 합계', value: 40, unit: 'jam' },
  },
  capsule: {
    statusKind: 'stop',
    headline: { label: '캡슐 여는 속도 (챕터 1)', value: 0.5, unit: 'per_week' },
    sample: { value: 30, unit: 'user' },
  },
  item_badge: {
    statusKind: 'warn',
    headline: { label: '월간 아이템 배지 (동기화)', value: 9, unit: 'count_30d' },
    sample: { value: 30, unit: 'user' },
  },
  inventory: {
    statusKind: 'ok',
    headline: { label: '인벤토리 가득 참 (가득 찬 비율)', value: 0.1, unit: 'ratio' },
    sample: { value: 30, unit: 'user' },
  },
  collection: {
    statusKind: 'insufficient',
    headline: { label: '컬렉션 완성 속도 (첫 컬렉션)', value: null, unit: 'per_month' },
    shortfall: { reason: 'sample', sample: 3, minSample: 10, unit: 'user' },
  },
  system_drop: {
    statusKind: 'error',
    headline: { label: '놓인 시스템 드랍 건수', value: null, unit: 'count' },
    message: '지표를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.',
  },
  user_drop: { statusKind: 'no_target', headline: { label: '놓인 유저 드랍 건수', value: 3, unit: 'count' } },
  checkin_point: {
    statusKind: 'no_target',
    headline: { label: '켜진 지점 수', value: 2063, unit: 'count' },
    sub: { label: '배지가 연결된 지점 수', value: 1836, unit: 'count' },
  },
  pickup: { statusKind: 'no_target', headline: { label: '주워 간 드랍 건수', value: 0, unit: 'count' } },
}

export function fixtureNodes(): NodeIndicator[] {
  return ECOSYSTEM_NODES.map((def) => {
    const fixture = NODE_FIXTURE[def.id]
    return {
      id: def.id,
      label: def.label,
      loop: def.loop,
      periodText: '최근 7일',
      policyIds: [],
      headline: { label: def.label, value: null, unit: 'count' },
      ...fixture,
    }
  })
}

function part(partId: string, overrides: Partial<GoalPart>): GoalPart {
  return {
    partId,
    label: '챕터 1',
    value: 1,
    unit: 'per_week',
    targetText: '주 1~2번',
    status: 'ok',
    marker: { scaleMax: 4, low: 0.25, high: 0.5, value: 0.3 },
    ...overrides,
  }
}

/** 일부러 중단·주의·정상·부족·읽지 못함 순서를 섞어 둔다(정렬 시험) */
export function fixtureGoalRows(): GoalRow[] {
  return [
    { policyId: 'ch19-kpi-ok', title: '정상 정책', status: 'ok', parts: [part('a:1', {})] },
    {
      policyId: 'ch19-kpi-insufficient',
      title: '부족 정책',
      status: 'insufficient',
      parts: [
        part('b:1', {
          value: null,
          status: 'insufficient',
          marker: null,
          shortfall: { reason: 'sample', sample: 3, minSample: 10, unit: 'user' },
        }),
        part('b:2', {
          value: null,
          status: 'insufficient',
          marker: null,
          shortfall: { reason: 'period', sample: 0, minSample: 10, unit: 'user' },
        }),
      ],
    },
    {
      policyId: 'ch19-kpi-stop',
      title: '중단 정책',
      status: 'stop',
      parts: [part('c:1', { value: 0.5, status: 'stop', marker: { scaleMax: 4, low: 0.25, high: 0.5, value: 0.125 } })],
    },
    { policyId: 'ch19-kpi-error', title: '읽지 못함 정책', status: 'error', parts: [] },
    {
      policyId: 'ch19-kpi-warn',
      title: '주의 정책',
      status: 'warn',
      parts: [part('d:1', { value: 3, status: 'warn', marker: { scaleMax: 3.3, low: 0.3, high: 0.6, value: 0.91 } })],
    },
    {
      policyId: 'ch19-kpi-no-target',
      title: '목표 없음 정책',
      status: 'no_target',
      parts: [part('e:1', { status: 'no_target', targetText: null, marker: null })],
    },
  ]
}

export function fixtureSnapshot(): EcosystemSnapshot {
  return {
    generatedAt: GENERATED_AT,
    nodes: fixtureNodes(),
    goalRows: fixtureGoalRows(),
    attentionCount: 2,
    errorCount: 2,
  }
}
