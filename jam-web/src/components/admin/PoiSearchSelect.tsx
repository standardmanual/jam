'use client'

import { useEffect, useRef, useState } from 'react'

export interface PoiSearchResult {
  id: string
  name: string
  category: string
}

interface PoiSearchSelectProps {
  value: string
  onChange: (id: string, poi?: PoiSearchResult) => void
  /** 이미 값이 있을 때(수정 화면) 처음 보여줄 라벨 — 부모가 알고 있는 지점 이름 */
  initialLabel?: string
  placeholder?: string
  allowClear?: boolean
}

/**
 * 지점(POI)을 이름으로 검색해서 고르는 단일 선택 콤보박스 — `BadgeSearchSelect`와 같은 골격이다
 * (티켓 20260911_2118, 미션 「체크인」 타입의 목표 지점 선택). `/api/admin/poi/search`는 이미
 * DB에 등록된 POI만 이름으로 찾는다(배지 폼의 「연결된 지점」 검색과 같은 API).
 */
export default function PoiSearchSelect({
  value,
  onChange,
  initialLabel,
  placeholder,
  allowClear = true,
}: PoiSearchSelectProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PoiSearchResult[]>([])
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
        const res = await fetch(`/api/admin/poi/search?query=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults((data.pois ?? []) as PoiSearchResult[])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(handle)
  }, [query, open])

  const displayResults = query.trim() ? results : []

  function select(poi: PoiSearchResult) {
    onChange(poi.id, poi)
    setSelectedLabel(`${poi.name} [${poi.category}]`)
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
          placeholder={placeholder ?? '지점 이름 검색...'}
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
            displayResults.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => select(p)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                {p.name} <span className="text-muted-foreground text-xs">[{p.category}]</span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
