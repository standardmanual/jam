import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { Skeleton } from '@/components/admin/ui/skeleton'
import { EditorShell } from '@/components/admin/AdminEditorLayout'
import {
  OpsPatternDetailActions,
  OpsPatternDetailHeader,
  OpsPatternKnobsSection,
  OpsPatternPitfallsSection,
  OpsPatternRail,
  OpsPatternResultSection,
  OpsPatternSamplesSection,
  OpsPatternSignals,
  OpsPatternSummarySection,
  PatternBackLink,
  PatternSection,
} from '@/components/admin/ops/OpsPatternDetail'
import { OpsPatternUsage } from '@/components/admin/ops/OpsPatternUsage'
import { OpsSectionNotice } from '@/components/admin/ops/OpsSectionNotice'
import { logQueryError } from '@/lib/admin/queryError'
import { OPS_PATTERN_NO_PATTERN } from '@/lib/admin/opsPatterns/constants'
import { parseUsagePage, selectPatternUsage, tasteSignalLines } from '@/lib/admin/opsPatterns/detailView'
import { countOpsPatternUsage, loadPatternUsageRows } from '@/lib/admin/opsPatterns/draw'
import { getOpsPattern, listOpsTasteSignals } from '@/lib/admin/opsPatterns/read'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * 패턴 상세 (`/admin/ops-patterns/[patternNo]`, 티켓 20261008_1435 ⑨b, 상위 20260930_1503 「채원 S5·S6 사전 판정」 ⑨ 상세, 운영툴 PRD §6 S5). 화면은 읽기만 하고,
 * 머리의 [수정하기]·[상태 바꾸기 ▾]가 쓰기(티켓 20261008_1617 ⑩a-2)로 이어진다.
 *
 * 번호 형식이 `P01`~이 아니거나 사전에 없으면 404다(보관 패턴도 번호로 열린다). 패턴 읽기가 **실패**하면 404가 아니라 안내 카드다.
 * 패턴(머리·요약·손잡이·샘플·주의점) / 취향 신호 / 사용 이력을 **따로 읽고** 뒤의 둘은 `Suspense`로 감싸, 하나가 실패해도 다른 구역은 보인다.
 * 실패를 0이나 빈 상태로 보이지 않는다. 사용 이력의 요약 숫자는 목록·조합 뽑기와 같은 세기 함수(`countOpsPatternUsage`)로 센다. 이 화면은 캐시하지 않는다.
 *
 * 읽기는 `try/catch`로 감싸고 JSX는 그 밖에서 만든다(`react-hooks/error-boundaries`가 `try` 안의 JSX를 막는다).
 */

const PATTERN_LOAD_FAILED_TITLE = '패턴을 불러오지 못했어요'
const SIGNALS_LOAD_FAILED_TITLE = '취향 신호를 불러오지 못했어요'

type Settled<T> = { ok: true; value: T } | { ok: false }

async function settle<T>(label: string, read: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await read() }
  } catch (error) {
    logQueryError({ message: error instanceof Error ? error.message : String(error) }, `ops-patterns/detail/${label}`)
    return { ok: false }
  }
}

function SectionSkeleton() {
  return <Skeleton className="h-40 w-full rounded-lg" role="status" aria-label="불러오는 중" />
}

async function SignalsSection({ patternNo }: { patternNo: string }) {
  const result = await settle('signals', () => listOpsTasteSignals(createServiceClient(), { patternNo }))
  return (
    <PatternSection id="signals">
      {result.ok ? (
        <OpsPatternSignals signals={tasteSignalLines(result.value, patternNo)} patternNo={patternNo} />
      ) : (
        <OpsSectionNotice icon="patterns" title={SIGNALS_LOAD_FAILED_TITLE} />
      )}
    </PatternSection>
  )
}

async function UsageSection({ patternNo, usagePage }: { patternNo: string; usagePage: string | undefined }) {
  const rows = await settle('usage', () => loadPatternUsageRows(createServiceClient()))
  const lines = rows.ok ? selectPatternUsage(rows.value, patternNo) : null
  const summary = rows.ok ? (countOpsPatternUsage(rows.value, [patternNo], new Date()).get(patternNo) ?? { uses: 0, lastUsedAt: null }) : null
  const page = parseUsagePage(usagePage, lines?.length ?? 0)
  return (
    <PatternSection id="usage">
      <OpsPatternUsage patternNo={patternNo} summary={summary} lines={lines} page={page} />
    </PatternSection>
  )
}

export default async function OpsPatternDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ patternNo: string }>
  searchParams: SearchParamsPromise
}) {
  const { patternNo } = await params
  if (!OPS_PATTERN_NO_PATTERN.test(patternNo)) notFound()
  const { usagePage } = pickSingleQueryParams(await searchParams)

  const pattern = await settle('pattern', () => getOpsPattern(createServiceClient(), patternNo))
  if (pattern.ok && pattern.value === null) notFound()

  if (!pattern.ok || pattern.value === null) {
    return (
      <div className="w-full p-4 md:p-8">
        <div className="w-full space-y-4">
          <PatternBackLink />
          <OpsSectionNotice icon="patterns" title={PATTERN_LOAD_FAILED_TITLE} />
        </div>
      </div>
    )
  }

  const record = pattern.value
  return (
    <div className="w-full p-4 md:p-8">
      <div className="w-full">
        <EditorShell
          railLabel="패턴 정보"
          header={<OpsPatternDetailHeader pattern={record} actions={<OpsPatternDetailActions pattern={record} />} />}
          rail={<OpsPatternRail pattern={record} />}
          main={
            <>
              <OpsPatternSummarySection pattern={record} />
              <OpsPatternKnobsSection knobs={record.knobs} />
              <OpsPatternSamplesSection samples={record.samples} />
              <OpsPatternPitfallsSection pitfalls={record.pitfalls} />
              <Suspense fallback={<SectionSkeleton />}>
                <SignalsSection patternNo={record.patternNo} />
              </Suspense>
              <Suspense fallback={<SectionSkeleton />}>
                <UsageSection patternNo={record.patternNo} usagePage={usagePage} />
              </Suspense>
              <OpsPatternResultSection />
            </>
          }
        />
      </div>
    </div>
  )
}
