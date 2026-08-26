'use client'

import { useEffect, useRef, useState } from 'react'
import type { BadgeType } from '@/types/database'

export interface BadgeSearchResult {
  id: string
  name: string
  rarity: string
  type: string
  /** MissionList 보상 배지 "포인트 포함 여부" 경고에 쓰는 필드. /api/admin/badges/search가
   *  항상 내려주지만, 필요 없는 호출부는 무시하면 그만이다. */
  point_reward: number
}

interface BadgeSearchSelectProps {
  value: string
  onChange: (id: string, badge?: BadgeSearchResult) => void
  /** 이미 값이 있을 때(수정 화면) 처음 보여줄 라벨 — 부모가 알고 있는 배지 이름 */
  initialLabel?: string
  typeFilter?: BadgeType
  placeholder?: string
  allowClear?: boolean
}

/**
 * 배지를 이름으로 검색해서 고르는 단일 선택 콤보박스.
 * 전체 배지를 <select><option>으로 늘어놓으면 수천 개 규모에서 Supabase
 * Max Rows 상한에 걸려 일부가 누락되므로, 항상 /api/admin/badges/search로
 * 소량만 불러온다.
 *
 * initialLabel이 나중에 바뀌는 경우(예: 수정 대상이 바뀜)는 호출부에서
 * key prop을 바꿔 컴포넌트를 새로 마운트하는 방식으로 처리한다 — 그래야
 * effect로 prop을 state에 동기화하는 안티패턴을 피할 수 있다.
 */
export default function BadgeSearchSelect({
  value,
  onChange,
  initialLabel,
  typeFilter,
  placeholder,
  allowClear = true,
}: BadgeSearchSelectProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BadgeSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState(initialLabel ?? '')
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
  }, [query, typeFilter, open])

  // query가 비면(방금 포커스했거나 지웠을 때) 직전 검색 결과를 그대로 안 보여준다
  const displayResults = query.trim() ? results : []

  function select(badge: BadgeSearchResult) {
    onChange(badge.id, badge)
    setSelectedLabel(`${badge.name} [${badge.type}/${badge.rarity}]`)
    setQuery('')
    setOpen(false)
  }

  function clear() {
    onChange('')
    setSelectedLabel('')
    setQuery('')
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-2">
        <input
          value={open ? query : selectedLabel}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            setOpen(true)
            setQuery('')
          }}
          placeholder={placeholder ?? '배지 이름 검색...'}
          className="flex-1 bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
        />
        {allowClear && value && (
          <button
            type="button"
            onClick={clear}
            className="text-muted-foreground hover:text-red-600 text-xs px-1 shrink-0"
          >
            지우기
          </button>
        )}
      </div>
      {open && query.trim() && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {loading && <p className="px-3 py-2 text-xs text-muted-foreground">검색 중...</p>}
          {!loading && displayResults.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">검색 결과가 없습니다.</p>
          )}
          {!loading &&
            displayResults.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => select(b)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                {b.name} <span className="text-muted-foreground text-xs">[{b.type}/{b.rarity}]</span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
