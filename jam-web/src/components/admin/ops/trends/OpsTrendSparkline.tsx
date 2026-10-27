import { MAX_TREND_SERIES_POINTS } from '@/lib/admin/opsInbox/constants'

/**
 * 트렌드 추이 막대 (티켓 20261026_2033 2회차). 최근 14일 값(`series`)을 14칸 막대로 그린다.
 *
 * SVG 속성만으로 그린다(`style` 속성을 쓰지 않는다). 값이 14개보다 적으면 오른쪽(최근)부터 채운다.
 * 막대 높이는 가장 큰 값을 100%로 한 비율이고, 0 이하의 값은 바닥에 얇은 선만 남는다.
 */

const WIDTH = 84
const HEIGHT = 24
const GAP = 1
const SLOT_WIDTH = (WIDTH - GAP * (MAX_TREND_SERIES_POINTS - 1)) / MAX_TREND_SERIES_POINTS
const MIN_BAR = 1

export function sparklineBars(series: readonly number[]): Array<{ x: number; y: number; width: number; height: number }> {
  const max = Math.max(...series, 0)
  const offset = MAX_TREND_SERIES_POINTS - series.length
  return series.map((value, index) => {
    const ratio = max > 0 ? Math.max(value, 0) / max : 0
    const height = Math.max(MIN_BAR, Math.round(ratio * HEIGHT * 100) / 100)
    return {
      x: Math.round((offset + index) * (SLOT_WIDTH + GAP) * 100) / 100,
      y: Math.round((HEIGHT - height) * 100) / 100,
      width: Math.round(SLOT_WIDTH * 100) / 100,
      height,
    }
  })
}

export function OpsTrendSparkline({ series, label }: { series: readonly number[]; label: string }) {
  const bars = sparklineBars(series)
  return (
    <svg
      role="img"
      aria-label={`${label} 최근 ${MAX_TREND_SERIES_POINTS}일 추이`}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      className="shrink-0 text-primary"
    >
      {bars.map((bar, index) => (
        <rect key={index} x={bar.x} y={bar.y} width={bar.width} height={bar.height} fill="currentColor" rx={0.5} />
      ))}
    </svg>
  )
}
