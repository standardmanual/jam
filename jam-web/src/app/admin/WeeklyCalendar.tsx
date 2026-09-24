'use client'

import { useRouter } from 'next/navigation'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import { shiftDateStr } from '@/lib/admin/today-calendar'

export interface CalendarCellItem {
  id: string
  /** "09:00" 또는 "매시간"처럼 화면에 그대로 찍을 시각 라벨 */
  time: string
  label: string
}

export interface CalendarColumn {
  /** 'YYYY-MM-DD' */
  date: string
  weekdayLabel: string
  dateLabel: string
  items: CalendarCellItem[]
}

interface WeeklyCalendarProps {
  /** 표시 중인 주의 월요일, 'YYYY-MM-DD' */
  weekStart: string
  weekRangeLabel: string
  columns: CalendarColumn[]
  /** 주 이동 시 이동할 경로. 기본값 '/admin' */
  basePath?: string
}

/**
 * 어드민 메인 주간 캘린더 뼈대(티켓 20260924_0904).
 *
 * 크론 전용이 아니라 **요일별 항목 목록**을 받는 범용 컴포넌트다 — 이 파일은 크론을
 * 전혀 모른다. 하위 티켓(루틴·카드·미션·반응, 0905~0908)이 각자의 항목을
 * `columns[].items`에 채워 같은 컴포넌트에 얹는다.
 */
export default function WeeklyCalendar({
  weekStart,
  weekRangeLabel,
  columns,
  basePath = '/admin',
}: WeeklyCalendarProps) {
  const router = useRouter()
  const goToWeek = (monday: string) => router.push(`${basePath}?week=${monday}`)

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="이전 주"
          onClick={() => goToWeek(shiftDateStr(weekStart, -7))}
        >
          <IconChevronLeft className="w-4 h-4" />
        </Button>
        <span className="font-bold text-sm">{weekRangeLabel}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="다음 주"
          onClick={() => goToWeek(shiftDateStr(weekStart, 7))}
        >
          <IconChevronRight className="w-4 h-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {columns.map((col) => (
          <div key={col.date} className="bg-white border border-border rounded-xl p-3 min-h-[110px]">
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              {col.weekdayLabel} <span className="font-normal">{col.dateLabel}</span>
            </p>
            {col.items.length === 0 ? (
              <p className="text-xs text-muted-foreground/60">일정 없음</p>
            ) : (
              <ul className="space-y-1">
                {col.items.map((item) => (
                  <li key={item.id} className="text-xs leading-snug">
                    <span className="font-mono text-muted-foreground">{item.time}</span>{' '}
                    <span>{item.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
