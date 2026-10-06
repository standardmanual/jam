'use client'

import type { ReactNode } from 'react'
import { IconInfoCircle } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/admin/ui/popover'
import { OPS_ITEM_STATUSES } from '@/lib/admin/opsInbox/constants'
import type { OpsSignalLevel } from '@/lib/admin/opsSignals/catalog'
import { OpsStatusBadge } from './OpsStatusBadge'

/**
 * 상태 아이콘 범례 (티켓 20261006_1538 ③-c, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4 「상태 아이콘 보기」·승인 항목 11).
 *
 * 좁은 월간 칸과 타임라인 막대는 상태를 아이콘만 보이므로(글자는 화면 읽기용 `sr-only`), [상태 아이콘 보기]를 누르면 아이콘과 글자를 짝지어 보여 준다.
 * 항목 상태 10개, 시험, 신호 수준 3개를 **실제 칩 그대로** 그린다 — 칩 부품(`OpsStatusBadge`)이 같은 글자·아이콘을 만들므로 범례가 화면과 어긋나지 않는다.
 * 눌러서 여는 작은 창(Popover)이고 그림자가 없다. 버튼 높이는 컨테이너 40rem 이상 40px, 미만 44px(채원 판정 「버튼 데스크톱 `h-10`, 40rem 미만 `h-11`」)다.
 */

export const STATUS_LEGEND_BUTTON_LABEL = '상태 아이콘 보기'
export const STATUS_LEGEND_TITLE = '상태 아이콘의 뜻'

const SIGNAL_LEVELS: readonly OpsSignalLevel[] = ['stop', 'warn', 'info']

function LegendGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">{title}</h3>
      <ul className="flex flex-wrap gap-1.5">{children}</ul>
    </section>
  )
}

export function OpsStatusLegend({ className }: { className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={className ?? 'h-11 @[40rem]:h-10'}>
          <IconInfoCircle className="size-4" aria-hidden="true" />
          {STATUS_LEGEND_BUTTON_LABEL}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label={STATUS_LEGEND_TITLE} className="w-[min(22rem,calc(100vw-2rem))] space-y-3 shadow-none">
        <p className="text-sm font-medium">{STATUS_LEGEND_TITLE}</p>
        <LegendGroup title="항목 상태">
          {OPS_ITEM_STATUSES.map((status) => (
            <li key={status}>
              <OpsStatusBadge type="item" status={status} />
            </li>
          ))}
          <li>
            <OpsStatusBadge type="sample" />
          </li>
        </LegendGroup>
        <LegendGroup title="신호">
          {SIGNAL_LEVELS.map((level) => (
            <li key={level}>
              <OpsStatusBadge type="signal" level={level} />
            </li>
          ))}
        </LegendGroup>
      </PopoverContent>
    </Popover>
  )
}
