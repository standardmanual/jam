'use client'

import { useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { OpsScheduleDayDrawer } from '@/components/admin/ops/OpsScheduleDayDrawer'
import { OpsScheduleDrawer } from '@/components/admin/ops/OpsScheduleDrawer'
import { OpsScheduleMonth } from '@/components/admin/ops/OpsScheduleMonth'
import { OpsScheduleTimeline } from '@/components/admin/ops/OpsScheduleTimeline'
import { useStatusFlash } from '@/components/admin/ops/useStatusFlash'
import {
  closeDrawerQuery,
  drawerTargetOf,
  drawerTriggerSelector,
  openDrawerQuery,
  type ScheduleDrawerTarget,
} from '@/lib/admin/opsSchedule/drawerParams'
import { statusByDrawerKey, type ScheduleDrawerSource, type ScheduleSourceErrors } from '@/lib/admin/opsSchedule/drawerView'
import type { ScheduleMonth } from '@/lib/admin/opsSchedule/monthView'
import { parseScheduleParams } from '@/lib/admin/opsSchedule/params'
import type { ScheduleTimeline } from '@/lib/admin/opsSchedule/timeline'
import type { ScheduleDay, ScheduleItem, ScheduleMissionBar, ScheduleWeek } from '@/lib/admin/opsSchedule/weekView'
import WeeklyCalendar, {
  type CalendarCellItem,
  type CalendarColumn,
  type CalendarDrawerControl,
  type CalendarMissionBar,
} from './WeeklyCalendar'

/**
 * 일정표의 보기 래퍼 (티켓 20261006_1536 ③-a, 서랍은 티켓 20261006_1537 ③-b, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4 주간·서랍).
 *
 * 서버가 읽어 계산한 한 주(`ScheduleWeek`, 일반 객체)를 받아 `WeeklyCalendar`에 얹고, 칸 머리·항목·미션 막대를 눌러 여는 서랍을 달력 옆에 둔다.
 * 이동은 도구줄(`ScheduleToolbar`)이 하고, 달력 폭에 맞춰 7열↔날짜별 가로 줄이 바뀐다(`adaptive`).
 *
 * 월간(`month`, `OpsScheduleMonth`)·타임라인(`timeline`, `OpsScheduleTimeline`)도 같은 틀에서 같은 서랍을 연다(티켓 20261006_1538 ③-c). 셋 중 **하나만** 준다.
 * 서랍이 찾아보는 칸은 `drawerSource`다: 주간은 한 주, 월간은 달력 전체, 타임라인은 창 전체(날짜 서랍·옛 미션 요약). 월간·타임라인은 미션 막대가 없다.
 *
 * ## 서랍
 * - 상태는 주소(`?drawer=item&item=`·`?drawer=day&date=`)가 전부다 — 새로고침해도 유지된다. 열고 닫을 때 `history.replaceState`로 주소만 바꾼다(서버를 다시 부르지 않는다, S3와 같다).
 *   닫으면 `drawer`·`item`을 지우고 `date`는 남긴다. 주소 계산은 `drawerParams.ts`다.
 * - 서랍은 달력의 **형제 요소**다. 딤·`fixed`가 없고 서랍이 열려도 달력 칸은 그대로 있다. 이 틀(컨테이너)이 68rem 이상이면 `[달력 | 28rem 서랍]` 두 열이고, 좁으면 달력 아래에 쌓인다.
 *   서랍이 열려 달력 열이 56rem 미만이 되면 주간이 날짜별 가로 줄로 바뀐다(`WeeklyCalendar`의 컨테이너 쿼리).
 * - 서랍이 열리면 서랍 제목으로 포커스가 가고(좁게 쌓였으면 화면도 그리로 스크롤된다), 닫으면 **누른 칸**으로 돌아간다. 누른 칸이 사라졌으면 `data-drawer-trigger` 선택자로 찾는다.
 * - 결정이 끝나 서버 화면을 다시 읽으면(`router.refresh()`, 서랍이 부른다) 새 주간 데이터에서 상태가 바뀐 칸을 찾아 1.2초 잔상을 남긴다(`useStatusFlash`). 이 틀이 그대로 남아 있어야 비교가 되므로
 *   페이지는 보기·기간이 바뀔 때만 이 틀을 다시 만든다(서랍을 열며 `date`가 같은 주 안에서 바뀌는 것은 틀을 흔들지 않는다).
 */

function toCellItem(item: ScheduleItem): CalendarCellItem {
  return {
    id: item.id,
    time: item.time,
    label: item.title,
    // 옛 모드의 「시작」(상시 미션 시작)·카드 표식을 그대로 쓴다. 운영 항목에는 표식 대신 상태 칩이 붙는다.
    kind: item.origin === 'mission' ? 'mission' : item.origin === 'card' ? 'card' : undefined,
    dim: item.dim || undefined,
    href: item.href ?? undefined,
    note: item.note ?? undefined,
    itemKind: item.kind,
    status: item.status ?? undefined,
    isSample: item.isSample || undefined,
    drawerKey: item.drawerKey,
  }
}

function toColumn(day: ScheduleDay): CalendarColumn {
  return {
    date: day.date,
    weekdayLabel: day.weekdayLabel,
    dateLabel: day.dateLabel,
    items: day.items.map(toCellItem),
    longCardsCount: day.longActiveCount || undefined,
    longInactiveCount: day.longInactiveCount || undefined,
    isToday: day.isToday,
    // 신호는 건수가 있을 때만 칩이다. 건수 0·확인 기간 밖에서는 칩을 두지 않는다(「이상 없음」을 말하지 않는다).
    signal: day.signals && day.signals.topLevel !== null ? { level: day.signals.topLevel, count: day.signals.count } : null,
    automationItems: day.automation.map((entry) => ({
      id: entry.id,
      time: entry.time,
      label: entry.label,
      kind: entry.routine ? 'routine' : undefined,
      dim: entry.dim || undefined,
    })),
  }
}

function toBar(bar: ScheduleMissionBar): CalendarMissionBar {
  return {
    id: bar.id,
    title: bar.title,
    startCol: bar.startCol,
    endCol: bar.endCol,
    startsThisWeek: bar.startsThisWeek,
    endsThisWeek: bar.endsThisWeek,
    isGate: bar.isGate,
    status: bar.status,
    isSample: bar.isSample,
    href: bar.href,
    drawerKey: bar.drawerKey,
  }
}

/** 서랍을 달력 옆(넓을 때)·아래(좁을 때)에 두는 틀의 서랍 쪽 클래스. 넓으면 달력을 따라 내려오고 서랍이 길면 서랍 안에서 스크롤한다. */
const DRAWER_PLACEMENT =
  'min-w-0 @[68rem]:sticky @[68rem]:top-[4.5rem] @[68rem]:max-h-[calc(100vh-6rem)] @[68rem]:self-start @[68rem]:overflow-y-auto'

/** 주소만 바꾼다(`history.replaceState`). 다른 쿼리 키와 해시는 그대로 두고 쿼리 문자열만 새로 계산한다. */
function replaceSearch(compute: (search: string) => string): void {
  const query = compute(window.location.search)
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
}

/** 보기 하나의 데이터. 주간·월간·타임라인 중 하나만 준다. */
type OpsScheduleBoardProps = { sourceErrors: ScheduleSourceErrors } & (
  | { week: ScheduleWeek; month?: undefined; timeline?: undefined }
  | { week?: undefined; month: ScheduleMonth; timeline?: undefined }
  | { week?: undefined; month?: undefined; timeline: ScheduleTimeline }
)

/** 서랍·잔상이 읽는 칸 데이터와, 상태가 바뀔 때 잔상을 남길 키(칸 항목 + 타임라인의 운영 항목 막대). */
function drawerSourceOf({ week, month, timeline }: { week?: ScheduleWeek; month?: ScheduleMonth; timeline?: ScheduleTimeline }): {
  source: ScheduleDrawerSource
  statuses: Record<string, string>
} {
  if (week) return { source: week, statuses: statusByDrawerKey(week) }
  const days = month?.days ?? timeline?.days ?? []
  const source: ScheduleDrawerSource = { days, missionBars: [] }
  const statuses = statusByDrawerKey(source)
  for (const row of timeline?.rows ?? []) for (const bar of row.bars) if (bar.drawerKey !== null) statuses[bar.drawerKey] = bar.status
  return { source, statuses }
}

export function OpsScheduleBoard(props: OpsScheduleBoardProps) {
  const { sourceErrors } = props
  const searchParams = useSearchParams()
  const params = useMemo(() => parseScheduleParams(searchParams), [searchParams])
  const target = drawerTargetOf(params)

  // 결정으로 상태가 바뀐 칸은 1.2초 동안 잔상을 남긴다. 서버가 새 데이터를 주기 전에는 같은 객체를 쓴다(`useStatusFlash`가 같은 객체면 비교하지 않는다).
  const { week, month, timeline } = props
  const { source, statuses } = useMemo(() => drawerSourceOf({ week, month, timeline }), [week, month, timeline])
  const flashingKeys = useStatusFlash(statuses)

  /** 서랍을 연 칸. 닫을 때 포커스를 돌려줄 자리다(날짜 서랍 안에서 항목 서랍으로 옮겨도 처음 누른 칸을 유지한다). */
  const triggerRef = useRef<HTMLElement | null>(null)

  const openDrawer = useCallback((next: ScheduleDrawerTarget, trigger?: HTMLElement) => {
    if (trigger) triggerRef.current = trigger
    replaceSearch((search) => openDrawerQuery(search, next))
  }, [])

  const closeDrawer = useCallback(() => {
    replaceSearch(closeDrawerQuery)
    const opener = triggerRef.current
    triggerRef.current = null
    const closing = target
    requestAnimationFrame(() => {
      const back = opener?.isConnected ? opener : closing ? document.querySelector<HTMLElement>(drawerTriggerSelector(closing)) : null
      back?.focus()
    })
  }, [target])

  const openItem = useCallback((key: string) => openDrawer({ kind: 'item', key }), [openDrawer])
  const drawerControl: CalendarDrawerControl = { onOpen: openDrawer, selected: target, flashingKeys }

  return (
    <div className="@container">
      <div className={cn('grid grid-cols-1 gap-4', target && '@[68rem]:grid-cols-[minmax(0,1fr)_28rem]')}>
        <div className="min-w-0">
          {week && (
            <WeeklyCalendar
              columns={week.days.map(toColumn)}
              missionBars={week.missionBars.length > 0 ? week.missionBars.map(toBar) : undefined}
              openEndedMissionCount={week.openEndedMissionCount ?? undefined}
              adaptive
              drawer={drawerControl}
            />
          )}
          {month && <OpsScheduleMonth month={month} drawer={drawerControl} />}
          {timeline && <OpsScheduleTimeline timeline={timeline} drawer={drawerControl} sourceErrors={sourceErrors} />}
        </div>
        {target?.kind === 'item' && (
          <OpsScheduleDrawer
            key={`item:${target.key}`}
            itemKey={target.key}
            week={source}
            includeSample={params.includeSample}
            onClose={closeDrawer}
            onOpenItem={openItem}
            className={DRAWER_PLACEMENT}
          />
        )}
        {target?.kind === 'day' && (
          <OpsScheduleDayDrawer
            key={`day:${target.date}`}
            date={target.date}
            days={source.days}
            sourceErrors={sourceErrors}
            includeSample={params.includeSample}
            onClose={closeDrawer}
            onOpenItem={openItem}
            className={DRAWER_PLACEMENT}
          />
        )}
      </div>
    </div>
  )
}
