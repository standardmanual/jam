'use client'

import Button from '@/components/ui/Button'
import { d, t } from '@/lib/i18n'

interface VocPaginationProps {
  page: number
  totalPages: number
  onChange: (page: number) => void
}

/**
 * VOC 게시판 전용 «이전 · 현재 / 전체 · 다음» 페이지네이션 (무한스크롤/더보기 아님).
 * 쪽 번호 목록은 360px 폭에서 한 줄을 넘쳐 없앴다 (티켓 20261126_1618).
 *
 * 서비스 레이어에 재사용 가능한 페이지네이션이 없어 최소 구현으로 신설했다
 * (어드민 `Pagination.tsx`는 어드민 전용이라 재사용하지 않음, 티켓 20260828_1921).
 * 다른 화면에서도 필요해지면 그때 MODULAR 승격을 판단한다.
 */
export default function VocPagination({ page, totalPages, onChange }: VocPaginationProps) {
  if (totalPages <= 1) return null

  return (
    <nav
      aria-label={d.voc.paginationAriaLabel}
      className="flex items-center justify-center gap-2 mt-6"
    >
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="min-h-11 break-keep wrap-break-word"
        style={{ minHeight: 'var(--touch-target-min)' }}
      >
        {d.voc.paginationPrev}
      </Button>
      <span
        aria-label={t(d.voc.paginationCurrentAria, { page, total: totalPages })}
        className="px-2 text-base text-muted whitespace-nowrap"
      >
        {page} / {totalPages}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="min-h-11 break-keep wrap-break-word"
        style={{ minHeight: 'var(--touch-target-min)' }}
      >
        {d.voc.paginationNext}
      </Button>
    </nav>
  )
}
