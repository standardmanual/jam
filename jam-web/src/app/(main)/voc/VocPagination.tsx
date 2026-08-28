'use client'

import { d } from '@/lib/i18n'

interface VocPaginationProps {
  page: number
  totalPages: number
  onChange: (page: number) => void
}

// 현재 페이지 주변 + 처음/끝만 보여주고 나머지는 "…"으로 축약
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

/**
 * VOC 게시판 전용 번호형 페이지네이션 (무한스크롤/더보기 아님).
 *
 * 서비스 레이어에 재사용 가능한 번호형 페이지네이션이 없어 최소 구현으로 신설했다
 * (어드민 `Pagination.tsx`는 어드민 전용이라 재사용하지 않음, 티켓 20260828_1921).
 * 다른 화면에서도 필요해지면 그때 MODULAR 승격을 판단한다.
 */
export default function VocPagination({ page, totalPages, onChange }: VocPaginationProps) {
  if (totalPages <= 1) return null
  const pageList = buildPageList(page, totalPages)

  return (
    <nav
      aria-label={d.voc.paginationAriaLabel}
      className="flex items-center justify-center gap-[var(--spacing-8)] mt-[var(--spacing-24)]"
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="min-h-11 px-3 rounded-[var(--radius-tags)] text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {d.voc.paginationPrev}
      </button>
      {pageList.map((p, i) =>
        p === 'ellipsis' ? (
          <span key={`e${i}`} className="px-1 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/40">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={`min-w-11 min-h-11 px-2 rounded-[var(--radius-tags)] text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] ${
              p === page ? 'bg-surface-elevated text-text font-bold' : 'text-text/60'
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="min-h-11 px-3 rounded-[var(--radius-tags)] text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {d.voc.paginationNext}
      </button>
    </nav>
  )
}
