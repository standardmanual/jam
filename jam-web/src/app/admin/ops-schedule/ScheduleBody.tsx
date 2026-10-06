import Link from 'next/link'
import { IconAlertTriangle, IconCalendarOff } from '@tabler/icons-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import { Button } from '@/components/admin/ui/button'
import { Card } from '@/components/admin/ui/card'
import { OpsSectionNotice } from '@/components/admin/ops/OpsSectionNotice'
import { scheduleHref } from '@/lib/admin/opsHome/links'
import { periodOf, type ScheduleParams } from '@/lib/admin/opsSchedule/params'
import { loadScheduleWeek, type LoadedScheduleWeek, type ScheduleWeekSource } from '@/lib/admin/opsSchedule/load'
import { todayKstDateString } from '@/lib/admin/today-calendar'
import { OpsScheduleBoard } from './OpsScheduleBoard'

/**
 * 일정표의 본문 (티켓 20261006_1536 ③-a, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4 「상태」). 보기별로 읽어 그린다 — ③-a는 주간 보기뿐이다.
 *
 * 재료(카드·미션·운영 항목·신호·카드 노출 수)는 출처마다 격리해 읽는다. 일부만 못 읽으면 달력은 그대로 그리고 위에 「…를 읽지 못해 빠져 있어요」를 알린다 —
 * 못 읽은 것을 「없다」·「미편성」으로 단정하지 않는다. 카드·미션·운영 항목을 **모두** 못 읽으면 본문은 안내 카드 하나다.
 * 기간에 올라온 항목이 하나도 없고 못 읽은 재료도 없을 때만 「이 기간에는 올라온 항목이 없어요」를 알린다(달력은 그대로 보인다 — 자동 실행 줄이 있다).
 *
 * 읽기는 `try/catch`로 감싸고 JSX는 그 밖에서 만든다(`react-hooks/error-boundaries`가 `try` 안의 JSX를 막는다).
 */

export const SCHEDULE_LOAD_FAILED_TITLE = '일정을 불러오지 못했어요'
export const SCHEDULE_PARTIAL_FAILED_TITLE = '일부 일정을 불러오지 못했어요'
export const SCHEDULE_PARTIAL_FAILED_DESCRIPTION = '서버에 문제가 있었을 수 있어요. 새로 고쳐 다시 불러와 주세요'
export const SCHEDULE_EMPTY_TITLE = '이 기간에는 올라온 항목이 없어요'
export const SCHEDULE_TO_TODAY_LABEL = '오늘로 이동'

/** 못 읽은 재료마다의 안내 문장. 카드를 못 읽었을 때 「미편성」으로 단정하지 않는다. */
export const SCHEDULE_SOURCE_NOTICES: Record<ScheduleWeekSource, string> = {
  cards: '홈피드 카드를 읽지 못해 빠져 있어요',
  missions: '미션을 읽지 못해 빠져 있어요',
  bundles: '운영툴로 받은 항목을 읽지 못해 빠져 있어요',
  signals: '신호를 읽지 못해 칸에 표시하지 못했어요. 신호가 없다는 뜻은 아니에요',
  metrics: '카드의 노출·열람 수를 읽지 못해 빠져 있어요',
}

const NOTICE_ORDER: readonly ScheduleWeekSource[] = ['cards', 'missions', 'bundles', 'signals', 'metrics']

/** 카드·미션·운영 항목을 모두 못 읽었는가(달력에 그릴 내용이 없다). 신호·노출 수는 내용이 아니다. */
export function allContentFailed(sourceErrors: LoadedScheduleWeek['sourceErrors']): boolean {
  return Boolean(sourceErrors.cards && sourceErrors.missions && sourceErrors.bundles)
}

export async function ScheduleBody({ params }: { params: ScheduleParams }) {
  const weekStart = periodOf('week', params.date).start
  let loaded: LoadedScheduleWeek
  try {
    loaded = await loadScheduleWeek({ weekStart, includeSample: params.includeSample })
  } catch (error) {
    console.error('[admin/ops-schedule] 주간 일정 구역 오류:', error)
    return <OpsSectionNotice icon="week" title={SCHEDULE_LOAD_FAILED_TITLE} />
  }

  const { week, sourceErrors } = loaded
  if (allContentFailed(sourceErrors)) {
    return <OpsSectionNotice icon="week" title={SCHEDULE_LOAD_FAILED_TITLE} />
  }

  const failedNotices = NOTICE_ORDER.filter((source) => sourceErrors[source])
  const anyContentFailed = Boolean(sourceErrors.cards || sourceErrors.missions || sourceErrors.bundles)
  const today = todayKstDateString()
  const showsToday = week.days.some((day) => day.date === today)
  const isEmpty = week.contentCount === 0 && !anyContentFailed

  return (
    <div className="space-y-4">
      {failedNotices.length > 0 && (
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
      )}
      {isEmpty && (
        <Card className="flex flex-col items-start gap-2 p-5">
          <IconCalendarOff className="size-5 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">{SCHEDULE_EMPTY_TITLE}</p>
          {!showsToday && (
            <Button asChild variant="outline" size="sm">
              <Link
                href={scheduleHref(
                  { view: 'week', date: today, kinds: params.kinds, tribes: params.tribes, patterns: params.patterns },
                  { includeSample: params.includeSample }
                )}
              >
                {SCHEDULE_TO_TODAY_LABEL}
              </Link>
            </Button>
          )}
        </Card>
      )}
      <OpsScheduleBoard week={week} />
    </div>
  )
}
