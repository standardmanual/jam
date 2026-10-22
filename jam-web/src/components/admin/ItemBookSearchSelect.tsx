'use client'

import { useEffect, useRef, useState } from 'react'

export interface ItemBookSearchResult {
  id: string
  name: string
  imageUrl?: string | null
}

interface ItemBookSearchSelectProps {
  value: string
  onChange: (id: string, itemBook?: ItemBookSearchResult) => void
  /** 이미 값이 있을 때(수정 화면) 처음 보여줄 라벨 — 부모가 알고 있는 컬렉션 이름 */
  initialLabel?: string
  placeholder?: string
  allowClear?: boolean
}

/**
 * 컬렉션(item_books)을 이름으로 검색해서 고르는 단일 선택 콤보박스(티켓 20260925_1409).
 * `MissionSearchSelect`와 같은 패턴이다 — 전체 컬렉션을 `<select><option>`으로 늘어놓지 않고
 * 항상 `/api/admin/itembooks/search`(기존 컬렉션 검색 API, 티켓 20260913_0414)로 소량만
 * 불러온다.
 */
export default function ItemBookSearchSelect({
  value,
  onChange,
  initialLabel,
  placeholder,
  allowClear = true,
}: ItemBookSearchSelectProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ItemBookSearchResult[]>([])
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
        const params = new URLSearchParams({ q: query })
        const res = await fetch(`/api/admin/itembooks/search?${params.toString()}`)
        const data = await res.json()
        setResults((data.itemBooks ?? []) as ItemBookSearchResult[])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(handle)
  }, [query, open])

  // query가 비면(방금 포커스했거나 지웠을 때) 직전 검색 결과를 그대로 안 보여준다
  const displayResults = query.trim() ? results : []

  function select(itemBook: ItemBookSearchResult) {
    onChange(itemBook.id, itemBook)
    setSelectedLabel(itemBook.name)
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
          placeholder={placeholder ?? '컬렉션 이름 검색...'}
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
            <p className="px-3 py-2 text-xs text-muted-foreground">검색 결과가 없어요</p>
          )}
          {!loading &&
            displayResults.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => select(b)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                {b.name}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
