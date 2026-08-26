'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { BADGE_TYPES, BADGE_TYPE_LABEL } from '@/lib/admin/badge-labels'

const TYPE_OPTIONS = [
  { value: 'all', label: '전체 타입' },
  ...BADGE_TYPES.map((t) => ({ value: t as string, label: BADGE_TYPE_LABEL[t] })),
]

const RARITY_OPTIONS = [
  { value: 'all', label: '전체 등급' },
  { value: 'common', label: 'Common' },
  { value: 'rare', label: 'Rare' },
  { value: 'legend', label: 'Legend' },
  { value: 'mythic', label: 'Mythic' },
]

const STATUS_OPTIONS = [
  { value: 'active', label: '활성' },
  { value: 'inactive', label: '비활성' },
  { value: 'all', label: '전체' },
]

const SORT_OPTIONS = [
  { value: 'created_desc', label: '최신순' },
  { value: 'created_asc', label: '오래된 순' },
  { value: 'name_asc', label: '이름 (가나다)' },
  { value: 'name_desc', label: '이름 (역순)' },
]

const ACTIVITY_TYPE_OPTIONS = [
  { value: 'all', label: '전체 액티비티' },
  { value: 'cycling', label: '사이클링' },
  { value: 'running', label: '러닝' },
  { value: 'trail_running', label: '트레일 러닝' },
  { value: 'hiking', label: '하이킹' },
  { value: 'walking', label: '걷기' },
]

// 타입 변경 시 초기화할 서브 필터 파라미터
const SUB_FILTER_KEYS = ['activity_type', 'poi_category', 'faction_id', 'item_book_id']

interface BadgesFilterBarProps {
  factions: { id: string; name: string }[]
  itemBooks: { id: string; name: string; faction_id: string | null }[]
  poiCategories: { slug: string; label: string }[]
}

export default function BadgesFilterBar({ factions, itemBooks, poiCategories }: BadgesFilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '')

  const currentType = searchParams.get('type') ?? 'all'
  const currentFactionId = searchParams.get('faction_id') ?? 'all'
  const currentStatus = searchParams.get('status') ?? 'active'

  const update = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === 'all' || value === 'created_desc') {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      }
      params.delete('page')
      router.push(`/admin/badges?${params.toString()}`)
    },
    [router, searchParams]
  )

  const handleTypeChange = (value: string) => {
    // 타입 변경 시 서브 필터 전체 초기화
    const cleared = Object.fromEntries(SUB_FILTER_KEYS.map((k) => [k, null])) as Record<string, null>
    update({ type: value, ...cleared })
  }

  const handleFactionChange = (value: string) => {
    // 세계관 변경 시 아이템북 초기화
    update({ faction_id: value, item_book_id: null })
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    update({ q: searchInput.trim() || null })
  }

  const handleStatusChange = (value: string) => {
    // 기본값은 'active' — update()는 'all'을 삭제 대상으로 보므로 별도 처리
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'active') {
      params.delete('status')
    } else {
      params.set('status', value)
    }
    params.delete('page')
    router.push(`/admin/badges?${params.toString()}`)
  }

  const hasFilter =
    searchParams.has('q') ||
    searchParams.has('type') ||
    searchParams.has('rarity') ||
    searchParams.has('status') ||
    SUB_FILTER_KEYS.some((k) => searchParams.has(k))

  // 선택된 세계관 기준으로 아이템북 필터링
  const filteredItemBooks =
    currentFactionId === 'all'
      ? itemBooks
      : itemBooks.filter((b) => b.faction_id === currentFactionId)

  return (
    <div className="flex flex-col gap-3">
      {/* 검색창 */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          placeholder="배지 이름, 설명으로 검색..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="flex-1 bg-white border border-[#e5e7eb] rounded-xl px-4 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#111111]/50"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-[#111111] text-white text-sm rounded-xl hover:bg-[#374151] transition-colors"
        >
          검색
        </button>
      </form>

      {/* 필터 + 정렬 */}
      <div className="flex flex-wrap items-center gap-3">
        {/* 타입 */}
        <Select value={currentType} onValueChange={handleTypeChange}>
          <SelectTrigger className="w-auto min-w-[8rem]" aria-label="타입 필터">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 액티비티 서브 필터 */}
        {currentType === 'activity' && (
          <Select
            value={searchParams.get('activity_type') ?? 'all'}
            onValueChange={(v) => update({ activity_type: v })}
          >
            <SelectTrigger className="w-auto min-w-[8rem]" aria-label="액티비티 필터">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* 지점 카테고리 서브 필터 — 체크인 배지는 연결된 지점(poi.category)으로만 분류된다 */}
        {currentType === 'checkin' && (
          <Select
            value={searchParams.get('poi_category') ?? 'all'}
            onValueChange={(v) => update({ poi_category: v })}
          >
            <SelectTrigger className="w-auto min-w-[8rem]" aria-label="지점 카테고리 필터">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 카테고리</SelectItem>
              {poiCategories.map((c) => (
                <SelectItem key={c.slug} value={c.slug}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* 아이템 서브 필터: 세계관 + 아이템북 */}
        {currentType === 'item' && (
          <>
            <Select value={currentFactionId} onValueChange={handleFactionChange}>
              <SelectTrigger className="w-auto min-w-[8rem]" aria-label="세계관 필터">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 세계관</SelectItem>
                {factions.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={searchParams.get('item_book_id') ?? 'all'}
              onValueChange={(v) => update({ item_book_id: v })}
            >
              <SelectTrigger className="w-auto min-w-[8rem]" aria-label="컬렉션 필터">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 컬렉션</SelectItem>
                {filteredItemBooks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        {/* 등급 */}
        <Select value={searchParams.get('rarity') ?? 'all'} onValueChange={(v) => update({ rarity: v })}>
          <SelectTrigger className="w-auto min-w-[7rem]" aria-label="등급 필터">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RARITY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 정렬 */}
        <Select value={searchParams.get('sort') ?? 'created_desc'} onValueChange={(v) => update({ sort: v })}>
          <SelectTrigger className="w-auto min-w-[8rem]" aria-label="정렬">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 상태 (활성/비활성/전체) */}
        <Select value={currentStatus} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-auto min-w-[7rem]" aria-label="상태 필터">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilter && (
          <button
            onClick={() => {
              setSearchInput('')
              router.push('/admin/badges')
            }}
            className="text-xs text-[#6b7280] hover:text-[#374151] transition-colors underline underline-offset-2"
          >
            필터 초기화
          </button>
        )}
      </div>
    </div>
  )
}
