'use client'

import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'

/** 고른 «아이템 배지 묶음» — 묶음의 4등급 배지 id를 common → mystic 순서로 모두 담는다 */
export interface SelectedBundle {
  key: string
  name: string
  badgeIds: string[]
}

interface BundleSearchResult {
  key: string
  name: string
  itemBookId: string
  complete: boolean
  badgeIds: string[]
  reason: string
}

interface BadgeBundleSelectProps {
  selected: SelectedBundle[]
  onChange: (next: SelectedBundle[]) => void
  tribes: { id: string; name: string }[]
  itemBooks: { id: string; name: string }[]
  placeholder?: string
}

const ALL = 'all'

/**
 * 등급 대응형 레시피의 재료·보상 칸이 쓰는 «아이템 배지 묶음» 다중 선택(티켓 20261114_1705 2회차).
 *
 * 같은 컬렉션·같은 이름의 아이템 배지를 묶음 하나로 보여 주고, 고르면 4등급 배지 id가 모두 담긴다. 4등급이 모두 갖춰지지 않은 묶음은
 * 이유와 함께 보이지만 고를 수 없다(저장 API도 같은 검사를 한다). `MultiBadgeSearchSelect`와 같은 검색 방식(이름·트라이브·컬렉션 필터,
 * `/api/admin/recipes/badge-bundles`)을 쓴다.
 */
export default function BadgeBundleSelect({ selected, onChange, tribes, itemBooks, placeholder }: BadgeBundleSelectProps) {
  const [query, setQuery] = useState('')
  const [tribeId, setTribeId] = useState(ALL)
  const [itemBookId, setItemBookId] = useState(ALL)
  const [results, setResults] = useState<BundleSearchResult[]>([])
  const [truncated, setTruncated] = useState(false)
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

  const hasFilter = tribeId !== ALL || itemBookId !== ALL
  const hasCriteria = Boolean(query.trim()) || hasFilter

  useEffect(() => {
    if (!hasCriteria) return
    const handle = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (query.trim()) params.set('query', query.trim())
        if (tribeId !== ALL) params.set('tribe_id', tribeId)
        if (itemBookId !== ALL) params.set('item_book_id', itemBookId)
        const res = await fetch(`/api/admin/recipes/badge-bundles?${params.toString()}`)
        const data = await res.json()
        setResults((data.bundles ?? []) as BundleSearchResult[])
        setTruncated(Boolean(data.truncated))
      } catch {
        setResults([])
        setTruncated(false)
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(handle)
  }, [query, tribeId, itemBookId, hasCriteria])

  // 조건이 비면 직전 결과를 그대로 보이지 않는다(MultiBadgeSearchSelect와 같은 패턴).
  const displayResults = hasCriteria ? results : []

  function add(bundle: BundleSearchResult) {
    if (!bundle.complete || selected.some((s) => s.key === bundle.key)) return
    onChange([...selected, { key: bundle.key, name: bundle.name, badgeIds: bundle.badgeIds }])
  }

  function remove(key: string) {
    onChange(selected.filter((s) => s.key !== key))
  }

  function resetFilters() {
    setTribeId(ALL)
    setItemBookId(ALL)
  }

  return (
    <div ref={rootRef} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={tribeId} onValueChange={setTribeId}>
          <SelectTrigger className="h-8 w-auto min-w-[9rem]" aria-label="트라이브 필터">
            <SelectValue placeholder="트라이브" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>트라이브 전체</SelectItem>
            {tribes.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={itemBookId} onValueChange={setItemBookId}>
          <SelectTrigger className="h-8 w-auto min-w-[9rem]" aria-label="컬렉션 필터">
            <SelectValue placeholder="컬렉션" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>컬렉션 전체</SelectItem>
            {itemBooks.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilter && (
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={resetFilters}>
            필터 초기화
          </Button>
        )}
      </div>

      <div className="relative">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? '배지 묶음 이름 검색 (필터만으로도 후보를 볼 수 있어요)'}
        />
        {open && hasCriteria && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {loading && <p className="px-3 py-2 text-xs text-muted-foreground">검색 중...</p>}
            {!loading && displayResults.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">검색 결과가 없어요</p>
            )}
            {!loading &&
              displayResults.map((b) => {
                const already = selected.some((s) => s.key === b.key)
                return (
                  <button
                    key={b.key}
                    type="button"
                    disabled={!b.complete || already}
                    onClick={() => add(b)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-40 disabled:hover:bg-transparent break-keep wrap-break-word"
                  >
                    {b.name}{' '}
                    <span className="text-muted-foreground text-xs">
                      {b.complete ? '[4등급]' : `[고를 수 없어요: ${b.reason}]`}
                      {already ? ' · 이미 추가됨' : ''}
                    </span>
                  </button>
                )
              })}
            {!loading && truncated && (
              <p className="px-3 py-2 text-xs text-amber-600 border-t border-border">
                결과가 많아 일부만 표시했어요. 검색어를 더 입력해 보세요.
              </p>
            )}
          </div>
        )}
      </div>

      {selected.length === 0 ? (
        <p className="text-xs text-muted-foreground">선택한 배지 묶음이 없어요</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {selected.map((s) => (
            <Badge key={s.key} variant="secondary" className="gap-1">
              {s.name} · 4등급
              <button
                type="button"
                onClick={() => remove(s.key)}
                aria-label={`${s.name} 제거`}
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
