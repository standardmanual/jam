'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/admin/ui/button'
import { DataTableToolbar } from '@/components/admin/data-table/data-table-toolbar'
import { DataTableFacetedFilter } from '@/components/admin/data-table/data-table-faceted-filter'
import { ITEM_BADGE_STATUS_OPTIONS } from '@/lib/admin/item-badge-status'

interface SerialListFilterBarProps {
  badgeId: string
}

/**
 * 배지별 발급 일련번호 목록 필터 바(티켓 20260829_2139) — `admin/badges/BadgesFilterBar.tsx`와
 * 동일한 URL 동기화 패턴. "현재 상태" 단일 선택 필터와 "재발급된 일련번호만 보기" 토글 두 가지.
 */
export function SerialListFilterBar({ badgeId }: SerialListFilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentStatus = searchParams.get('status') ?? 'all'
  const reissuedOnly = searchParams.get('reissued') === 'true'

  const update = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === 'all') params.delete(key)
      else params.set(key, value)
    }
    params.delete('page')
    router.push(`/admin/item-badges/${badgeId}?${params.toString()}`)
  }

  const hasFilter = currentStatus !== 'all' || reissuedOnly

  return (
    <DataTableToolbar>
      <DataTableFacetedFilter
        title="현재 상태"
        options={ITEM_BADGE_STATUS_OPTIONS}
        selected={currentStatus === 'all' ? [] : [currentStatus]}
        onChange={(values) => update({ status: values[0] ?? null })}
      />

      <Button
        type="button"
        variant={reissuedOnly ? 'default' : 'outline'}
        size="sm"
        className="h-8"
        onClick={() => update({ reissued: reissuedOnly ? null : 'true' })}
      >
        재발급된 일련번호만 보기
      </Button>

      {hasFilter && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => router.push(`/admin/item-badges/${badgeId}`)}
        >
          필터 초기화
        </Button>
      )}
    </DataTableToolbar>
  )
}
