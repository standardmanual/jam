/**
 * 밸런스 지표 화면의 본문 (티켓 20261022_1136 1회 b, 운영 로직 19.2절)
 *
 * 읽기(`loadBalanceDashboard`)가 돌려준 지표 6개를 순서대로 카드로 그린다. 읽기와 인가는 화면(`app/admin/balance/dashboard/page.tsx`)이 맡고,
 * 이 컴포넌트는 받은 값을 그리기만 한다. 지표 하나를 읽지 못하면 그 카드만 오류 카드가 되고 나머지는 그대로 보인다(`MetricCard`).
 */
import type { BalanceDashboardData } from '@/lib/admin/balanceDashboard/types'
import { formatKstYmdHm } from '@/lib/admin/kst-format'
import { MetricCard } from './MetricCard'

export interface BalanceDashboardViewProps {
  data: BalanceDashboardData
  /** 구역 키 → 구역 이름(`BALANCE_SECTIONS`의 `label`) */
  sectionLabels: Readonly<Record<string, string>>
}

export function BalanceDashboardView({ data, sectionLabels }: BalanceDashboardViewProps) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground break-keep wrap-break-word">{formatKstYmdHm(data.generatedAt)} 기준</p>
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        {data.metrics.map((result) => (
          <MetricCard key={result.key} result={result} sectionLabels={sectionLabels} />
        ))}
      </div>
    </div>
  )
}
