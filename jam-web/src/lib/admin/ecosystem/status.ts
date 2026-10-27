/**
 * 생태계 상황판의 상태 규칙 (티켓 20261026_2027 2회차, PRD admin-boards §7)
 *
 * 칸마다 목표와 견줘 상태를 정하고(`statusOfPart`), 마디 상태는 칸 상태 중 가장 나쁜 것으로 한다(`worstStatus`).
 *
 * - 목표 안이면 «정상»(`ok`)이다.
 * - 목표 밖이면 «주의»(`warn`)다. 목표 한계(값이 가까운 쪽 끝)에서 벗어난 폭이 그 한계값의 `STOP_DEVIATION_RATIO` 이상이면 «중단»(`stop`)이다.
 *   한계값이 0이면 벗어나는 순간 «중단»이다.
 * - 표본이 모자라면 `insufficient`, 읽기에 실패하면 `error`, 목표가 없는 칸은 `no_target`이다.
 * - 나쁜 순서: 중단 > 주의 > 읽지 못함 > 부족 > 정상. `no_target`은 순서에 끼지 않고 값만 보인다(칸이 전부 `no_target`일 때만 마디가 `no_target`).
 *
 * 순수 모듈이다. 서버 모듈을 값으로 가져오지 않는다.
 */
import { compareToTarget, DISPLAY_DIGITS } from '@/lib/admin/balanceDashboard/fit'
import { partSpec } from '@/lib/admin/balanceDashboard/targets'
import type { MetricPart, MetricPartSpec, MetricResult, PartTarget } from '@/lib/admin/balanceDashboard/types'
import { STOP_DEVIATION_RATIO } from './nodes'
import type { NodeStatus, TargetMarker } from './types'

/** 부동소수 오차(0.3 − 0.2 = 0.0999…)로 경계 값이 반대편에 떨어지지 않게 하는 여유 */
const RATIO_EPSILON = 1e-9

/** 나쁜 정도. 클수록 나쁘다. `no_target`은 0이라 어떤 상태보다 뒤에 선다 */
const SEVERITY: Record<NodeStatus, number> = {
  stop: 5,
  warn: 4,
  error: 3,
  insufficient: 2,
  ok: 1,
  no_target: 0,
}

/** 칸 하나의 상태. 칸 정의(`spec`)의 목표와 단위로 견준다 */
export function statusOfPart(part: MetricPart, spec: MetricPartSpec): NodeStatus {
  if (part.measurement.status === 'insufficient') return 'insufficient'
  if (spec.target === null) return 'no_target'

  const value = part.measurement.value
  const fit = compareToTarget(spec.unit, value, spec.target)
  if (fit === 'within') return 'ok'

  // 견줄 때와 같이 보이는 자릿수로 맞춘 값으로 벗어난 폭을 잰다
  const shown = Number(value.toFixed(DISPLAY_DIGITS[spec.unit]))
  const limit = fit === 'below' ? spec.target.low : spec.target.high
  const deviation = fit === 'below' ? limit - shown : shown - limit
  if (limit === 0) return 'stop'
  return deviation / limit >= STOP_DEVIATION_RATIO - RATIO_EPSILON ? 'stop' : 'warn'
}

/** 밸런스 지표 하나의 상태. 읽기 실패는 `error`, 칸이 없거나 전부 목표가 없으면 `no_target` */
export function statusOfMetric(result: MetricResult): NodeStatus {
  if (result.status === 'error') return 'error'
  return worstStatus(result.parts.map((part) => statusOfPart(part, partSpec(result.key, part.id))))
}

/** 가장 나쁜 상태. 목록이 비면 `no_target` */
export function worstStatus(list: readonly NodeStatus[]): NodeStatus {
  let worst: NodeStatus = 'no_target'
  for (const status of list) {
    if (SEVERITY[status] > SEVERITY[worst]) worst = status
  }
  return worst
}

/** 대표 칸을 고르려고 칸과 그 상태를 묶은 것 */
export interface EvaluatedPart<T> {
  item: T
  status: NodeStatus
}

/** 가장 나쁜 칸. 상태가 같으면 먼저 나온 칸이다. 목록이 비면 `null` */
export function pickHeadlinePart<T>(parts: readonly EvaluatedPart<T>[]): EvaluatedPart<T> | null {
  let picked: EvaluatedPart<T> | null = null
  for (const part of parts) {
    if (picked === null || SEVERITY[part.status] > SEVERITY[picked.status]) picked = part
  }
  return picked
}

/**
 * 목표 표시선 위치. 눈금은 0부터 `max(target.high × 2, value × 1.1)`까지다(값이 목표 위로 멀리 벗어나도 눈금 안에 든다).
 * 눈금 끝이 0이 되는 경우(목표 상한 0, 값 0)는 1로 둔다.
 */
export function markerOf(value: number, target: PartTarget): TargetMarker {
  const scaleMax = Math.max(target.high * 2, value * 1.1) || 1
  return {
    scaleMax,
    low: target.low / scaleMax,
    high: target.high / scaleMax,
    value: value / scaleMax,
  }
}

/** 「주의 이상」 개수: 주의와 중단의 합. 읽지 못함은 따로 센다 */
export function attentionCount(statuses: readonly NodeStatus[]): number {
  return statuses.filter((status) => status === 'warn' || status === 'stop').length
}

/** 읽지 못한 개수 */
export function errorCount(statuses: readonly NodeStatus[]): number {
  return statuses.filter((status) => status === 'error').length
}
