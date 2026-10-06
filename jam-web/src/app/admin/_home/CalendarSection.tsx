import { createServiceClient } from '@/lib/supabase/server'
import { OpsSectionNotice } from '@/components/admin/ops/OpsSectionNotice'
import WeeklyCalendar, { type CalendarColumn, type CalendarCellItem } from '../WeeklyCalendar'
import {
  getWeeklyCronOccurrences,
  formatOccurrenceTime,
  cronOccurrenceId,
  normalizeWeekParam,
  formatWeekRangeLabel,
} from '@/lib/admin/cronSchedule'
import { weeklyRoutineOccurrences, routineOccurrenceId } from '@/lib/admin/scheduledRoutines'
import { shiftDateStr, kstDayBoundsIso, todayKstDateString } from '@/lib/admin/today-calendar'
import { weeklyCards, type WeeklyCardDay, type WeeklyCardInput } from '@/lib/admin/weeklyCards'
import {
  fetchWeeklyCardMetrics,
  fetchFirstEventKstDate,
  formatCardMetricsNote,
  cardMetricKey,
  type CardMetricCounts,
} from '@/lib/admin/weeklyCardMetrics'
import { weeklyMissions, type WeeklyMissionInput, type WeeklyMissionsResult } from '@/lib/admin/weeklyMissions'

/**
 * 운영 홈의 주간 캘린더 구역 (티켓 20261006_1341 ②-c). `app/admin/page.tsx`에 있던 캘린더 조립을 **동작 그대로** 옮겼다(승인 #13 — 일정표로 옮기는 일은 ③이 한다).
 *
 * 이전 이력: 20260924_0904 어드민 메인 주간 캘린더(`vercel.json` 크론의 실행 예정을 요일 칸에 표시), 20260924_0905 Claude 예약 루틴 4개(주간·선별·주간 배포 승인·월간),
 * 20260924_0906 홈피드 카드 편성(단기 카드 개별 표시·장기 카드 묶음·미편성 판정), 20260924_0907 미션 막대, 20260924_0908 카드의 노출·열람 수.
 *
 * 출처별 격리는 그대로다: 카드·미션·노출 수 조회 중 하나가 실패해도 크론·루틴 항목과 나머지 칸은 그대로 보인다(실패하면 `null`로 두어 「미편성」을 함부로 단정하지 않는다).
 * 이 격리 밖에서 구역을 그리지 못하면(예상 밖 오류) 이 구역만 안내 카드가 되고 [새로 고치기]를 보인다.
 */

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

export const CALENDAR_LOAD_FAILED_TITLE = '주간 일정을 불러오지 못했어요'

interface CalendarSectionProps {
  /** `?week=`(주 이동). 없거나 틀리면 이번 주다. */
  weekParam: string | undefined
}

export async function CalendarSection({ weekParam }: CalendarSectionProps) {
  try {
    return await buildCalendar(weekParam)
  } catch (error) {
    console.error('[admin/home] 주간 캘린더 구역 오류:', error)
    return <OpsSectionNotice icon="week" title={CALENDAR_LOAD_FAILED_TITLE} />
  }
}

async function buildCalendar(weekParam: string | undefined) {
  const weekStart = normalizeWeekParam(weekParam)
  const occurrences = getWeeklyCronOccurrences()
  const routineOccurrences = weeklyRoutineOccurrences(weekStart)

  // 카드 조회는 보고 있는 주 범위로 한 번만 하고, 요일 배분은 순수 함수(weeklyCards)가 한다.
  // 실패해도 크론·루틴 항목과 나머지 영역은 그대로 표시한다(이 페이지의 출처별 격리 원칙) —
  // 실패 시 weeklyCardDays를 null로 둬 "미편성"을 함부로 단정하지 않는다.
  let weeklyCardDays: WeeklyCardDay[] | null = null
  try {
    const supabase = createServiceClient()
    const weekEndDate = shiftDateStr(weekStart, 6)
    const { startIso: weekStartIso } = kstDayBoundsIso(weekStart)
    const { endIso: weekEndIso } = kstDayBoundsIso(weekEndDate)
    const { data, error } = await supabase
      .from('today_cards')
      .select('id, title, content_type_id, template_type, starts_at, ends_at, is_active, sort_order')
      .lte('starts_at', weekEndIso)
      .gte('ends_at', weekStartIso)
    if (error) throw error
    weeklyCardDays = weeklyCards((data ?? []) as WeeklyCardInput[], weekStart)
  } catch {
    weeklyCardDays = null
  }

  // 20260924_0908: 단기 카드의 노출·열람 수. 오늘 이전(포함) 날짜가 있는 주에서만 1번 조회한다 —
  // 미래 주는 조회하지 않는다. 실패하면 null로 두고 카드 항목 아래 수치 줄만 비운다(출처별 격리).
  const todayKst = todayKstDateString()
  let cardMetrics: { counts: Map<string, CardMetricCounts>; firstEventDate: string | null } | null = null
  if (weeklyCardDays && weekStart <= todayKst) {
    try {
      const cardIds = [...new Set(weeklyCardDays.flatMap((d) => d.shortCards.map((c) => c.id)))]
      const { startIso: weekStartIso } = kstDayBoundsIso(weekStart)
      const { endIso: weekEndIso } = kstDayBoundsIso(shiftDateStr(weekStart, 6))
      const [counts, firstEventDate] = await Promise.all([
        fetchWeeklyCardMetrics(cardIds, weekStartIso, weekEndIso),
        fetchFirstEventKstDate(),
      ])
      cardMetrics = { counts, firstEventDate }
    } catch {
      cardMetrics = null
    }
  }

  // 20260924_0907: 미션도 보고 있는 주 범위로 한 번만 조회한다(필요한 컬럼만). 실패하면 null로 두고
  // 막대·"상시 미션 N개" 줄만 숨긴다 — 크론·루틴·카드 표시는 그대로다(출처별 격리).
  let missionsWeek: WeeklyMissionsResult | null = null
  try {
    const supabase = createServiceClient()
    const { startIso: weekStartIso } = kstDayBoundsIso(weekStart)
    const { endIso: weekEndIso } = kstDayBoundsIso(shiftDateStr(weekStart, 6))
    const { data, error } = await supabase
      .from('missions')
      .select('id, title, starts_at, ends_at, gate_axis')
      .lte('starts_at', weekEndIso)
      .or(`ends_at.is.null,ends_at.gte.${weekStartIso}`)
    if (error) throw error
    missionsWeek = weeklyMissions((data ?? []) as WeeklyMissionInput[], weekStart)
  } catch {
    missionsWeek = null
  }

  const columns: CalendarColumn[] = Array.from({ length: 7 }, (_, i) => {
    const date = shiftDateStr(weekStart, i)
    const weekday = (i + 1) % 7 // i=0(월)→1 ... i=6(일)→0, cron 요일 인덱스(0=일..6=토)와 동일
    const cardDay = weeklyCardDays?.[i]

    // 카드 항목 id는 카드 id와 날짜를 함께 써서 같은 날짜 안에서 겹치지 않게 한다(티켓 20260924_0906).
    // 시각 자리에는 유형 ID(없으면 "유형 없음")를, 누르면 TodayCardTable.tsx의 [상세보기]와 같은 경로로 간다.
    const cardItems: CalendarCellItem[] = (cardDay?.shortCards ?? []).map((c) => ({
      id: `card-${c.id}-${date}`,
      time: c.content_type_id ?? '유형 없음',
      label: c.title,
      kind: 'card',
      dim: !c.is_active,
      href: `/admin/today/${c.id}?date=${date}`,
      note: cardMetrics
        ? (formatCardMetricsNote({
            date,
            today: todayKst,
            firstEventDate: cardMetrics.firstEventDate,
            counts: cardMetrics.counts.get(cardMetricKey(c.id, date)),
          }) ?? undefined)
        : undefined,
    }))

    // 그 주에 새로 시작하는 상시 미션은 시작 요일 칸에 "시작" 항목으로 보여 준다(티켓 20260924_0907).
    const missionItems: CalendarCellItem[] = (missionsWeek?.openEndedStarting ?? [])
      .filter((m) => m.date === date)
      .map((m) => ({
        id: `mission-${m.id}`,
        time: '상시',
        label: m.title,
        kind: 'mission',
        href: `/admin/missions/${m.id}`,
      }))

    // 항목 id에는 실행 시각을 포함해 같은 날짜 안에서 겹치지 않게 한다(티켓 20260924_0930).
    const cronItems = occurrences
      .filter((o) => o.weekday === weekday)
      .map((o) => ({
        item: { id: cronOccurrenceId(o, date), time: formatOccurrenceTime(o), label: o.label } satisfies CalendarCellItem,
        sortMinutes: o.hourly ? -1 : o.hour * 60 + o.minute,
      }))
    const routineItems = routineOccurrences
      .filter((r) => r.date === date)
      .map((r) => {
        const [hour, minute] = r.time.split(':').map(Number)
        return {
          item: {
            id: routineOccurrenceId(r),
            time: r.time,
            label: r.label,
            kind: 'routine',
            dim: !r.enabled,
          } satisfies CalendarCellItem,
          sortMinutes: hour * 60 + minute,
        }
      })
    // 카드 항목은 칸 안에서 자동화 항목(크론·루틴)보다 위에 둔다(티켓 20260924_0906).
    const automationItems = [...cronItems, ...routineItems]
      .sort((a, b) => a.sortMinutes - b.sortMinutes)
      .map(({ item }) => item)

    return {
      date,
      weekdayLabel: WEEKDAY_LABELS[weekday],
      dateLabel: `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`,
      items: [...cardItems, ...missionItems, ...automationItems],
      longCardsCount: cardDay?.longActiveCount,
      unprogrammed: cardDay?.unprogrammed,
    }
  })

  return (
    <WeeklyCalendar
      weekStart={weekStart}
      weekRangeLabel={formatWeekRangeLabel(weekStart)}
      columns={columns}
      missionBars={missionsWeek?.bars}
      openEndedMissionCount={missionsWeek?.openEndedCount}
    />
  )
}
