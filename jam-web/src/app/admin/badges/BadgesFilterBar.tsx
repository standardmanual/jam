'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState } from 'react'

const TYPE_OPTIONS = [
  { value: 'all', label: '전체 타입' },
  { value: 'activity', label: '액티비티' },
  { value: 'item', label: '아이템' },
  { value: 'poi', label: 'POI' },
]

const RARITY_OPTIONS = [
  { value: 'all', label: '전체 등급' },
  { value: 'common', label: 'Common' },
  { value: 'rare', label: 'Rare' },
  { value: 'legend', label: 'Legend' },
  { value: 'mythic', label: 'Mythic' },
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

const SELECT_CLASS =
  'bg-white border border-[#e5e7eb] rounded-xl px-4 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#111111]/50 cursor-pointer'

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

  const hasFilter =
    searchParams.has('q') ||
    searchParams.has('type') ||
    searchParams.has('rarity') ||
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
        <select
          className={SELECT_CLASS}
          value={currentType}
          onChange={(e) => handleTypeChange(e.target.value)}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-white">
              {o.label}
            </option>
          ))}
        </select>

        {/* 액티비티 서브 필터 */}
        {currentType === 'activity' && (
          <select
            className={SELECT_CLASS}
            value={searchParams.get('activity_type') ?? 'all'}
            onChange={(e) => update({ activity_type: e.target.value })}
          >
            {ACTIVITY_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-white">
                {o.label}
              </option>
            ))}
          </select>
        )}

        {/* POI 카테고리 서브 필터 */}
        {currentType === 'poi' && (
          <select
            className={SELECT_CLASS}
            value={searchParams.get('poi_category') ?? 'all'}
            onChange={(e) => update({ poi_category: e.target.value })}
          >
            <option value="all" className="bg-white">전체 카테고리</option>
            {poiCategories.map((c) => (
              <option key={c.slug} value={c.slug} className="bg-white">
                {c.label}
              </option>
            ))}
          </select>
        )}

        {/* 아이템 서브 필터: 세계관 + 아이템북 */}
        {currentType === 'item' && (
          <>
            <select
              className={SELECT_CLASS}
              value={currentFactionId}
              onChange={(e) => handleFactionChange(e.target.value)}
            >
              <option value="all" className="bg-white">전체 세계관</option>
              {factions.map((f) => (
                <option key={f.id} value={f.id} className="bg-white">
                  {f.name}
                </option>
              ))}
            </select>

            <select
              className={SELECT_CLASS}
              value={searchParams.get('item_book_id') ?? 'all'}
              onChange={(e) => update({ item_book_id: e.target.value })}
            >
              <option value="all" className="bg-white">전체 컬렉션</option>
              {filteredItemBooks.map((b) => (
                <option key={b.id} value={b.id} className="bg-white">
                  {b.name}
                </option>
              ))}
            </select>
          </>
        )}

        {/* 등급 */}
        <select
          className={SELECT_CLASS}
          value={searchParams.get('rarity') ?? 'all'}
          onChange={(e) => update({ rarity: e.target.value })}
        >
          {RARITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-white">
              {o.label}
            </option>
          ))}
        </select>

        {/* 정렬 */}
        <select
          className={SELECT_CLASS}
          value={searchParams.get('sort') ?? 'created_desc'}
          onChange={(e) => update({ sort: e.target.value })}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-white">
              {o.label}
            </option>
          ))}
        </select>

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
