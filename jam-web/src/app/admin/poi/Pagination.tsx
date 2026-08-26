import Link from 'next/link'

interface PaginationProps {
  page: number
  totalPages: number
  searchParams: Record<string, string | undefined>
  /** 페이지 링크의 기준 경로. 기본값은 POI 관리 화면 */
  basePath?: string
}

function buildHref(searchParams: Record<string, string | undefined>, page: number, basePath: string) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (value && key !== 'page') params.set(key, value)
  }
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return `${basePath}${qs ? `?${qs}` : ''}`
}

// 현재 페이지 주변 + 처음/끝만 보여주고 나머지는 "..."으로 축약
function buildPageList(page: number, totalPages: number): (number | 'ellipsis')[] {
  const pages = new Set<number>([1, totalPages])
  for (let p = page - 2; p <= page + 2; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p)
  }
  const sorted = [...pages].sort((a, b) => a - b)
  const result: (number | 'ellipsis')[] = []
  let prev = 0
  for (const p of sorted) {
    if (prev && p - prev > 1) result.push('ellipsis')
    result.push(p)
    prev = p
  }
  return result
}

export default function Pagination({ page, totalPages, searchParams, basePath = '/admin/poi' }: PaginationProps) {
  if (totalPages <= 1) return null
  const pageList = buildPageList(page, totalPages)

  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      <Link
        href={buildHref(searchParams, Math.max(1, page - 1), basePath)}
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
            href={buildHref(searchParams, p, basePath)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              p === page ? 'bg-primary text-white font-bold' : 'text-foreground hover:bg-muted'
            }`}
          >
            {p}
          </Link>
        )
      )}
      <Link
        href={buildHref(searchParams, Math.min(totalPages, page + 1), basePath)}
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
