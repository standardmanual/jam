/**
 * 목표 대비 구역 (티켓 20261026_2027 3-1, PRD admin-boards §7)
 *
 * 밸런스 목표 정책 5개마다 칸별 현재 값·목표 글자·상태와 목표 표시선 막대를 보인다. **주의·중단 줄이 맨 위**로 올라온다(`sortGoalRows`).
 * 값이 없는 칸(표본 부족)은 막대 없이 「부족」과 사유만 보이고, 읽지 못한 정책은 고정 문장만 보인다.
 * 상태가 없는 서버·클라이언트 공용 컴포넌트다.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import type { GoalPart, GoalRow } from '@/lib/admin/ecosystem/types'
import { sortGoalRows } from '@/lib/admin/ecosystem/view'
import { formatHeadlineValue, formatShortfall, GOAL_ROW_ERROR_TEXT, NO_VALUE_TEXT } from './format'
import { GoalBar } from './GoalBar'
import { StatusMark } from './StatusMark'

function PartLine({ part }: { part: GoalPart }) {
  const valueText = formatHeadlineValue(part.unit, part.value)
  const targetText = part.targetText ?? '목표 없음'
  return (
    <li data-part-id={part.partId} data-status={part.status} className="space-y-1.5 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium break-keep wrap-break-word">{part.label}</p>
        <StatusMark status={part.status} />
      </div>
      <p className="text-sm text-muted-foreground break-keep wrap-break-word">
        현재 <span className="font-semibold tabular-nums text-foreground">{valueText}</span>
        <span aria-hidden="true"> · </span>
        목표 {targetText}
      </p>
      {part.marker !== null ? (
        <GoalBar marker={part.marker} status={part.status} label={`${part.label}: 현재 ${valueText}, 목표 ${targetText}`} />
      ) : part.status === 'insufficient' ? (
        <p data-shortfall="" className="text-xs text-muted-foreground break-keep wrap-break-word">
          부족{part.shortfall ? ` · ${formatShortfall(part.shortfall)}` : ''}
        </p>
      ) : null}
    </li>
  )
}

function GoalRowCard({ row }: { row: GoalRow }) {
  return (
    <li data-policy-id={row.policyId} data-status={row.status}>
      <Card className="min-w-0">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1 space-y-0">
          <CardTitle role="heading" aria-level={3} className="text-base leading-snug text-balance break-keep wrap-break-word">
            {row.title}
          </CardTitle>
          <StatusMark status={row.status} />
        </CardHeader>
        <CardContent>
          {row.parts.length === 0 ? (
            <p className="text-sm text-muted-foreground break-keep wrap-break-word">
              {row.status === 'error' ? GOAL_ROW_ERROR_TEXT : NO_VALUE_TEXT}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {row.parts.map((part) => (
                <PartLine key={part.partId} part={part} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </li>
  )
}

export function EcosystemGoalRows({ rows }: { rows: readonly GoalRow[] }) {
  return (
    <section aria-labelledby="eco-goal-heading" className="space-y-3">
      <div>
        <h2 id="eco-goal-heading" className="text-base font-semibold text-foreground">
          목표 대비
        </h2>
        <p className="mt-1 text-xs text-muted-foreground text-pretty break-keep wrap-break-word">
          밸런스 목표와 지금 값을 견줘요. 주의·중단은 위에 모여요
        </p>
      </div>
      <ul className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
        {sortGoalRows(rows).map((row) => (
          <GoalRowCard key={row.policyId} row={row} />
        ))}
      </ul>
    </section>
  )
}
