/**
 * 생태계 상황판의 타입 (티켓 20261026_2027 2회차, PRD admin-boards §7)
 *
 * 타입만 있다(마디 키 목록 상수 하나만 값이다). 계산(`status.ts`·`fieldMetrics.ts`·`policyLinks.ts`), 읽기(`load.ts`), 3회차 화면이 같은 모양을 쓴다.
 * 글자(값을 단위와 함께 풀어 쓴 문장)는 화면이 만든다. 이 모듈은 값과 단위를 구조로 돌려준다.
 */
import type { InsufficientReason, SampleUnit, ValueUnit } from '@/lib/admin/balanceDashboard/types'

/** 순환 마디 10개의 키. 순서가 화면에 보이는 순서다(성장 순환, 필드 순환) */
export const ECOSYSTEM_NODE_IDS = [
  'sync',
  'jam',
  'capsule',
  'item_badge',
  'inventory',
  'collection',
  'system_drop',
  'user_drop',
  'checkin_point',
  'pickup',
] as const

export type EcosystemNodeId = (typeof ECOSYSTEM_NODE_IDS)[number]

export type EcosystemLoop = 'growth' | 'field'

/**
 * 상태.
 * - `ok` 정상, `warn` 주의, `stop` 중단
 * - `insufficient` 표본이 모자라 값을 내지 못함, `error` 읽기에 실패함
 * - `no_target` 목표가 없어 값만 보임
 */
export type NodeStatus = 'ok' | 'warn' | 'stop' | 'insufficient' | 'error' | 'no_target'

/** 표본이 모자란(`insufficient`) 밸런스 칸의 사유. 화면이 «표본 N/M명»·«관찰 기간이 모자라요»를 만든다(티켓 20261026_2027 3-1) */
export interface Shortfall {
  reason: InsufficientReason
  /** 지금 센 표본 */
  sample: number
  /** 값을 내려면 필요한 표본 */
  minSample: number
  unit: SampleUnit
}

/** 대표 지표의 값 단위. 밸런스 지표는 `ValueUnit`을 그대로 쓰고, 이 회차의 새 지표는 개수(`count`)와 잼(`jam`)이다 */
export type HeadlineUnit = ValueUnit | 'count' | 'jam'

export interface NodeHeadline {
  /** 지표 이름(예: «동기화된 활동 건수», «챕터 1») */
  label: string
  /** 값. 값을 내지 못하면(`insufficient`·`error`) `null` */
  value: number | null
  unit: HeadlineUnit
}

export interface NodeSubValue {
  label: string
  value: number
  unit: HeadlineUnit
}

export interface NodeIndicator {
  id: EcosystemNodeId
  label: string
  loop: EcosystemLoop
  statusKind: NodeStatus
  headline: NodeHeadline
  /** 보조 값(실패 건수, 쓴 잼, 연결된 지점 수). 없으면 비운다 */
  sub?: NodeSubValue
  /** 기간 글자(예: «최근 7일»). 계산식의 기간을 그대로 적은 고정 문장이다 */
  periodText: string
  /** 값을 낸 표본(밸런스 지표만). 글자는 화면이 만든다 */
  sample?: { value: number; unit: SampleUnit }
  /** 대표 칸이 표본 부족일 때의 사유(밸런스 지표만) */
  shortfall?: Shortfall
  /** 읽기에 실패한 마디(`error`)에만 있는 고정 문장. DB 오류 원문은 싣지 않는다 */
  message?: string
  /** 이 마디에 연결된 정책 ID. 3회차 화면이 정책 패널을 열 때 쓴다 */
  policyIds: readonly string[]
}

/** 목표 표시선 위치. 눈금은 0부터 `scaleMax`까지고 `low`·`high`·`value`는 0~1 비율이다 */
export interface TargetMarker {
  scaleMax: number
  low: number
  high: number
  value: number
}

export interface GoalPart {
  partId: string
  label: string
  /** 측정값. 값을 내지 못하면 `null` */
  value: number | null
  unit: ValueUnit
  sample?: { value: number; unit: SampleUnit }
  /** 표본이 모자랄 때의 사유 */
  shortfall?: Shortfall
  /** 목표 문장(`targets.ts`의 `text`). 목표가 없으면 `null` */
  targetText: string | null
  status: NodeStatus
  /** 값이 있고 목표가 있을 때만 */
  marker: TargetMarker | null
}

export interface GoalRow {
  policyId: string
  title: string
  /** 연결된 밸런스 지표를 읽지 못했으면 `error`, 아니면 칸 상태 중 가장 나쁜 것 */
  status: NodeStatus
  parts: readonly GoalPart[]
}

export interface EcosystemSnapshot {
  generatedAt: string
  /** `ECOSYSTEM_NODES` 순서의 마디 10개. 읽기가 실패해도 항상 10개다 */
  nodes: readonly NodeIndicator[]
  goalRows: readonly GoalRow[]
  /** 목표 대비 행 중 주의 + 중단의 수(읽지 못함은 섞지 않는다). 목표가 있는 마디는 모두 목표 대비 행에 있다 */
  attentionCount: number
  /** 읽지 못한 수: 목표 대비 행 + 밸런스 지표를 쓰지 않는 마디(같은 읽기 실패를 두 번 세지 않는다) */
  errorCount: number
}
