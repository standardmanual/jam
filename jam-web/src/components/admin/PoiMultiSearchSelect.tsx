'use client'

import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/admin/ui/badge'
import { Input } from '@/components/admin/ui/input'

export interface SelectedPoi {
  id: string
  label: string
}

interface PoiSearchResult {
  id: string
  name: string
  category: string | null
  /** 운영 종료된 지점은 false. 값이 없으면 운영 중으로 본다 */
  is_active?: boolean | null
}

interface PoiMultiSearchSelectProps {
  selected: SelectedPoi[]
  onChange: (next: SelectedPoi[]) => void
  placeholder?: string
}

/**
 * 지점을 이름으로 찾아 여러 곳 골라 담는 선택 컴포넌트 (티켓 20261001_2154).
 * `MultiBadgeSearchSelect`와 같은 뼈대 — `/api/admin/poi/search`로 소량만 불러온다.
 * 이미 고른 지점과 운영이 끝난 지점(`is_active === false`)은 누를 수 없다.
 */
export default function PoiMultiSearchSelect({ selected, onChange, placeholder }: PoiMultiSearchSelectProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PoiSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const hasCriteria = Boolean(query.trim())

  useEffect(() => {
    if (!hasCriteria) return
    const handle = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/poi/search?${new URLSearchParams({ query: query.trim() }).toString()}`)
        const data = await res.json()
        setResults((data.pois ?? []) as PoiSearchResult[])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(handle)
  }, [query, hasCriteria])

  // 검색어를 지우면 직전 결과를 보이지 않는다(MultiBadgeSearchSelect와 같은 패턴)
  const displayResults = hasCriteria ? results : []

  function add(poi: PoiSearchResult) {
    if (selected.some((s) => s.id === poi.id) || poi.is_active === false) return
    onChange([...selected, { id: poi.id, label: poi.name }])
  }

  function remove(id: string) {
    onChange(selected.filter((s) => s.id !== id))
  }

  return (
    <div ref={rootRef} className="space-y-2">
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? '장소 이름 검색...'}
        />
        {open && hasCriteria && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {loading && <p className="px-3 py-2 text-xs text-muted-foreground">검색 중...</p>}
            {!loading && displayResults.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">검색 결과가 없어요.</p>
            )}
            {!loading &&
              displayResults.map((p) => {
                const already = selected.some((s) => s.id === p.id)
                const inactive = p.is_active === false
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={already || inactive}
                    onClick={() => add(p)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-40"
                  >
                    {p.name}{' '}
                    <span className="text-muted-foreground text-xs">
                      {p.category ? `[${p.category}]` : ''}
                      {inactive ? ' · 운영 종료' : already ? ' · 이미 추가됨' : ''}
                    </span>
                  </button>
                )
              })}
          </div>
        )}
      </div>

      {selected.length === 0 ? (
        <p className="text-xs text-muted-foreground">선택한 장소가 없어요.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {selected.map((s) => (
            <Badge key={s.id} variant="secondary" className="gap-1">
              {s.label || s.id.slice(0, 8)}
              <button
                type="button"
                onClick={() => remove(s.id)}
                aria-label={`${s.label} 제거`}
                className="ml-1 text-neutral-500 hover:text-red-600"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
