'use client'

import { cn } from '@/lib/utils'
import { dayCellLabel, segmentTitle, shapeSegments, type DayPreview } from './homePreviewClient'

/**
 * 홈피드 미리보기의 7일 칸 (티켓 20261026_2025 2회차, 어드민 상황판 PRD §6.3)
 *
 * 칸 하나가 하루다: 요일·날짜, 카드 수 숫자(`entries.length` — 아래 휴대폰 틀에 그려지는 카드 수와 같은 값),
 * 모양별 막대(`shapeCounts`, 카드 한 장이 한 조각이고 모양마다 다른 회색 농도이며 범례 없이 조각의 `title` 툴팁으로 읽는다. `style` 속성을 쓰지 않으려고 폭 대신 조각 수로 그린다),
 * 승인 전 카드가 있으면 점선 점과 「승인 전 N」. 칸은 버튼이고 누르면 그 날이 선택되며, 선택한 칸은 테두리로 강조한다.
 */

const TEXT_CLASS = 'break-keep wrap-break-word'

interface HomePreviewWeekStripProps {
  days: readonly DayPreview[]
  selectedDate: string
  onSelect: (date: string) => void
}

export function HomePreviewWeekStrip({ days, selectedDate, onSelect }: HomePreviewWeekStripProps) {
  return (
    <ul role="list" aria-label="날짜별 카드 수" className="grid grid-cols-7 gap-1.5">
      {days.map((day) => {
        const { weekday, monthDay } = dayCellLabel(day.date)
        const selected = day.date === selectedDate
        const count = day.entries.length
        const segments = shapeSegments(day.shapeCounts)
        return (
          <li key={day.date} className="min-w-0">
            <button
              type="button"
              data-day-cell={day.date}
              aria-pressed={selected}
              aria-label={`${monthDay}(${weekday}) 카드 ${count}장${day.pendingCount > 0 ? `, 승인 전 ${day.pendingCount}장` : ''}`}
              onClick={() => onSelect(day.date)}
              className={cn(
                'flex w-full min-w-0 flex-col items-stretch gap-1.5 rounded-lg border bg-background px-1.5 py-2 text-center transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected ? 'border-2 border-foreground' : 'border-border',
              )}
            >
              <span className={cn('text-xs text-muted-foreground whitespace-nowrap', TEXT_CLASS)}>
                {weekday} {monthDay}
              </span>
              <span className="text-lg font-semibold tabular-nums leading-none" data-day-count>
                {count}
              </span>
              <span className="flex h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                {segments.flatMap((segment) =>
                  Array.from({ length: segment.count }, (_, index) => (
                    <span
                      key={`${segment.shape}:${index}`}
                      data-shape={segment.shape}
                      title={segmentTitle(segment)}
                      className={cn('h-full flex-1 border-r border-background last:border-r-0', segment.barClass)}
                    />
                  )),
                )}
              </span>
              <span className="flex h-4 items-center justify-center gap-1 text-[11px] text-muted-foreground">
                {day.pendingCount > 0 && (
                  <>
                    <span data-pending-dot className="size-2 shrink-0 rounded-full border border-dashed border-neutral-500" aria-hidden="true" />
                    <span className={cn('whitespace-nowrap tabular-nums', TEXT_CLASS)}>{`승인 전 ${day.pendingCount}`}</span>
                  </>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
