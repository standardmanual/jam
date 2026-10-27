import { cn } from '@/lib/utils'
import type { AgentRow, WeekStripDay } from '@/lib/admin/opsBoard/agentRows'
import { StateLabel } from './screenStateStyle'

/**
 * 운영 상황판의 에이전트 줄과 이번 주 일정 띠 (티켓 20261026_2023 2회차, 어드민 상황판 PRD §6.5). 훅이 없는 서버 컴포넌트다.
 *
 * 에이전트 네 줄: 이름·역할, 「지금 하는 일 또는 마지막 결과」 한 줄, 화면 상태(점·글자), 다음 실행 예정. 계산은 `agentRowsOf`가 한다.
 * 일정 띠: 월~일 7칸에 화(기획)·수(결정 마감)·목(공개)을 표시하고 오늘은 굵은 테두리와 「오늘」 글자로 알린다(`weekStripOf`).
 */

const TEXT_CLASS = 'break-keep wrap-break-word'

function AgentLine({ row }: { row: AgentRow }) {
  return (
    <li className="grid grid-cols-[8rem_minmax(0,1fr)_auto_6rem] items-center gap-x-3 py-2">
      <p className={cn('truncate text-sm', TEXT_CLASS)}>
        <span className="font-semibold">{row.name}</span>
        <span className="text-muted-foreground">{` · ${row.role}`}</span>
      </p>
      <p className={cn('truncate text-sm text-foreground', TEXT_CLASS)} title={row.line}>
        {row.line}
      </p>
      <span className="min-w-20">{row.screenState && <StateLabel state={row.screenState} />}</span>
      <p className="whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">{row.nextRun}</p>
    </li>
  )
}

function StripCell({ day }: { day: WeekStripDay }) {
  return (
    <li
      aria-current={day.isToday ? 'date' : undefined}
      className={cn(
        'flex min-h-16 flex-col items-center gap-0.5 rounded-md border px-1 py-2 text-center',
        day.isToday ? 'border-2 border-primary' : 'border-border'
      )}
    >
      <span className="text-xs text-muted-foreground">{day.weekday}</span>
      <span className="text-sm font-semibold tabular-nums">{day.day}</span>
      {day.isToday && <span className="text-[11px] font-medium whitespace-nowrap">오늘</span>}
      {day.marker && <span className={cn('text-[11px] leading-tight text-foreground', TEXT_CLASS)}>{day.marker}</span>}
    </li>
  )
}

interface OpsAgentRowsProps {
  /** `agentRowsOf`의 네 줄. */
  agents: readonly AgentRow[]
  /** `weekStripOf`의 7칸. */
  strip: readonly WeekStripDay[]
  className?: string
}

export function OpsAgentRows({ agents, strip, className }: OpsAgentRowsProps) {
  return (
    <section aria-labelledby="ops-agent-rows-heading" className={cn('space-y-3', className)}>
      <h2 id="ops-agent-rows-heading" className={cn('text-lg font-semibold', TEXT_CLASS)}>
        에이전트
      </h2>
      <ul role="list" className="divide-y divide-border rounded-lg border border-border bg-background px-4">
        {agents.map((row) => (
          <AgentLine key={row.key} row={row} />
        ))}
      </ul>
      <ol role="list" aria-label="이번 주 일정" className="grid grid-cols-7 gap-2">
        {strip.map((day) => (
          <StripCell key={day.date} day={day} />
        ))}
      </ol>
    </section>
  )
}
