import Link from 'next/link'
import { IconAlertTriangle, IconCalendarOff } from '@tabler/icons-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import { Button } from '@/components/admin/ui/button'
import { Card } from '@/components/admin/ui/card'
import { OpsSectionNotice } from '@/components/admin/ops/OpsSectionNotice'
import { scheduleHref } from '@/lib/admin/opsHome/links'
import {
  filterScheduleMonth,
  filterScheduleTimeline,
  filterScheduleWeek,
  filtersExcludeLegacy,
  hasScheduleFilters,
} from '@/lib/admin/opsSchedule/filters'
import { periodOf, type ScheduleParams } from '@/lib/admin/opsSchedule/params'
import {
  loadScheduleMonth,
  loadScheduleWeek,
  type LoadedScheduleMonth,
  type LoadedScheduleWeek,
  type ScheduleSource,
  type ScheduleSourceErrors,
} from '@/lib/admin/opsSchedule/load'
import { loadScheduleTimeline, type LoadedScheduleTimeline } from '@/lib/admin/opsSchedule/timelineLoad'
import { todayKstDateString } from '@/lib/admin/today-calendar'
import { OpsScheduleBoard } from './OpsScheduleBoard'

/**
 * 일정표의 본문 (티켓 20261006_1536 ③-a, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4 「상태」). 보기별로 읽어 그린다 — 주간(③-a)·월간·타임라인(티켓 20261006_1538 ③-c).
 *
 * 재료(카드·미션·운영 항목·신호·카드 노출 수, 타임라인은 드랍 일정·컬렉션·준비 기간 규칙도)는 출처마다 격리해 읽는다. 일부만 못 읽으면 달력은 그대로 그리고 위에 「…를 읽지 못해 빠져 있어요」를 알린다 —
 * 못 읽은 것을 「없다」·「미편성」으로 단정하지 않는다. 카드·미션·운영 항목을 **모두** 못 읽으면 본문은 안내 카드 하나다.
 * 기간에 올라온 항목이 하나도 없고 못 읽은 재료도 없을 때만 「이 기간에는 올라온 항목이 없어요」를 알린다(달력은 그대로 보인다 — 주간은 자동 실행 줄이, 월간·타임라인은 칸 틀이 있다).
 *
 * 읽기는 `try/catch`로 감싸고 JSX는 그 밖에서 만든다(`react-hooks/error-boundaries`가 `try` 안의 JSX를 막는다).
 *
 * 항목·날짜 서랍(티켓 20261006_1537 ③-b)은 보기 래퍼(`OpsScheduleBoard`)가 그린다. 못 읽은 재료(`sourceErrors`)를 함께 넘겨 날짜 서랍이 「대표 카드가 없어요」·「항목이 없어요」로 단정하지 않게 한다.
 */

export const SCHEDULE_LOAD_FAILED_TITLE = '일정을 불러오지 못했어요'
export const SCHEDULE_PARTIAL_FAILED_TITLE = '일부 일정을 불러오지 못했어요'
export const SCHEDULE_PARTIAL_FAILED_DESCRIPTION = '서버에 문제가 있었을 수 있어요. 새로 고쳐 다시 불러와 주세요'
export const SCHEDULE_EMPTY_TITLE = '이 기간에는 올라온 항목이 없어요'
export const SCHEDULE_TO_TODAY_LABEL = '오늘로 이동'
export const SCHEDULE_FILTER_EMPTY_TITLE = '이 조건에 맞는 항목이 없어요'
export const SCHEDULE_FILTER_CLEAR_LABEL = '거르기 지우기'
/** 트라이브·패턴으로 거르면 옛 카드·미션(트라이브·패턴이 없는 실제 자원)이 빠진다는 안내(가정 6). */
export const SCHEDULE_FILTER_LEGACY_NOTICE = '트라이브·패턴으로 거르면 운영툴로 받은 항목만 보여요. 옛 카드와 미션은 빠져요'

/** 못 읽은 재료마다의 안내 문장. 카드를 못 읽었을 때 「미편성」으로 단정하지 않는다. */
export const SCHEDULE_SOURCE_NOTICES: Record<ScheduleSource, string> = {
  cards: '홈피드 카드를 읽지 못해 빠져 있어요',
  missions: '미션을 읽지 못해 빠져 있어요',
  bundles: '운영툴로 받은 항목을 읽지 못해 빠져 있어요',
  signals: '신호를 읽지 못해 칸에 표시하지 못했어요. 신호가 없다는 뜻은 아니에요',
  metrics: '카드의 노출·열람 수를 읽지 못해 빠져 있어요',
  dropSchedules: '드랍 일정을 읽지 못해 빠져 있어요',
  itemBooks: '컬렉션을 읽지 못해 빠져 있어요',
  rules: '컬렉션 준비 기간 기준을 읽지 못해 28일로 그렸어요',
}

const NOTICE_ORDER: readonly ScheduleSource[] = ['cards', 'missions', 'bundles', 'signals', 'metrics', 'dropSchedules', 'itemBooks', 'rules']

/** 카드·미션·운영 항목을 모두 못 읽었는가(달력에 그릴 내용이 없다). 신호·노출 수는 내용이 아니다. */
export function allContentFailed(sourceErrors: ScheduleSourceErrors): boolean {
  return Boolean(sourceErrors.cards && sourceErrors.missions && sourceErrors.bundles)
}

/** 카드·미션·운영 항목 중 하나라도 못 읽었는가(기간이 비어 있어도 「없다」고 단정할 수 없다). */
function anyContentFailed(sourceErrors: ScheduleSourceErrors): boolean {
  return Boolean(sourceErrors.cards || sourceErrors.missions || sourceErrors.bundles)
}

/** 못 읽은 재료 안내(경고). 읽지 못한 것이 없으면 아무것도 그리지 않는다. */
function SourceNotices({ sourceErrors }: { sourceErrors: ScheduleSourceErrors }) {
  const failedNotices = NOTICE_ORDER.filter((source) => sourceErrors[source])
  if (failedNotices.length === 0) return null
  return (
    <Alert variant="warning">
      <IconAlertTriangle className="size-4" aria-hidden="true" />
      <AlertTitle>{SCHEDULE_PARTIAL_FAILED_TITLE}</AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-0.5 pl-5">
          {failedNotices.map((source) => (
            <li key={source}>{SCHEDULE_SOURCE_NOTICES[source]}</li>
          ))}
        </ul>
        <p className="mt-2">{SCHEDULE_PARTIAL_FAILED_DESCRIPTION}</p>
      </AlertDescription>
    </Alert>
  )
}

/** 기간이 비었다는 안내 + (오늘이 이 기간에 없으면) [오늘로 이동]. 같은 보기·같은 거르기로 오늘 날짜를 연다. */
function EmptyPeriod({ params, showsToday }: { params: ScheduleParams; showsToday: boolean }) {
  return (
    <Card className="flex flex-col items-start gap-2 p-5">
      <IconCalendarOff className="size-5 text-muted-foreground" aria-hidden="true" />
      <p className="font-medium">{SCHEDULE_EMPTY_TITLE}</p>
      {!showsToday && (
        <Button asChild variant="outline" size="sm">
          <Link
            href={scheduleHref(
              { view: params.view, date: todayKstDateString(), kinds: params.kinds, tribes: params.tribes, patterns: params.patterns },
              { includeSample: params.includeSample }
            )}
          >
            {SCHEDULE_TO_TODAY_LABEL}
          </Link>
        </Button>
      )}
    </Card>
  )
}

/** 거르기를 모두 지운 같은 화면 링크(보기·기준일·시험 묶음 포함은 그대로, 서랍은 닫는다). */
function clearFiltersHref(params: ScheduleParams): string {
  return scheduleHref({ view: params.view, date: params.date }, { includeSample: params.includeSample })
}

/** 거르기에 맞는 항목이 하나도 없을 때의 안내 + [거르기 지우기]. */
function FilterEmpty({ params }: { params: ScheduleParams }) {
  return (
    <Card className="flex flex-col items-start gap-2 p-5">
      <IconCalendarOff className="size-5 text-muted-foreground" aria-hidden="true" />
      <p className="font-medium">{SCHEDULE_FILTER_EMPTY_TITLE}</p>
      <Button asChild variant="outline" size="sm">
        <Link href={clearFiltersHref(params)}>{SCHEDULE_FILTER_CLEAR_LABEL}</Link>
      </Button>
    </Card>
  )
}

/** 거르기 결과 안내: 트라이브·패턴으로 거르면 옛 카드·미션이 빠진다는 문장. */
function FilterLegacyNotice({ params }: { params: ScheduleParams }) {
  if (!filtersExcludeLegacy(params)) return null
  return <p className="text-sm text-muted-foreground">{SCHEDULE_FILTER_LEGACY_NOTICE}</p>
}

/** 이 기간(주·달력·창)에 오늘이 들어 있는가. */
function periodShowsToday(view: ScheduleParams['view'], date: string): boolean {
  const { start, end } = periodOf(view, date)
  const today = todayKstDateString()
  return today >= start && today <= end
}

async function WeekBody({ params }: { params: ScheduleParams }) {
  const weekStart = periodOf('week', params.date).start
  let loaded: LoadedScheduleWeek
  try {
    loaded = await loadScheduleWeek({ weekStart, includeSample: params.includeSample })
  } catch (error) {
    console.error('[admin/ops-schedule] 주간 일정 구역 오류:', error)
    return <OpsSectionNotice icon="week" title={SCHEDULE_LOAD_FAILED_TITLE} />
  }

  const { sourceErrors } = loaded
  if (allContentFailed(sourceErrors)) {
    return <OpsSectionNotice icon="week" title={SCHEDULE_LOAD_FAILED_TITLE} />
  }

  const week = filterScheduleWeek(loaded.week, params)
  const today = todayKstDateString()
  const showsToday = week.days.some((day) => day.date === today)
  const isEmpty = week.contentCount === 0 && !anyContentFailed(sourceErrors)
  const filtered = hasScheduleFilters(params)

  return (
    <div className="space-y-4">
      <SourceNotices sourceErrors={sourceErrors} />
      <FilterLegacyNotice params={params} />
      {isEmpty && (filtered ? <FilterEmpty params={params} /> : <EmptyPeriod params={params} showsToday={showsToday} />)}
      <OpsScheduleBoard week={week} sourceErrors={sourceErrors} />
    </div>
  )
}

async function MonthBody({ params }: { params: ScheduleParams }) {
  let loaded: LoadedScheduleMonth
  try {
    loaded = await loadScheduleMonth({ date: params.date, includeSample: params.includeSample })
  } catch (error) {
    console.error('[admin/ops-schedule] 월간 일정 구역 오류:', error)
    return <OpsSectionNotice icon="week" title={SCHEDULE_LOAD_FAILED_TITLE} />
  }

  const { sourceErrors } = loaded
  if (allContentFailed(sourceErrors)) {
    return <OpsSectionNotice icon="week" title={SCHEDULE_LOAD_FAILED_TITLE} />
  }

  const month = filterScheduleMonth(loaded.month, params)
  const isEmpty = month.contentCount === 0 && !anyContentFailed(sourceErrors)
  return (
    <div className="space-y-4">
      <SourceNotices sourceErrors={sourceErrors} />
      <FilterLegacyNotice params={params} />
      {isEmpty &&
        (hasScheduleFilters(params) ? <FilterEmpty params={params} /> : <EmptyPeriod params={params} showsToday={periodShowsToday('month', params.date)} />)}
      <OpsScheduleBoard month={month} sourceErrors={sourceErrors} />
    </div>
  )
}

async function TimelineBody({ params }: { params: ScheduleParams }) {
  let loaded: LoadedScheduleTimeline
  try {
    loaded = await loadScheduleTimeline({ date: params.date, includeSample: params.includeSample })
  } catch (error) {
    console.error('[admin/ops-schedule] 타임라인 구역 오류:', error)
    return <OpsSectionNotice icon="week" title={SCHEDULE_LOAD_FAILED_TITLE} />
  }

  const { sourceErrors } = loaded
  if (allContentFailed(sourceErrors)) {
    return <OpsSectionNotice icon="week" title={SCHEDULE_LOAD_FAILED_TITLE} />
  }
  const timeline = filterScheduleTimeline(loaded.timeline, params)

  // 드랍 일정·컬렉션은 타임라인에만 있는 재료라, 못 읽었으면 이 보기도 「없다」고 단정할 수 없다.
  const timelineContentFailed = anyContentFailed(sourceErrors) || Boolean(sourceErrors.dropSchedules || sourceErrors.itemBooks)
  const isEmpty = timeline.contentCount === 0 && !timelineContentFailed
  return (
    <div className="space-y-4">
      <SourceNotices sourceErrors={sourceErrors} />
      <FilterLegacyNotice params={params} />
      {isEmpty && (hasScheduleFilters(params) ? <FilterEmpty params={params} /> : <EmptyPeriod params={params} showsToday={timeline.todayCol !== null} />)}
      <OpsScheduleBoard timeline={timeline} sourceErrors={sourceErrors} />
    </div>
  )
}

/**
 * 보기에 맞는 본문을 읽어 돌려준다. 보기별 본문은 비동기 서버 함수라 **요소가 아니라 호출 결과**를 돌려준다(`await ScheduleBody(…)`가 곧 그려질 요소를 준다 —
 * 정적 렌더 테스트가 같은 방식으로 부른다).
 */
export async function ScheduleBody({ params }: { params: ScheduleParams }) {
  if (params.view === 'month') return MonthBody({ params })
  if (params.view === 'timeline') return TimelineBody({ params })
  return WeekBody({ params })
}
