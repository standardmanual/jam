import Link from 'next/link'
import { Suspense } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/admin/ui/button'
import { Skeleton } from '@/components/admin/ui/skeleton'
import { OpsCommonRulesView } from '@/components/admin/ops/OpsCommonRulesView'
import { OpsPatternList } from '@/components/admin/ops/OpsPatternList'
import { OpsPatternProposalsStrip } from '@/components/admin/ops/OpsPatternProposalsStrip'
import { OpsSectionNotice } from '@/components/admin/ops/OpsSectionNotice'
import { logQueryError } from '@/lib/admin/queryError'
import { countOpsPatternUsage, loadDrawUsageRows, type OpsPatternUsageCount } from '@/lib/admin/opsPatterns/draw'
import { PATTERN_NEW_HREF, buildPatternRows, parsePatternListParams, patternListHref, type PatternView } from '@/lib/admin/opsPatterns/listView'
import {
  countPendingPatternProposals,
  listOpsCommonRules,
  listOpsPatterns,
  listOpsTasteSignals,
  type OpsCommonRuleRecord,
  type OpsPatternRecord,
  type OpsTasteSignalRecord,
} from '@/lib/admin/opsPatterns/read'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * 패턴 사전 (`/admin/ops-patterns`, 티켓 20261008_1400 ⑨a, 상위 20260930_1503 「채원 S5·S6 사전 판정」 ⑨ 목록, 운영툴 PRD §6 S5).
 *
 * 머리(제목·부제) → 탭 `[패턴 N] [공통 규칙·취향 신호]`(주소 `view=patterns|common`, 기본 patterns) → 탭 본문. 읽기 화면이고, 머리 오른쪽 [+ 새 패턴 만들기]가 만들기 화면(⑩a-2)으로 간다. 행 링크(상세)는 ⑨b가 달았다.
 * 사전·사용 기록·승인 대기 제안 건수·공통 규칙·취향 신호를 **따로 읽고** 구역마다 `Suspense`로 감싸, 하나가 실패해도 다른 구역은 보인다. 실패를 0이나 빈 상태로 보이지 않는다.
 * 「최근 4주」·「마지막 사용」은 조합 뽑기와 같은 세기 함수(`countOpsPatternUsage`)로 센다. 이 화면은 캐시하지 않는다(지금 상태를 보는 화면).
 *
 * 읽기는 `try/catch`로 감싸고 JSX는 그 밖에서 만든다(`react-hooks/error-boundaries`가 `try` 안의 JSX를 막는다).
 */

const PATTERN_PAGE_TITLE = '패턴 사전'
const PATTERN_NEW_LABEL = '+ 새 패턴 만들기'
const PATTERN_PAGE_SUBTITLE = '에이전트가 읽는 패턴과 공통 규칙을 보고 관리해요'
const PATTERN_LOAD_FAILED_TITLE = '패턴 사전을 불러오지 못했어요'

const TAB_CLASS =
  'inline-flex min-h-10 items-center border-b-2 px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

type Settled<T> = { ok: true; value: T } | { ok: false }

async function settle<T>(label: string, read: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await read() }
  } catch (error) {
    logQueryError({ message: error instanceof Error ? error.message : String(error) }, `ops-patterns/${label}`)
    return { ok: false }
  }
}

function SectionSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="불러오는 중">
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  )
}

function PatternTabs({ view, patternCount }: { view: PatternView; patternCount: number | null }) {
  const tabs: Array<{ view: PatternView; label: string }> = [
    { view: 'patterns', label: patternCount === null ? '패턴' : `패턴 ${patternCount}` },
    { view: 'common', label: '공통 규칙·취향 신호' },
  ]
  return (
    <nav aria-label="패턴 사전 보기" className="mb-4 border-b border-border">
      <ul className="-mb-px flex flex-wrap gap-1">
        {tabs.map((tab) => {
          const current = tab.view === view
          return (
            <li key={tab.view}>
              <Link
                href={patternListHref({ view: tab.view })}
                aria-current={current ? 'page' : undefined}
                className={cn(TAB_CLASS, current ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

async function ProposalsSection() {
  const result = await settle('proposals', () => countPendingPatternProposals(createServiceClient()))
  return <OpsPatternProposalsStrip count={result.ok ? result.value : null} />
}

async function PatternTableSection({ patterns, status }: { patterns: OpsPatternRecord[]; status: ReturnType<typeof parsePatternListParams>['status'] }) {
  const service = createServiceClient()
  const [rows, signals] = await Promise.all([
    settle('usage', () => loadDrawUsageRows(service)),
    settle('signals', () => listOpsTasteSignals(service)),
  ])
  const usage: Map<string, OpsPatternUsageCount> | null = rows.ok
    ? countOpsPatternUsage(
        rows.value,
        patterns.map((pattern) => pattern.patternNo),
        new Date()
      )
    : null
  const listRows = buildPatternRows(patterns, usage, signals.ok ? signals.value : null)
  return <OpsPatternList rows={listRows} status={status} usageFailed={!rows.ok} />
}

async function CommonSection() {
  const service = createServiceClient()
  const [rules, signals] = await Promise.all([
    settle<OpsCommonRuleRecord[]>('rules', () => listOpsCommonRules(service)),
    settle<OpsTasteSignalRecord[]>('signals', () => listOpsTasteSignals(service)),
  ])
  return <OpsCommonRulesView rules={rules.ok ? rules.value : null} signals={signals.ok ? signals.value : null} />
}

async function PatternsBody({ view, status }: ReturnType<typeof parsePatternListParams>) {
  // 사전은 보관까지 모두 읽는다(탭 숫자·상태별 개수·「보관」 필터가 한 번의 읽기로 정해진다).
  const patterns = await settle('patterns', () => listOpsPatterns(createServiceClient(), { includeArchived: true }))
  const patternCount = patterns.ok ? patterns.value.filter((pattern) => pattern.status !== 'archived').length : null

  return (
    <>
      <PatternTabs view={view} patternCount={patternCount} />
      {view === 'common' ? (
        <Suspense fallback={<SectionSkeleton />}>
          <CommonSection />
        </Suspense>
      ) : (
        <div className="space-y-4">
          <Suspense fallback={<Skeleton className="h-12 w-full rounded-lg" />}>
            <ProposalsSection />
          </Suspense>
          {patterns.ok ? (
            <Suspense fallback={<SectionSkeleton />}>
              <PatternTableSection patterns={patterns.value} status={status} />
            </Suspense>
          ) : (
            <OpsSectionNotice icon="patterns" title={PATTERN_LOAD_FAILED_TITLE} />
          )}
        </div>
      )}
    </>
  )
}

export default async function OpsPatternsPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = parsePatternListParams(pickSingleQueryParams(await searchParams))
  return (
    <div className="w-full p-4 md:p-8 space-y-6">
      <div className="w-full">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{PATTERN_PAGE_TITLE}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{PATTERN_PAGE_SUBTITLE}</p>
          </div>
          <Button asChild>
            <Link href={PATTERN_NEW_HREF}>{PATTERN_NEW_LABEL}</Link>
          </Button>
        </header>
        <Suspense fallback={<SectionSkeleton />}>
          <PatternsBody view={params.view} status={params.status} />
        </Suspense>
      </div>
    </div>
  )
}
