import Link from 'next/link'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import { cn } from '@/lib/utils'
import { scheduleHref } from '@/lib/admin/opsHome/links'
import { formatPeriodLabel, shiftPeriod, type ScheduleParams, type ScheduleView } from '@/lib/admin/opsSchedule/params'
import { todayKstDateString } from '@/lib/admin/today-calendar'

/**
 * 일정표의 도구줄 (티켓 20261006_1536 ③-a, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4 「보기 전환 한 줄 탭 3개」·[‹][오늘][›] 기간).
 *
 * `[주간 | 월간 | 타임라인]` 탭과 `[‹] [오늘] [›] 기간 글자`다. 모든 링크는 `scheduleHref`로만 만들어 시험 묶음 포함(`?sample=1`)·기준일·거르기를 잃지 않는다.
 * 보기를 바꿔도 기준일은 그대로이고, 기간을 옮기면 서랍은 닫힌다(`drawer`·`item`을 잇지 않는다). 링크뿐이라 훅이 없는 서버 컴포넌트다.
 *
 * ③-a에서는 주간 탭만 열려 있고 월간·타임라인은 ③-c가 만든다(`SCHEDULE_ENABLED_VIEWS`). 아직 못 누르는 탭은 링크가 아니라 눌리지 않는 글자로 둔다.
 * 컨테이너 폭 40rem 미만에서만 버튼·탭이 44px(`min-h-11`·`h-11`)이고 그 이상은 40px(`h-10`)다(채원 판정 「버튼 데스크톱 `h-10`, 40rem 미만 `h-11`」, 티켓 20261006_1537).
 */

/** 지금 화면이 그릴 수 있는 보기. ③-c가 월간·타임라인을 더한다. */
export const SCHEDULE_ENABLED_VIEWS: readonly ScheduleView[] = ['week']

const VIEW_LABELS: Record<ScheduleView, string> = { week: '주간', month: '월간', timeline: '타임라인' }
const VIEW_ORDER: readonly ScheduleView[] = ['week', 'month', 'timeline']
const PREVIOUS_LABELS: Record<ScheduleView, string> = { week: '이전 주', month: '이전 달', timeline: '이전 4주' }
const NEXT_LABELS: Record<ScheduleView, string> = { week: '다음 주', month: '다음 달', timeline: '다음 4주' }
export const SCHEDULE_TODAY_LABEL = '오늘'

const TAB_BASE = 'inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium @[40rem]:min-h-10'

interface ScheduleToolbarProps {
  /** 지금 그리는 보기(주소의 `view`가 아직 못 그리는 보기면 호출부가 `week`로 바꿔 넘긴다). */
  view: ScheduleView
  params: ScheduleParams
}

export function ScheduleToolbar({ view, params }: ScheduleToolbarProps) {
  const { date, includeSample } = params
  const options = { includeSample }
  // 기간을 옮기거나 보기를 바꾸면 서랍은 닫고 거르기는 이어 간다.
  const base = { kinds: params.kinds, tribes: params.tribes, patterns: params.patterns }
  const previousHref = scheduleHref({ ...base, view, date: shiftPeriod(view, date, -1) }, options)
  const nextHref = scheduleHref({ ...base, view, date: shiftPeriod(view, date, 1) }, options)
  const todayHref = scheduleHref({ ...base, view, date: todayKstDateString() }, options)

  return (
    <div className="@container flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <nav aria-label="보기 전환">
        <ul className="flex flex-wrap items-center gap-1">
          {VIEW_ORDER.map((tab) => {
            const label = VIEW_LABELS[tab]
            if (!SCHEDULE_ENABLED_VIEWS.includes(tab)) {
              return (
                <li key={tab}>
                  <span aria-disabled="true" className={cn(TAB_BASE, 'cursor-not-allowed border-transparent text-muted-foreground/60')}>
                    {label}
                  </span>
                </li>
              )
            }
            const current = tab === view
            return (
              <li key={tab}>
                <Link
                  href={scheduleHref({ ...base, view: tab, date }, options)}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    TAB_BASE,
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    current ? 'border-border bg-muted text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="h-11 w-11 @[40rem]:h-10 @[40rem]:w-10">
          <Link href={previousHref} aria-label={PREVIOUS_LABELS[view]}>
            <IconChevronLeft className="size-4" aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-11 @[40rem]:h-10">
          <Link href={todayHref}>{SCHEDULE_TODAY_LABEL}</Link>
        </Button>
        <Button asChild variant="ghost" size="icon" className="h-11 w-11 @[40rem]:h-10 @[40rem]:w-10">
          <Link href={nextHref} aria-label={NEXT_LABELS[view]}>
            <IconChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
        <span className="text-sm font-bold">{formatPeriodLabel(view, date)}</span>
      </div>
    </div>
  )
}
