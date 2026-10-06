import { Suspense } from 'react'
import { Skeleton } from '@/components/admin/ui/skeleton'
import { OpsSampleBusy, OpsSampleScope } from '@/components/admin/ops/OpsSampleSwitch'
import { parseScheduleParams, periodOf, type ScheduleView } from '@/lib/admin/opsSchedule/params'
import type { SearchParamsPromise } from '@/lib/searchParams'
import { SampleSwitchSection } from '../_home/sections'
import { ScheduleBody } from './ScheduleBody'
import { ScheduleFilterBar } from './ScheduleFilterBar'
import { ScheduleToolbar } from './ScheduleToolbar'

/**
 * 일정표 (`/admin/ops-schedule`, 티켓 20261006_1536 ③-a, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4·운영툴 PRD §6 S4).
 *
 * 머리(제목·부제·시험 묶음 스위치) → 도구줄(보기 탭·기간 이동) → 거르기 줄(종류·트라이브·패턴, 티켓 20261006_1539 ③-d) → 본문. 본문만 `Suspense` + 스켈레톤으로 따로 읽어, 머리와 도구줄은 바로 보인다.
 * 주소(`view`·`date`·`sample`·서랍)가 화면 상태의 전부라 새로고침해도 유지된다. 시험 스위치는 운영 홈(S1)과 같은 부품·같은 `?sample=1`이다.
 * 사이드바 「일정표」와 운영 홈 「이번 주 상태」의 [일정표 보기 →]로 들어온다. 이 화면은 캐시하지 않는다(지금 상태를 보는 화면).
 *
 * 주간·월간·타임라인 세 보기를 모두 그린다(월간·타임라인은 티켓 20261006_1538 ③-c). 본문을 읽는 동안의 대체 화면은 보기마다 모양이 다르다(주간 칸 7개·월간 달력·타임라인 줄).
 */

interface OpsSchedulePageProps {
  searchParams: SearchParamsPromise
}

/** 본문을 읽는 동안 보이는 자리. 보기마다 읽힌 뒤 모양(주간 칸 7개·월간 달력·타임라인 줄)을 따라 화면이 크게 밀리지 않는다. */
function ScheduleFallback({ view }: { view: ScheduleView }) {
  if (view === 'month') {
    return (
      <div role="status" aria-label="불러오는 중" className="space-y-1">
        <Skeleton className="mb-2 h-4 w-full" />
        {Array.from({ length: 5 }, (_, week) => (
          <div key={week} className="grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }, (_, day) => (
              <Skeleton key={day} className="h-16 w-full md:h-28" />
            ))}
          </div>
        ))}
      </div>
    )
  }
  if (view === 'timeline') {
    return (
      <div role="status" aria-label="불러오는 중" className="space-y-2 rounded-xl border border-border p-3">
        <Skeleton className="h-5 w-full" />
        {Array.from({ length: 4 }, (_, row) => (
          <Skeleton key={row} className="h-10 w-full" />
        ))}
      </div>
    )
  }
  return (
    <div role="status" aria-label="불러오는 중" className="space-y-3">
      <Skeleton className="h-6 w-40" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-7">
        {Array.from({ length: 7 }, (_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
    </div>
  )
}

export default async function OpsSchedulePage({ searchParams }: OpsSchedulePageProps) {
  const params = parseScheduleParams(await searchParams)
  const view = params.view

  return (
    <OpsSampleScope>
      <div className="p-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div>
            <h1 className="text-2xl font-bold">일정표</h1>
            <p className="text-sm text-muted-foreground mt-1">한 주·한 달·몇 주 치 일정을 보고, 누르면 그 기획을 바로 열어요</p>
          </div>
          <Suspense fallback={<Skeleton className="h-11 w-64" />}>
            <SampleSwitchSection includeSample={params.includeSample} />
          </Suspense>
        </header>

        <OpsSampleBusy className="space-y-6">
          <ScheduleToolbar view={view} params={params} />
          <Suspense fallback={<Skeleton className="h-11 w-full @[40rem]:h-10" />}>
            <ScheduleFilterBar view={view} />
          </Suspense>
          {/* 보기·기간·시험 포함이 바뀔 때마다 대체 화면이 다시 보이도록 key를 준다. 기준일이 아니라 기간의 시작일을 쓴다: 날짜 서랍을 열며 같은 주 안에서 `date`가 바뀌어도
              (결정 뒤 서버 화면을 다시 읽어도) 보기 틀이 다시 만들어지지 않아야 서랍·선택·잔상이 남는다(티켓 20261006_1537) */}
          <Suspense key={`${view}-${periodOf(view, params.date).start}-${params.includeSample}`} fallback={<ScheduleFallback view={view} />}>
            <ScheduleBody params={params} />
          </Suspense>
        </OpsSampleBusy>
      </div>
    </OpsSampleScope>
  )
}
