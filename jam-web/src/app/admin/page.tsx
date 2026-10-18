import Link from 'next/link'
import { Suspense } from 'react'
import { IconPlus, IconMapPinPlus, IconNotes, IconDeviceGamepad2 } from '@tabler/icons-react'
import { Skeleton } from '@/components/admin/ui/skeleton'
import { OpsSampleBusy, OpsSampleScope } from '@/components/admin/ops/OpsSampleSwitch'
import { readIncludeSample } from '@/lib/admin/opsHome/links'
import { singleQueryParam, type SearchParamValue } from '@/lib/searchParams'
import {
  KpiSection,
  RecentDecisionsSection,
  SampleSwitchSection,
  ServiceCheckSection,
  SignalSection,
  StatsSection,
  TrendSection,
  WeekStatusSection,
  startKpiWeekly,
} from './_home/sections'

/**
 * 운영 홈 (`/admin`, 티켓 20261006_1341 ②-c, 상위 20260930_1502 「채원 S1·S4 사전 판정」·운영툴 PRD §6 S1).
 *
 * 머리(제목·부제·시험 묶음 스위치) 아래에 구역을 순서대로 둔다: 이번 주 상태 → 신호 → 서비스 점검 → 최근 이력 → 주간 핵심 지표 → 배지 경제 흐름 → 통계 → 빠른 실행.
 * 페이지는 쿼리(`sample`·`trend`)만 읽고(옛 `?week=`는 읽지 않고 무시한다), 구역마다 `Suspense` + 스켈레톤으로 따로 읽어 느린 구역이 다른 구역을 막지 않는다(승인 #18).
 * 한 구역을 읽지 못하면 그 구역만 안내 카드가 된다(`_home/sections.tsx`). 이 화면은 캐시하지 않는다(`unstable_cache`·`revalidate` 없음).
 *
 * 주간 캘린더는 일정표(`/admin/ops-schedule`, 티켓 20261006_1539 ③-d)로 옮겼다. 「이번 주 상태」 머리의 [일정표 보기 →]로 들어간다.
 */

interface AdminDashboardPageProps {
  searchParams: Promise<{ trend?: SearchParamValue; sample?: SearchParamValue }>
}

const SHORTCUTS = [
  { label: '배지 등록', href: '/admin/badges/new', icon: IconPlus },
  { label: '장소 등록', href: '/admin/poi/new', icon: IconMapPinPlus },
  { label: '컬렉션 등록', href: '/admin/itembooks/new', icon: IconNotes },
  { label: '시뮬레이터 실행', href: '/admin/simulator', icon: IconDeviceGamepad2 },
]

/** 구역을 읽는 동안 보이는 자리. 높이는 구역마다 다르게 줘서 읽힌 뒤 화면이 크게 밀리지 않게 한다. */
function SectionFallback({ heightClass }: { heightClass: string }) {
  return (
    <div role="status" aria-label="불러오는 중" className="space-y-3">
      <Skeleton className="h-6 w-32" />
      <Skeleton className={`w-full ${heightClass}`} />
    </div>
  )
}

export default async function AdminDashboardPage({ searchParams }: AdminDashboardPageProps) {
  const resolvedSearchParams = await searchParams
  const includeSample = readIncludeSample(resolvedSearchParams)
  const trendParam = singleQueryParam(resolvedSearchParams.trend)
  // 주간 지표는 한 번만 읽어 서비스 점검(Strava 칸)과 주간 핵심 지표 두 구역에 같이 넘긴다.
  const kpi = startKpiWeekly()

  return (
    <OpsSampleScope>
      <div className="p-8 max-w-6xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div>
            <h1 className="text-2xl font-bold">운영 홈</h1>
            <p className="text-sm text-muted-foreground mt-1">이번 주 라이브 운영의 진행과 신호를 한눈에 봐요</p>
          </div>
          <Suspense fallback={<Skeleton className="h-11 w-64" />}>
            <SampleSwitchSection includeSample={includeSample} />
          </Suspense>
        </header>

        <OpsSampleBusy className="space-y-10">
          <Suspense fallback={<SectionFallback heightClass="h-40" />}>
            <WeekStatusSection includeSample={includeSample} />
          </Suspense>

          <Suspense fallback={<SectionFallback heightClass="h-48" />}>
            <SignalSection includeSample={includeSample} />
          </Suspense>

          <Suspense fallback={<SectionFallback heightClass="h-32" />}>
            <ServiceCheckSection kpi={kpi} />
          </Suspense>

          <Suspense fallback={<SectionFallback heightClass="h-56" />}>
            <RecentDecisionsSection includeSample={includeSample} />
          </Suspense>

          <Suspense fallback={<SectionFallback heightClass="h-32" />}>
            <KpiSection kpi={kpi} />
          </Suspense>

          <Suspense fallback={<SectionFallback heightClass="h-56" />}>
            <TrendSection trendParam={trendParam} includeSample={includeSample} />
          </Suspense>

          <Suspense fallback={<SectionFallback heightClass="h-28" />}>
            <StatsSection />
          </Suspense>

          <section aria-labelledby="ops-shortcuts-heading">
            <h2 id="ops-shortcuts-heading" className="text-base font-semibold mb-4 text-foreground">
              빠른 실행
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {SHORTCUTS.map((s) => (
                <Link
                  key={s.label}
                  href={s.href}
                  className="flex items-center gap-3 bg-white border border-border rounded-xl p-4 hover:border-primary/30 hover:bg-primary/5 transition-colors"
                >
                  <s.icon className="h-6 w-6 text-muted-foreground" />
                  <span className="font-medium">{s.label}</span>
                </Link>
              ))}
            </div>
          </section>
        </OpsSampleBusy>
      </div>
    </OpsSampleScope>
  )
}
