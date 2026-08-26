'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import type { FactionRow } from '@/types/database'

interface ItemBookFiltersProps {
  factions: Pick<FactionRow, 'id' | 'name'>[]
}

/**
 * 컬렉션 목록 필터 — 세계관/정렬을 URL 파라미터로 구동한다(20260826_011 A6). 이전에는
 * `ItemBookList.tsx`가 로컬 state로 클라이언트 필터링했지만, 서버 페이지네이션으로 전환하며
 * `admin/poi/PoiFilters.tsx`와 동일한 구조로 옮겼다.
 */
export default function ItemBookFilters({ factions }: ItemBookFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const faction = searchParams.get('faction') ?? 'all'
  const sort = searchParams.get('sort') ?? 'created_desc'

  const updateParams = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === 'all' || value === '') params.delete(key)
      else params.set(key, value)
    }
    params.delete('page')
    router.push(`/admin/itembooks?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={faction} onValueChange={(v) => updateParams({ faction: v })}>
        <SelectTrigger className="w-auto min-w-[10rem]" aria-label="세계관 필터">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체 세계관</SelectItem>
          {factions.map((f) => (
            <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={sort} onValueChange={(v) => updateParams({ sort: v })}>
        <SelectTrigger className="w-auto min-w-[10rem]" aria-label="이름 정렬">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="created_desc">최근 등록순</SelectItem>
          <SelectItem value="name_asc">이름 ↑ (오름차순)</SelectItem>
          <SelectItem value="name_desc">이름 ↓ (내림차순)</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
