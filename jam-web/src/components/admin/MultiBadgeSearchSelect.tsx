'use client'

import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import type { BadgeSearchResult } from '@/components/admin/BadgeSearchSelect'
import type { BadgeRarity } from '@/types/database'

export interface SelectedBadge {
  id: string
  label: string
}

interface MultiBadgeSearchSelectProps {
  /** 이미 선택된 배지 — 부모가 순서와 라벨을 보관한다 */
  selected: SelectedBadge[]
  onChange: (next: SelectedBadge[]) => void
  tribes: { id: string; name: string }[]
  itemBooks: { id: string; name: string }[]
  placeholder?: string
}

const RARITIES: { value: BadgeRarity; label: string }[] = [
  { value: 'common', label: 'Common' },
  { value: 'rare', label: 'Rare' },
  { value: 'epic', label: 'Epic' },
  { value: 'mystic', label: 'Mystic' },
]

const ALL = 'all'

/**
 * 보상 배지는 아이템 배지로 고정한다 — 엔진의 배지 지급 경로가 `inventory_items` 개체 생성
 * 하나뿐이라, 액티비티·체크인 배지를 보상으로 두면 획득 기록 테이블과 어긋난다.
 * 저장 단계(`lib/admin/recipe-write.ts`)도 같은 규칙으로 거부한다.
 */
const REWARD_BADGE_TYPE = 'item'

export function badgeLabel(badge: { name: string; type: string; rarity: string | null }): string {
  return `${badge.name} [${badge.type}/${badge.rarity ?? '-'}]`
}

/**
 * 배지를 여러 개 골라 누적하는 다중 선택 컴포넌트 (티켓 20260910_1408).
 *
 * `BadgeSearchSelect`의 검색 방식을 그대로 이어받는다 — 전체 배지를 select에 늘어놓지 않고
 * `/api/admin/badges/search`로 소량만 불러온다(수천 개 규모에서 Supabase Max Rows 상한에
 * 걸리는 문제를 이 패턴이 이미 해결해 뒀다).
 *
 * **트라이브·컬렉션·등급 필터는 원하는 배지를 찾기 위한 검색 도구일 뿐 무작위 추첨 풀이
 * 아니다.** 여기서 고른 배지는 믹스 성공 시 무작위 없이 전부 지급된다.
 */
export default function MultiBadgeSearchSelect({
  selected,
  onChange,
  tribes,
  itemBooks,
  placeholder,
}: MultiBadgeSearchSelectProps) {
  const [query, setQuery] = useState('')
  const [tribeId, setTribeId] = useState(ALL)
  const [itemBookId, setItemBookId] = useState(ALL)
  const [rarity, setRarity] = useState(ALL)
  const [results, setResults] = useState<BadgeSearchResult[]>([])
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

  const hasFilter = tribeId !== ALL || itemBookId !== ALL || rarity !== ALL
  const hasCriteria = Boolean(query.trim()) || hasFilter

  useEffect(() => {
    if (!hasCriteria) return
    const handle = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (query.trim()) params.set('query', query.trim())
        params.set('type', REWARD_BADGE_TYPE)
        if (tribeId !== ALL) params.set('tribe_id', tribeId)
        if (itemBookId !== ALL) params.set('item_book_id', itemBookId)
        if (rarity !== ALL) params.set('rarity', rarity)
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
  }, [query, tribeId, itemBookId, rarity, hasCriteria])

  // 조건이 비면(필터를 초기화하고 검색어도 지웠을 때) 직전 결과를 그대로 안 보여준다
  // — effect에서 setState로 비우면 캐스케이딩 렌더가 된다(BadgeSearchSelect와 동일 패턴).
  const displayResults = hasCriteria ? results : []

  function add(badge: BadgeSearchResult) {
    if (selected.some((s) => s.id === badge.id)) return
    onChange([...selected, { id: badge.id, label: badgeLabel(badge) }])
  }

  function remove(id: string) {
    onChange(selected.filter((s) => s.id !== id))
  }

  function resetFilters() {
    setTribeId(ALL)
    setItemBookId(ALL)
    setRarity(ALL)
  }

  return (
    <div ref={rootRef} className="space-y-2">
      {/* 후보 좁히기 필터 — 검색 도구이며 추첨 풀이 아니다 */}
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

        <Select value={rarity} onValueChange={setRarity}>
          <SelectTrigger className="h-8 w-auto min-w-[7rem]" aria-label="등급 필터">
            <SelectValue placeholder="등급" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>등급 전체</SelectItem>
            {RARITIES.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilter && (
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={resetFilters}>
            필터 초기화
          </Button>
        )}
      </div>

      {/* 이름 검색 + 결과 목록 */}
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? '배지 이름 검색... (필터만으로도 후보를 볼 수 있어요)'}
        />
        {open && hasCriteria && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {loading && <p className="px-3 py-2 text-xs text-muted-foreground">검색 중...</p>}
            {!loading && displayResults.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">검색 결과가 없습니다.</p>
            )}
            {!loading &&
              displayResults.map((b) => {
                const already = selected.some((s) => s.id === b.id)
                return (
                  <button
                    key={b.id}
                    type="button"
                    disabled={already}
                    onClick={() => add(b)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-40"
                  >
                    {b.name}{' '}
                    <span className="text-muted-foreground text-xs">
                      [{b.type}/{b.rarity}]{already ? ' · 이미 추가됨' : ''}
                    </span>
                  </button>
                )
              })}
          </div>
        )}
      </div>

      {/* 선택 누적 목록 */}
      {selected.length === 0 ? (
        <p className="text-xs text-muted-foreground">선택한 배지가 없습니다.</p>
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
