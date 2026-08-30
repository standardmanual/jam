'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/admin/ui/input'
import { Button } from '@/components/admin/ui/button'
import { DataTableFacetedFilter } from '@/components/admin/data-table/data-table-faceted-filter'

// `admin/badges/BadgesFilterBar.tsx`의 RARITY_OPTIONS와 동일 — badges.rarity가 같은 enum이라
// 표기도 동일하게 맞춘다(티켓 20260830_1242).
const RARITY_OPTIONS = [
  { value: 'common', label: 'Common' },
  { value: 'rare', label: 'Rare' },
  { value: 'legend', label: 'Legend' },
  { value: 'mythic', label: 'Mythic' },
]

interface ItemBadgeSearchBarProps {
  factions: { id: string; name: string }[]
  itemBooks: { id: string; name: string; faction_id: string | null }[]
}

/**
 * 아이템배지 현황 검색바(티켓 20260829_2139, 20260830_1242) — `admin/badges/BadgesFilterBar.tsx`와
 * 동일한 디바운스+URL 동기화 패턴, 세계관/컬렉션/등급 필터도 그 화면의 `DataTableFacetedFilter`
 * 패턴을 그대로 재사용한다. 이 화면은 "배지 검색 우선 UX"(열린 결정 2)의 진입점이라 검색창을
 * 위에 두고, 필터는 그 아래 별도 줄에 배치한다.
 */
export function ItemBadgeSearchBar({ factions, itemBooks }: ItemBadgeSearchBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '')

  const currentFactionId = searchParams.get('faction_id') ?? 'all'
  const currentItemBookId = searchParams.get('item_book_id') ?? 'all'
  const currentRarity = searchParams.get('rarity') ?? 'all'

  const update = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === 'all') params.delete(key)
      else params.set(key, value)
    }
    router.push(`/admin/item-badges?${params.toString()}`)
  }

  useEffect(() => {
    const current = searchParams.get('q') ?? ''
    if (searchInput === current) return
    const timer = setTimeout(() => {
      update({ q: searchInput.trim() || null })
    }, 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  const handleFactionChange = (values: string[]) => {
    // 세계관 변경 시 선택된 컬렉션이 새 세계관 소속이 아니면 초기화한다(BadgesFilterBar.tsx와 동일).
    update({ faction_id: values[0] ?? 'all', item_book_id: null })
  }

  const hasFilter = searchParams.has('q') || searchParams.has('faction_id') || searchParams.has('item_book_id') || searchParams.has('rarity')

  // 선택된 세계관 기준으로 컬렉션 옵션을 좁힌다
  const filteredItemBooks =
    currentFactionId === 'all' ? itemBooks : itemBooks.filter((b) => b.faction_id === currentFactionId)

  return (
    <div className="flex flex-col gap-3">
      <Input
        placeholder="배지 이름으로 검색..."
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className="h-9 w-full max-w-sm"
      />

      <div className="flex flex-wrap items-center gap-2">
        <DataTableFacetedFilter
          title="세계관"
          options={factions.map((f) => ({ value: f.id, label: f.name }))}
          selected={currentFactionId === 'all' ? [] : [currentFactionId]}
          onChange={handleFactionChange}
        />

        <DataTableFacetedFilter
          title="컬렉션"
          options={filteredItemBooks.map((b) => ({ value: b.id, label: b.name }))}
          selected={currentItemBookId === 'all' ? [] : [currentItemBookId]}
          onChange={(values) => update({ item_book_id: values[0] ?? null })}
        />

        <DataTableFacetedFilter
          title="등급"
          options={RARITY_OPTIONS}
          selected={currentRarity === 'all' ? [] : [currentRarity]}
          onChange={(values) => update({ rarity: values[0] ?? null })}
        />

        {hasFilter && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => {
              setSearchInput('')
              router.push('/admin/item-badges')
            }}
          >
            필터 초기화
          </Button>
        )}
      </div>
    </div>
  )
}
