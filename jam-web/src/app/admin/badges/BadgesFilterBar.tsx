'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'

const ACTIVITY_OPTIONS = [
  { value: 'all', label: '전체 종목' },
  { value: 'walking', label: '걷기' },
  { value: 'running', label: '러닝' },
  { value: 'cycling', label: '사이클' },
  { value: 'hiking', label: '등산' },
  { value: 'trail_running', label: '트레일' },
]

const TYPE_OPTIONS = [
  { value: 'all', label: '전체 타입' },
  { value: 'activity', label: '액티비티' },
  { value: 'item', label: '아이템' },
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
  { value: 'name_asc', label: '이름 오름차순 (가→하)' },
  { value: 'name_desc', label: '이름 내림차순 (하→가)' },
]

const SELECT_CLASS =
  'bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/80 focus:outline-none focus:border-[#AEEA00]/50 cursor-pointer'

export default function BadgesFilterBar({ total, filtered }: { total: number; filtered: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value === 'all' || value === 'created_desc') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  const hasFilter =
    searchParams.has('activityType') ||
    searchParams.has('type') ||
    searchParams.has('rarity')

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <select
        className={SELECT_CLASS}
        value={searchParams.get('activityType') ?? 'all'}
        onChange={(e) => update('activityType', e.target.value)}
      >
        {ACTIVITY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#1a1a1a]">
            {o.label}
          </option>
        ))}
      </select>

      <select
        className={SELECT_CLASS}
        value={searchParams.get('type') ?? 'all'}
        onChange={(e) => update('type', e.target.value)}
      >
        {TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#1a1a1a]">
            {o.label}
          </option>
        ))}
      </select>

      <select
        className={SELECT_CLASS}
        value={searchParams.get('rarity') ?? 'all'}
        onChange={(e) => update('rarity', e.target.value)}
      >
        {RARITY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#1a1a1a]">
            {o.label}
          </option>
        ))}
      </select>

      <div className="h-5 w-px bg-white/10" />

      <select
        className={SELECT_CLASS}
        value={searchParams.get('sort') ?? 'created_desc'}
        onChange={(e) => update('sort', e.target.value)}
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#1a1a1a]">
            {o.label}
          </option>
        ))}
      </select>

      {hasFilter && (
        <button
          onClick={() => router.push(pathname)}
          className="text-xs text-white/40 hover:text-white/70 transition-colors underline underline-offset-2"
        >
          필터 초기화
        </button>
      )}

      <span className="ml-auto text-xs text-white/30">
        {hasFilter ? `${filtered} / ${total}개` : `${total}개`}
      </span>
    </div>
  )
}
