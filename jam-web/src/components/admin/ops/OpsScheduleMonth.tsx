'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { kindLabel } from '@/lib/admin/opsInbox/labels'
import { drawerTriggerValue, isSameDrawerTarget, type ScheduleDrawerTarget } from '@/lib/admin/opsSchedule/drawerParams'
import { monthCellItems, monthWeeks, type ScheduleMonth, type ScheduleMonthDay } from '@/lib/admin/opsSchedule/monthView'
import type { ScheduleItem } from '@/lib/admin/opsSchedule/weekView'
import type { CalendarDrawerControl } from '@/app/admin/WeeklyCalendar'
import { OpsKindIcon } from './opsIcons'
import { OpsStatusBadge } from './OpsStatusBadge'

/**
 * 일정표 월간 보기 (티켓 20261006_1538 ③-c, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4 월간).
 *
 * 월요일 시작 달력이다. 칸 머리는 날짜 + 그날 가장 높은 신호 수준 칩 + 건수(칩을 쌓지 않는다)이고 누르면 날짜 서랍이 열린다.
 * 항목은 한 줄에 하나(종류 아이콘 + 상태 아이콘 + 제목)이며 3개까지만 보이고 나머지는 「+N개 더」(날짜 서랍)다. 크론·루틴은 없다.
 *
 * ## 좁은 화면
 * 달력 폭(`@container`)이 40rem 미만이면 칸에는 날짜와 **항목 수와 최고 신호**만 보인다(항목 줄·장기 카드 줄은 숨는다). 칸 머리가 그대로 날짜 서랍 버튼이라
 * 항목은 서랍에서 본다. 상태 아이콘은 글자를 `sr-only`로 남기고, 뜻은 범례(`OpsStatusLegend`)가 알려 준다. 칸 머리는 40rem 미만에서 44px(`min-h-11`)다.
 *
 * ## 서랍
 * 항목·칸 머리가 서랍을 여는 버튼이다(`WeeklyCalendar`와 같은 `drawer` 제어: 선택 표시 `aria-current`, 1.2초 잔상, 닫을 때 포커스가 돌아올 `data-drawer-trigger`).
 * 보이는 달 밖의 앞뒤 달 날짜 칸도 같은 항목을 보이고 흐리게 그린다. 제출 문자열(제목)은 React 텍스트 노드로만 그린다.
 */

const WEEKDAY_HEADERS = ['월', '화', '수', '목', '금', '토', '일']

const SELECTED_ROW = 'border-foreground bg-muted'
const HEAD_BUTTON =
  'mb-1 flex min-h-11 w-full flex-wrap items-center justify-between gap-1 rounded-md px-1 py-0.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @[40rem]:min-h-0'

/** 칸에 한 줄로 보이는 항목. 전체가 항목 서랍을 여는 버튼이다. */
function MonthItem({ item, drawer }: { item: ScheduleItem; drawer: CalendarDrawerControl }) {
  const target: ScheduleDrawerTarget = { kind: 'item', key: item.drawerKey }
  const selected = isSameDrawerTarget(drawer.selected, target)
  const flashing = drawer.flashingKeys?.has(item.drawerKey) ?? false
  return (
    <li
      data-drawer-key={item.drawerKey}
      className={cn('rounded-md border-l-4 border-transparent text-xs leading-snug', item.dim && 'opacity-40', selected && SELECTED_ROW, flashing && !selected && 'bg-muted')}
    >
      <button
        type="button"
        data-drawer-trigger={drawerTriggerValue(target)}
        aria-current={selected ? 'true' : undefined}
        onClick={(event) => drawer.onOpen(target, event.currentTarget)}
        className="flex min-h-6 w-full items-center gap-1 rounded-md px-1 py-0.5 text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <OpsKindIcon kind={item.kind} className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="sr-only">{kindLabel(item.kind)}</span>
        {item.status !== null && <OpsStatusBadge type="item" status={item.status} iconOnly />}
        {item.isSample && <OpsStatusBadge type="sample" iconOnly />}
        <span className="min-w-0 flex-1 truncate">{item.title}</span>
        <span className="sr-only"> 서랍 열기</span>
      </button>
    </li>
  )
}

/** 달력 칸 하나. */
function MonthCell({ day, firstOfGrid, drawer }: { day: ScheduleMonthDay; firstOfGrid: boolean; drawer: CalendarDrawerControl }) {
  const dayTarget: ScheduleDrawerTarget = { kind: 'day', date: day.date }
  const daySelected = isSameDrawerTarget(drawer.selected, dayTarget)
  const dayNumber = Number(day.date.slice(8, 10))
  // 달의 첫날과 달력의 첫 칸은 「10월 1일」처럼 달을 함께 쓴다. 나머지는 날짜 숫자만이다.
  const visibleLabel = dayNumber === 1 || firstOfGrid ? day.dateLabel : String(dayNumber)
  const signal = day.signals !== null && day.signals.topLevel !== null ? { level: day.signals.topLevel, count: day.signals.count } : null
  const { visible, hiddenCount } = monthCellItems(day.items)
  const hasLong = day.longActiveCount > 0 || day.longInactiveCount > 0
  const isEmpty = day.items.length === 0 && !hasLong

  return (
    <li
      aria-current={day.isToday ? 'date' : undefined}
      className={cn(
        'min-w-0 rounded-xl border border-border bg-white p-1 @[40rem]:min-h-[7.5rem] @[40rem]:p-1.5',
        !day.inMonth && 'bg-muted/40 text-muted-foreground',
        day.isToday && 'border-foreground ring-1 ring-foreground'
      )}
    >
      <button
        type="button"
        data-drawer-trigger={drawerTriggerValue(dayTarget)}
        aria-current={daySelected ? 'true' : undefined}
        onClick={(event) => drawer.onOpen(dayTarget, event.currentTarget)}
        className={cn(HEAD_BUTTON, daySelected && 'bg-muted')}
      >
        <span className="text-xs font-semibold">
          <span aria-hidden="true">{visibleLabel}</span>
          <span className="sr-only">{`${day.dateLabel} ${day.weekdayLabel}요일`}</span>
          {day.isToday && <span className="ml-1 font-bold text-foreground">오늘</span>}
        </span>
        {signal && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex @[40rem]:hidden">
              <OpsStatusBadge type="signal" level={signal.level} iconOnly className="px-0.5" />
            </span>
            <span className="hidden @[40rem]:inline-flex">
              <OpsStatusBadge type="signal" level={signal.level} />
            </span>
            <span className="hidden text-xs font-normal tabular-nums text-muted-foreground @[40rem]:inline">{signal.count}건</span>
          </span>
        )}
        <span className="sr-only"> 서랍 열기</span>
      </button>

      {day.items.length > 0 && (
        // 좁은 달력: 항목 수만 보인다(항목은 날짜 서랍에서 본다).
        <p className="px-1 text-xs tabular-nums text-muted-foreground @[40rem]:hidden">
          <span aria-hidden="true">{day.items.length}</span>
          <span className="sr-only">{`항목 ${day.items.length}개`}</span>
        </p>
      )}

      <div className="hidden @[40rem]:block">
        {isEmpty && <p className="px-1 text-xs text-muted-foreground/60">일정 없음</p>}
        {visible.length > 0 && (
          <ul className="space-y-0.5">
            {visible.map((item) => (
              <MonthItem key={item.id} item={item} drawer={drawer} />
            ))}
          </ul>
        )}
        {hiddenCount > 0 && (
          <button
            type="button"
            aria-label={`${day.dateLabel} 항목 ${hiddenCount}개 더 보기`}
            onClick={(event) => drawer.onOpen(dayTarget, event.currentTarget)}
            className="mt-0.5 rounded-md px-1 py-0.5 text-xs font-medium text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {`+${hiddenCount}개 더`}
          </button>
        )}
        {hasLong && (
          <Link href={`/admin/today?date=${day.date}`} className="mt-0.5 block px-1 text-xs text-muted-foreground hover:underline">
            장기 카드 {day.longActiveCount}장{day.longInactiveCount > 0 && ` · 비활성 ${day.longInactiveCount}장`}
          </Link>
        )}
      </div>
    </li>
  )
}

export function OpsScheduleMonth({ month, drawer }: { month: ScheduleMonth; drawer: CalendarDrawerControl }) {
  const weeks = monthWeeks(month.days)
  return (
    <section aria-label="월간 달력" className="@container mb-10 min-w-0">
      <div className="mb-1 grid grid-cols-7 gap-1 px-1 text-xs font-medium text-muted-foreground" aria-hidden="true">
        {WEEKDAY_HEADERS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <ol className="space-y-1">
        {weeks.map((week) => (
          <li key={week[0].date}>
            <ol className="grid grid-cols-7 gap-1">
              {week.map((day) => (
                <MonthCell key={day.date} day={day} firstOfGrid={day.date === month.start} drawer={drawer} />
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </section>
  )
}
