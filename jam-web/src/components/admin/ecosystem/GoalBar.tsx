/**
 * 목표 표시선 막대 (티켓 20261026_2027 3-1)
 *
 * 눈금은 0부터 `scaleMax`까지고 `TargetMarker`의 `low`·`high`·`value`는 0~1 비율이다. SVG의 `x`·`width`에 `%` 속성으로 넣어
 * 인라인 `style` 없이 위치를 잡는다. 목표 범위는 옅은 띠, 현재 값은 세로 표시선이다. 값이 눈금 밖이어도 끝에 붙게 0~1로 자른다.
 */
import type { NodeStatus, TargetMarker } from '@/lib/admin/ecosystem/types'

/** 목표가 한 점(`low === high`)이어도 보이게 하는 띠의 최소 너비(%) */
const MIN_BAND_PERCENT = 1.5
/** 현재 값 표시선의 너비(%) */
const VALUE_TICK_PERCENT = 1.5

const VALUE_FILL: Record<NodeStatus, string> = {
  stop: 'fill-red-600',
  warn: 'fill-amber-500',
  error: 'fill-orange-600',
  insufficient: 'fill-slate-400',
  ok: 'fill-emerald-600',
  no_target: 'fill-slate-400',
}

function clampPercent(ratio: number): number {
  // 소수 둘째 자리까지만 쓴다(속성값에 부동소수 꼬리가 붙지 않게)
  return Math.round(Math.min(100, Math.max(0, ratio * 100)) * 100) / 100
}

/** 시험하려고 내보낸다: 막대 위 요소의 `x`·`width`(%) */
export function barGeometry(marker: TargetMarker): {
  band: { x: number; width: number }
  value: { x: number; width: number }
} {
  const bandX = clampPercent(marker.low)
  const bandWidth = Math.max(MIN_BAND_PERCENT, clampPercent(marker.high) - bandX)
  const valueX = Math.min(100 - VALUE_TICK_PERCENT, Math.max(0, clampPercent(marker.value) - VALUE_TICK_PERCENT / 2))
  return {
    band: { x: Math.min(bandX, 100 - bandWidth), width: bandWidth },
    value: { x: valueX, width: VALUE_TICK_PERCENT },
  }
}

export interface GoalBarProps {
  marker: TargetMarker
  status: NodeStatus
  /** 스크린 리더용 설명(예: «현재 주 1.2번, 목표 주 1~2번») */
  label: string
}

export function GoalBar({ marker, status, label }: GoalBarProps) {
  const { band, value } = barGeometry(marker)
  return (
    <svg role="img" aria-label={label} className="h-3 w-full" data-goal-bar="" preserveAspectRatio="none">
      <rect x="0%" y="4" width="100%" height="4" rx="2" className="fill-slate-200" />
      <rect data-part="target" x={`${band.x}%`} y="2" width={`${band.width}%`} height="8" className="fill-emerald-200" />
      <rect data-part="value" x={`${value.x}%`} y="0" width={`${value.width}%`} height="12" className={VALUE_FILL[status]} />
    </svg>
  )
}
