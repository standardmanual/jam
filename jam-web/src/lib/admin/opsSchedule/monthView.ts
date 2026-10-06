/**
 * 일정표 월간 보기의 계산 (티켓 20261006_1538 ③-c, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4 월간·카리나 가정 3·4, 순수 함수 — DB 접근 없음).
 *
 * 월요일 시작 달력 칸(`periodOf('month', date)`: 그 달이 걸치는 주 전부, 앞뒤 달 날짜 포함)마다 **주간 보기와 같은 항목 규칙**으로 칸 항목을 만든다.
 * 주마다 `buildScheduleWeek`를 불러 7일씩 이어 붙이므로 합치기(`created_resource`)·상태·시험·신호·대표 카드 규칙이 주간과 한 곳에서만 정해진다.
 * 타임라인(`timeline.ts`의 날짜 서랍용 칸)도 같은 `buildSchedulePeriod`를 쓴다. 반환값은 일반 객체라 서버 컴포넌트에서 클라이언트 컴포넌트로 그대로 넘길 수 있다.
 *
 * ## 이어 붙이는 규칙(주간과 다른 점)
 * - 카드(운영 카드·실제 카드)는 걸치는 날마다 둔다(가정 3). 주마다 따로 계산해도 날짜별 결과라 같다.
 * - 카드가 아닌 운영 항목(미션·드랍 일정·레시피·JAM! 배지·컬렉션 런칭)은 **시작일 칸에만** 둔다. 주간 계산은 시작일이 그 주 앞이면 그 주 첫 칸에 두므로,
 *   이어 붙일 때 첫 주가 아닌 주의 「시작하지 않은 날」 항목(시각이 빈 항목)은 뺀다 — 그러지 않으면 긴 항목이 매주 월요일마다 되풀이된다.
 *   시작일이 달력 앞이면 달력의 첫 칸에 남는다(이미 진행 중인 항목이 어디에도 안 보이는 일을 막는다, 주간과 같은 이유).
 * - **옛 미션**(운영 항목과 합치지 않은 실제 기간 미션)은 주간에서는 막대로만 보이지만 월간에는 막대가 없으므로 시작일 칸의 항목(`mission:<ID>` 서랍 키)으로 둔다.
 *   운영 미션은 이미 칸 항목이라 막대를 다시 항목으로 만들지 않는다. 상시 미션은 주간처럼 시작일 칸의 「시작」 항목이다.
 * - 크론·예약 루틴은 월간에 없다(승인 항목 14 「자동 실행 접힘 줄」은 주간만). 카드 노출·열람 줄도 읽지 않는다(한 줄 칸이라 보이지 않는다).
 * - 반려·취소·실패 항목은 칸에 없다(가정 4) — 날짜 구성이 올리지 않는다.
 */
import { OPS_HOME_FEED_CARD_KIND } from '@/lib/admin/opsInbox/constants'
import { periodOf } from '@/lib/admin/opsSchedule/params'
import {
  buildScheduleWeek,
  type BuildScheduleWeekInput,
  type ScheduleDay,
  type ScheduleItem,
} from '@/lib/admin/opsSchedule/weekView'
import { shiftDateStr } from '@/lib/admin/today-calendar'

/** 월간 칸이 한 줄씩 보이는 항목 수. 넘치면 「+N개 더」(날짜 서랍)다. */
export const MONTH_CELL_ITEM_LIMIT = 3

const NO_AUTOMATION = { cron: [], routines: [] } as const

/** 여러 주를 한 번에 계산하는 입력. `start`는 월요일, `end`는 일요일(양 끝 포함)이다. 크론·루틴·카드 노출 줄은 받지 않는다. */
export type BuildSchedulePeriodInput = Omit<BuildScheduleWeekInput, 'weekStart' | 'automation' | 'cardNote'> & {
  /** 첫 날(월요일, KST `YYYY-MM-DD`). */
  start: string
  /** 마지막 날(일요일, 포함). */
  end: string
}

export interface SchedulePeriodDays {
  start: string
  end: string
  /** `start`부터 `end`까지 하루에 하나. 월요일로 시작해 7의 배수다. */
  days: ScheduleDay[]
  /** 칸 항목·장기 카드의 합. 0이고 읽지 못한 재료가 없을 때만 「이 기간에는 올라온 항목이 없어요」를 보인다. */
  contentCount: number
}

/** 카드가 아닌 운영 항목이 이 주에서 시작하지 않고 이어지기만 하는 칸 항목인가(주간 계산이 시각을 빈 글자로 둔 항목). */
function isCarriedOpsItem(item: ScheduleItem): boolean {
  return item.origin === 'ops' && item.kind !== OPS_HOME_FEED_CARD_KIND && item.time === ''
}

/** 옛 미션 막대 → 시작일 칸 항목. 서랍 키는 `mission:<ID>`다(운영 항목이 아니므로 `legacyEntryOf`가 읽는다). */
function legacyMissionItem(bar: { id: string; title: string; drawerKey: string; href: string | null }): ScheduleItem {
  return {
    id: `${bar.id}-start`,
    origin: 'mission',
    drawerKey: bar.drawerKey,
    kind: 'mission',
    title: bar.title,
    time: '',
    status: null,
    isSample: false,
    dim: false,
    href: bar.href,
    note: null,
  }
}

/** 월요일부터 일요일까지 여러 주의 칸을 만든다. 시험 묶음·못 읽은 재료·합치기는 `buildScheduleWeek`와 같다. */
export function buildSchedulePeriod(input: BuildSchedulePeriodInput): SchedulePeriodDays {
  const { start, end, ...rest } = input
  const days: ScheduleDay[] = []
  for (let weekStart = start, weekIndex = 0; weekStart <= end; weekStart = shiftDateStr(weekStart, 7), weekIndex += 1) {
    const week = buildScheduleWeek({ ...rest, weekStart, automation: NO_AUTOMATION })
    // 옛 미션 막대: 그 주에 시작하면 시작 열에, 시작이 달력 앞이면 첫 주의 첫 열에 둔다. 이어지기만 하는 주에서는 두지 않는다(한 번만 나온다).
    const legacyByColumn = new Map<number, ScheduleItem[]>()
    for (const bar of week.missionBars) {
      if (bar.status !== null || !bar.drawerKey.startsWith('mission:')) continue
      const column = bar.startsThisWeek ? bar.startCol : weekIndex === 0 ? 0 : null
      if (column === null) continue
      legacyByColumn.set(column, [...(legacyByColumn.get(column) ?? []), legacyMissionItem(bar)])
    }
    week.days.forEach((day, column) => {
      const kept = weekIndex === 0 ? day.items : day.items.filter((item) => !isCarriedOpsItem(item))
      days.push({ ...day, items: [...kept, ...(legacyByColumn.get(column) ?? [])] })
    })
  }
  const contentCount = days.reduce((sum, day) => sum + day.items.length + day.longActiveCount + day.longInactiveCount, 0)
  return { start, end, days, contentCount }
}

/** 월간 칸 하나. 보이는 달에 속하지 않는 앞뒤 달 날짜는 `inMonth`가 거짓이다(흐리게 그린다). */
export interface ScheduleMonthDay extends ScheduleDay {
  inMonth: boolean
}

export interface ScheduleMonth {
  /** 보이는 달 `YYYY-MM`. */
  month: string
  start: string
  end: string
  days: ScheduleMonthDay[]
  contentCount: number
}

export type BuildScheduleMonthInput = Omit<BuildSchedulePeriodInput, 'start' | 'end'> & {
  /** 기준일(KST `YYYY-MM-DD`). 이 날짜가 속한 달을 그린다. */
  date: string
}

export function buildScheduleMonth(input: BuildScheduleMonthInput): ScheduleMonth {
  const { date, ...rest } = input
  const period = periodOf('month', date)
  const month = date.slice(0, 7)
  const { days, contentCount } = buildSchedulePeriod({ ...rest, ...period })
  return {
    month,
    start: period.start,
    end: period.end,
    days: days.map((day) => ({ ...day, inMonth: day.date.slice(0, 7) === month })),
    contentCount,
  }
}

/** 칸에 한 줄씩 보일 항목과 가려진 수. 3개를 넘으면 나머지는 「+N개 더」로 날짜 서랍에서 본다. */
export function monthCellItems(
  items: readonly ScheduleItem[],
  limit: number = MONTH_CELL_ITEM_LIMIT
): { visible: ScheduleItem[]; hiddenCount: number } {
  return { visible: items.slice(0, limit), hiddenCount: Math.max(0, items.length - limit) }
}

/** 달력 칸을 7칸씩 한 주 줄로 나눈다(월간 달력의 행). */
export function monthWeeks<T>(days: readonly T[]): T[][] {
  const weeks: T[][] = []
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7))
  return weeks
}
