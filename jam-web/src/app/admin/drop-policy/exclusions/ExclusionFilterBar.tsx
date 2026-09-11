'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/admin/ui/button'
import { DataTableFacetedFilter } from '@/components/admin/data-table/data-table-faceted-filter'

interface ExclusionFilterBarProps {
  tribes: { id: string; name: string }[]
  itemBooks: { id: string; name: string; tribe_id: string | null }[]
}

/**
 * 드랍 제외 관리 화면의 조회 필터 — 트라이브 선택은 목록을 좁히는 용도일 뿐, 드랍 제외
 * 대상이 아니다(사용자 확정, 티켓 20260911_2220). `admin/item-badges/ItemBadgeSearchBar.tsx`와
 * 동일한 URL 동기화 패턴을 재사용한다.
 */
export function ExclusionFilterBar({ tribes, itemBooks }: ExclusionFilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentTribeId = searchParams.get('tribe_id') ?? 'all'
  const currentItemBookId = searchParams.get('item_book_id') ?? 'all'

  const update = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === 'all') params.delete(key)
      else params.set(key, value)
    }
    router.push(`/admin/drop-policy/exclusions?${params.toString()}`)
  }

  const handleTribeChange = (values: string[]) => {
    // 트라이브 변경 시 선택된 컬렉션이 새 트라이브 소속이 아니면 초기화한다.
    update({ tribe_id: values[0] ?? 'all', item_book_id: null })
  }

  const hasFilter = searchParams.has('tribe_id') || searchParams.has('item_book_id')

  const filteredItemBooks =
    currentTribeId === 'all' ? itemBooks : itemBooks.filter((b) => b.tribe_id === currentTribeId)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DataTableFacetedFilter
        title="트라이브"
        options={tribes.map((t) => ({ value: t.id, label: t.name }))}
        selected={currentTribeId === 'all' ? [] : [currentTribeId]}
        onChange={handleTribeChange}
      />

      <DataTableFacetedFilter
        title="컬렉션"
        options={filteredItemBooks.map((b) => ({ value: b.id, label: b.name }))}
        selected={currentItemBookId === 'all' ? [] : [currentItemBookId]}
        onChange={(values) => update({ item_book_id: values[0] ?? null })}
      />

      {hasFilter && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => router.push('/admin/drop-policy/exclusions')}
        >
          필터 초기화
        </Button>
      )}
    </div>
  )
}
