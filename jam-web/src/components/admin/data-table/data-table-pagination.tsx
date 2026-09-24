'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { buildPageHref, buildPageList } from '@/lib/admin/list-params'

interface DataTablePaginationProps {
  page: number
  totalPages: number
}

/**
 * 번호형 페이지 이동(처음·끝, 현재 ±2, 생략 표시, 이전·다음) — 기존 POI 화면 전용
 * Pagination 컴포넌트를 공용 폴더로 옮기고, `searchParams`/`basePath`를 prop으로 받는 대신
 * `usePathname`/`useSearchParams`로 직접 읽는다(티켓 20260924_0940). 1쪽뿐이면 아무것도
 * 그리지 않는다.
 */
export function DataTablePagination({ page, totalPages }: DataTablePaginationProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  if (totalPages <= 1) return null

  const pageList = buildPageList(page, totalPages)

  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      <Link
        href={buildPageHref(pathname, searchParams, Math.max(1, page - 1))}
        aria-disabled={page === 1}
        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
          page === 1 ? 'text-muted-foreground pointer-events-none' : 'text-foreground hover:bg-muted'
        }`}
      >
        이전
      </Link>
      {pageList.map((p, i) =>
        p === 'ellipsis' ? (
          <span key={`e${i}`} className="px-2 text-muted-foreground text-sm">…</span>
        ) : (
          <Link
            key={p}
            href={buildPageHref(pathname, searchParams, p)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              p === page ? 'bg-primary text-white font-bold' : 'text-foreground hover:bg-muted'
            }`}
          >
            {p}
          </Link>
        )
      )}
      <Link
        href={buildPageHref(pathname, searchParams, Math.min(totalPages, page + 1))}
        aria-disabled={page === totalPages}
        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
          page === totalPages ? 'text-muted-foreground pointer-events-none' : 'text-foreground hover:bg-muted'
        }`}
      >
        다음
      </Link>
    </div>
  )
}
