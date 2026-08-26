'use client'

import { useEffect, useRef, useState } from 'react'
import type { BadgeType } from '@/types/database'
import type { BadgeSearchResult } from './BadgeSearchSelect'

interface BadgeMultiSearchSelectProps {
  /** 클릭 시 즉시 호출된다. 로컬 배열에 추가하거나(MissionList·TodayCardList) 서버에 즉시
   *  커밋(ItemBookForm)하는 건 호출부 책임 — 이 컴포넌트는 클릭 이벤트만 전달한다. */
  onSelect: (badge: BadgeSearchResult) => void
  /** 현재 선택된 배지 목록. 넘기면 칩으로 렌더링해 개별 제거(✕)가 가능하다. 호출부가 이미
   *  선택 목록을 별도 UI로 보여주는 경우(ItemBookForm의 "배지 슬롯 관리" 목록 등)는 생략한다 —
   *  그러면 이 컴포넌트는 검색창+드롭다운만 그린다. */
  selected?: BadgeSearchResult[]
  /** 칩의 ✕ 클릭 시 호출. selected를 넘길 때 함께 넘겨야 한다. */
  onRemove?: (id: string) => void
  /** 검색 결과에서 제외할 id 목록. selected에 없더라도(예: 이미 다른 폼 필드에 쓰이는 배지)
   *  추가로 제외하고 싶을 때 쓴다. */
  excludeIds?: string[]
  typeFilter?: BadgeType
  /** 아이템북에 아직 배정되지 않은 아이템 배지만 검색 (ItemBookForm 전용) */
  unassigned?: boolean
  placeholder?: string
}

/**
 * 배지를 이름으로 검색해서 여러 개 고르는 멀티애드 콤보박스. `BadgeSearchSelect.tsx`(단일 선택)의
 * 다중선택 버전 — 클릭해도 닫히지 않고 계속 검색·추가할 수 있다.
 *
 * `ItemBookForm.tsx`·`MissionList.tsx`·`TodayCardList.tsx`가 각자 구현하던 "배지 전체를
 * 프리로드한 뒤 클라이언트에서 필터링"을 대체한다(20260826_011) — 전체 배지가 수천 개
 * 규모라 Max Rows 상한에 걸려 뒤쪽 배지가 누락될 수 있으므로, 항상 /api/admin/badges/search로
 * 소량만 불러온다.
 */
export default function BadgeMultiSearchSelect({
  onSelect,
  selected,
  onRemove,
  excludeIds,
  typeFilter,
  unassigned,
  placeholder,
}: BadgeMultiSearchSelectProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BadgeSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!open || !query.trim()) return
    const handle = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ query })
        if (typeFilter) params.set('type', typeFilter)
        if (unassigned) params.set('unassigned', 'true')
        const res = await fetch(`/api/admin/badges/search?${params.toString()}`)
        const data = await res.json()
        setResults((data.badges ?? []) as BadgeSearchResult[])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(handle)
  }, [query, typeFilter, unassigned, open])

  const excluded = new Set([...(excludeIds ?? []), ...(selected ?? []).map((b) => b.id)])
  const displayResults = query.trim() ? results.filter((b) => !excluded.has(b.id)) : []

  // 클릭 즉시 드롭다운에서 제거해 다음 debounce 응답을 기다리지 않고 바로 피드백을 준다.
  // query/open은 그대로 유지 — 닫히지 않고 계속 검색·추가할 수 있는 멀티애드 UX.
  function pick(badge: BadgeSearchResult) {
    onSelect(badge)
    setResults((prev) => prev.filter((b) => b.id !== badge.id))
  }

  return (
    <div ref={rootRef} className="relative">
      {selected && selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onRemove?.(b.id)}
              className="text-xs bg-[#111111]/10 text-[#111111] border border-[#111111]/30 rounded-lg px-2 py-1 hover:bg-[#111111]/20 transition-colors"
            >
              {b.name}
              {b.point_reward > 0 ? ` (+${b.point_reward}P)` : ''} ✕
            </button>
          ))}
        </div>
      )}
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder ?? '배지 이름 검색...'}
        className="w-full bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#111111] placeholder-[#9ca3af] focus:outline-none focus:border-[#111111]/50"
      />
      {open && query.trim() && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-[#e5e7eb] rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {loading && <p className="px-3 py-2 text-xs text-[#898989]">검색 중...</p>}
          {!loading && displayResults.length === 0 && (
            <p className="px-3 py-2 text-xs text-[#898989]">검색 결과가 없습니다.</p>
          )}
          {!loading &&
            displayResults.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => pick(b)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-[#f8f9fa] transition-colors"
              >
                {b.name} <span className="text-[#898989] text-xs">[{b.type}/{b.rarity}]</span>
                {b.point_reward > 0 && (
                  <span className="text-[#898989] text-xs"> (+{b.point_reward}P)</span>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
