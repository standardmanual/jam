'use client'

import { formatPeriodLabel } from '@/lib/admin/opsSchedule/params'
import type { ScheduleDay, ScheduleItem, ScheduleMissionBar, ScheduleWeek } from '@/lib/admin/opsSchedule/weekView'
import WeeklyCalendar, { type CalendarCellItem, type CalendarColumn, type CalendarMissionBar } from '../WeeklyCalendar'

/**
 * 일정표의 보기 래퍼 (티켓 20261006_1536 ③-a, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4 주간).
 *
 * 서버가 읽어 계산한 한 주(`ScheduleWeek`, 일반 객체)를 받아 `WeeklyCalendar`에 얹는다. ③-a에서는 항목 링크(기획 상세·카드 상세)만 있고
 * 칸 머리·항목을 눌러 여는 서랍은 ③-b가 이 래퍼에 더한다(선택 상태·포커스 복귀는 클라이언트가 가진다).
 * 이동은 도구줄(`ScheduleToolbar`)이 하므로 달력 머리의 이전·다음 주는 그리지 않고(`nav={false}`), 달력 폭에 맞춰 7열↔날짜별 가로 줄이 바뀐다(`adaptive`).
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

export function OpsScheduleBoard({ week }: { week: ScheduleWeek }) {
  return (
    <WeeklyCalendar
      weekStart={week.weekStart}
      weekRangeLabel={formatPeriodLabel('week', week.weekStart)}
      columns={week.days.map(toColumn)}
      missionBars={week.missionBars.length > 0 ? week.missionBars.map(toBar) : undefined}
      openEndedMissionCount={week.openEndedMissionCount ?? undefined}
      nav={false}
      adaptive
    />
  )
}
