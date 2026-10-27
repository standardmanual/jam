import { Suspense } from 'react'
import { Skeleton } from '@/components/admin/ui/skeleton'
import { parseNodeParam } from '@/lib/admin/ecosystem/view'
import { singleQueryParam, type SearchParamValue } from '@/lib/searchParams'
import { GoalSection, MapSection, PolicySection, startSnapshot, SummarySection } from './_sections'

/**
 * 생태계 상황판 (`/admin/ecosystem`, 티켓 20261026_2027 3-1, 운영툴 PRD admin-boards §7)
 *
 * 위에서 아래로: 머리(제목·설명·요약 줄) → 목표 대비 → 순환 지도 → 정책 패널(지도에서 마디를 누르면 아래에 열린다).
 * 페이지는 쿼리 `node`(마디 ID)만 읽는다. 허용 밖 값은 선택 없음으로 본다. 구역마다 `Suspense` + 스켈레톤으로 따로 읽고,
 * 한 구역이 실패하면 그 구역만 안내 카드다(`_sections.tsx`). 이 화면은 캐시하지 않는다.
 */
export const dynamic = 'force-dynamic'

interface EcosystemPageProps {
  searchParams: Promise<{ node?: SearchParamValue }>
}

/** 구역을 읽는 동안 보이는 자리. 높이는 구역마다 다르게 줘서 읽힌 뒤 화면이 크게 밀리지 않게 한다 */
function SectionFallback({ heightClass }: { heightClass: string }) {
  return (
    <div role="status" aria-label="불러오는 중" className="space-y-3">
      <Skeleton className="h-6 w-32" />
      <Skeleton className={`w-full ${heightClass}`} />
    </div>
  )
}

export default async function EcosystemPage({ searchParams }: EcosystemPageProps) {
  const resolved = await searchParams
  const node = parseNodeParam(singleQueryParam(resolved.node))
  // 스냅샷은 한 번만 읽어 요약·목표 대비·지도 세 구역에 같이 넘긴다.
  const read = startSnapshot()

  return (
    <div className="w-full p-4 md:p-8">
      <header className="mb-8 space-y-2">
        <h1 className="text-2xl font-bold">생태계 상황판</h1>
        <p className="text-sm text-muted-foreground text-pretty break-keep wrap-break-word">
          성장 순환과 필드 순환의 마디별 상태와 밸런스 목표 대비를 한눈에 봐요
        </p>
        <Suspense fallback={<Skeleton className="h-5 w-64" />}>
          <SummarySection read={read} />
        </Suspense>
      </header>

      <div className="space-y-10">
        <Suspense fallback={<SectionFallback heightClass="h-56" />}>
          <GoalSection read={read} />
        </Suspense>

        <Suspense fallback={<SectionFallback heightClass="h-64" />}>
          <MapSection read={read} selected={node} />
        </Suspense>

        <Suspense fallback={<SectionFallback heightClass="h-48" />}>
          <PolicySection node={node} />
        </Suspense>
      </div>
    </div>
  )
}
