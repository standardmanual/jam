import { Suspense } from 'react'
import { Skeleton } from '@/components/admin/ui/skeleton'
import { AsOfSection, BoardSection, BundleSection, DeploySection, NoticesSection, startDevBoard } from './_sections'

/**
 * 개발·배포 상황판 (`/admin/dev-board`, 티켓 20261026_2028 3회차, 운영툴 PRD admin-boards §8)
 *
 * 위에서 아래로: 머리(제목·설명·기준 시각 KST) → 읽기 안내 줄(문제가 있을 때만) → 배포 현황 → JAM 2.0 묶음 → 개발 항목 보드.
 * GitHub와 개발 요청은 `startDevBoard`가 한 번만 읽고 구역들이 같이 기다린다. 구역마다 `Suspense` + 스켈레톤이다.
 * 이 화면은 읽기만 하고(개발 요청 버튼 없음) 캐시하지 않는다.
 */
export const dynamic = 'force-dynamic'

/** 구역을 읽는 동안 보이는 자리. 높이는 구역마다 다르게 줘서 읽힌 뒤 화면이 크게 밀리지 않게 한다 */
function SectionFallback({ heightClass }: { heightClass: string }) {
  return (
    <div role="status" aria-label="불러오는 중" className="space-y-3">
      <Skeleton className="h-6 w-32" />
      <Skeleton className={`w-full ${heightClass}`} />
    </div>
  )
}

export default function DevBoardPage() {
  // 한 번만 읽어 모든 구역에 같이 넘긴다.
  const read = startDevBoard()

  return (
    <div className="w-full p-4 md:p-8">
      <header className="mb-8 space-y-2">
        <h1 className="text-2xl font-bold">개발·배포 상황판</h1>
        <p className="text-sm text-muted-foreground text-pretty break-keep wrap-break-word">
          배포 현황과 JAM 2.0 묶음 진행, 개발 항목의 단계를 GitHub에서 읽어 보여줘요
        </p>
        <Suspense fallback={<Skeleton className="h-4 w-40" />}>
          <AsOfSection read={read} />
        </Suspense>
      </header>

      <div className="space-y-10">
        <Suspense fallback={null}>
          <NoticesSection read={read} />
        </Suspense>

        <Suspense fallback={<SectionFallback heightClass="h-28" />}>
          <DeploySection read={read} />
        </Suspense>

        <Suspense fallback={<SectionFallback heightClass="h-64" />}>
          <BundleSection read={read} />
        </Suspense>

        <Suspense fallback={<SectionFallback heightClass="h-96" />}>
          <BoardSection read={read} />
        </Suspense>
      </div>
    </div>
  )
}
