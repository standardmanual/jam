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
  { value: 'legendary', label: 'Legendary' },
  { value: 'mythic', label: 'Mythic' },
]

const SORT_OPTIONS = [
  { value: 'created_desc', label: '최신순' },
  { value: 'created_asc', label: '오래된 순' },
  { value: 'name_asc', label: '이름 (가나다)' },
  { value: 'name_desc', label: '이름 (역순)' },
]

const SELECT_CLASS =
  'bg-white border border-[#e5e7eb] rounded-xl px-4 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#111111]/50 cursor-pointer'

export default function BadgesFilterBar() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '')

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    update({ q: searchInput.trim() || null })
  }

  const hasFilter =
    searchParams.has('q') ||
    searchParams.has('type') ||
    searchParams.has('rarity')

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
        <select
          className={SELECT_CLASS}
          value={searchParams.get('type') ?? 'all'}
          onChange={(e) => update({ type: e.target.value })}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-white">
              {o.label}
            </option>
          ))}
        </select>

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
