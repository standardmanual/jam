/**
 * 생태계 상황판의 요약 줄 「주의 이상 N · 읽지 못함 M」 (티켓 20261026_2027 3-1)
 *
 * PRD §7의 「상단 바 숫자」를 만들지 않고 이 줄에 개수를 쓴다(어드민에 상단 바 숫자가 없고, 숫자를 달면 모든 화면이 매번 지표를 읽는다).
 * 읽지 못함은 주의로 섞지 않고 따로 센다. 0보다 크면 기호(▲·!)를 앞에 붙여 색 없이도 눈에 띄게 한다.
 */
import { formatKstYmdHm } from '@/lib/admin/kst-format'

export interface EcosystemSummaryProps {
  attention: number
  errors: number
  generatedAt: string
}

export function EcosystemSummary({ attention, errors, generatedAt }: EcosystemSummaryProps) {
  return (
    <div data-testid="ecosystem-summary" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span
        data-count="attention"
        className={`font-semibold break-keep wrap-break-word ${attention > 0 ? 'text-amber-700' : 'text-foreground'}`}
      >
        {attention > 0 ? <span aria-hidden="true">▲ </span> : null}주의 이상 {attention}
      </span>
      <span aria-hidden="true" className="text-muted-foreground">
        ·
      </span>
      <span
        data-count="errors"
        className={`font-semibold break-keep wrap-break-word ${errors > 0 ? 'text-orange-700' : 'text-foreground'}`}
      >
        {errors > 0 ? <span aria-hidden="true">! </span> : null}읽지 못함 {errors}
      </span>
      <span className="text-xs text-muted-foreground break-keep wrap-break-word">{formatKstYmdHm(generatedAt)} 기준</span>
    </div>
  )
}
