'use client'

import { useEffect, useRef, useState } from 'react'
import { IconX } from '@tabler/icons-react'

export interface UserSearchResult {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

interface UserMultiSearchSelectProps {
  /** 클릭 시 즉시 호출된다. 로컬 배열에 추가하는 건 호출부 책임(BadgeMultiSearchSelect와 동일 패턴). */
  onSelect: (user: UserSearchResult) => void
  /** 현재 선택된 유저 목록 — 칩으로 렌더링해 개별 제거 아이콘을 보여준다. */
  selected: UserSearchResult[]
  onRemove: (id: string) => void
  placeholder?: string
}

function labelOf(u: UserSearchResult): string {
  return u.display_name?.trim() || u.username || '(이름 없음)'
}

/**
 * 유저를 아이디/이름으로 검색해서 여러 명 고르는 멀티애드 콤보박스(티켓 20260911_1440,
 * 랭킹모드 "유저 직접 지정" 대상 선택). `BadgeMultiSearchSelect.tsx`와 같은 상호작용 패턴을
 * 그대로 따른다(구현 계획 — "기존 배지 선택 화면의 검색해서 목록에 담는 패턴을 그대로 참고") —
 * 클릭해도 닫히지 않고 계속 검색·추가할 수 있다.
 */
export default function UserMultiSearchSelect({ onSelect, selected, onRemove, placeholder }: UserMultiSearchSelectProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserSearchResult[]>([])
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
        const res = await fetch(`/api/admin/users/search?${params.toString()}`)
        const data = await res.json()
        setResults((data.users ?? []) as UserSearchResult[])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(handle)
  }, [query, open])

  const excluded = new Set(selected.map((u) => u.id))
  const displayResults = query.trim() ? results.filter((u) => !excluded.has(u.id)) : []

  function pick(user: UserSearchResult) {
    onSelect(user)
    setResults((prev) => prev.filter((u) => u.id !== user.id))
  }

  return (
    <div ref={rootRef} className="relative">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => onRemove(u.id)}
              className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/30 rounded-lg px-2 py-1 hover:bg-primary/20 transition-colors"
            >
              {labelOf(u)}
              <IconX className="h-3.5 w-3.5" />
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
        placeholder={placeholder ?? '아이디 또는 이름 검색...'}
        className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
      />
      {open && query.trim() && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {loading && <p className="px-3 py-2 text-xs text-muted-foreground">검색 중...</p>}
          {!loading && displayResults.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">검색 결과가 없습니다.</p>
          )}
          {!loading &&
            displayResults.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => pick(u)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                {labelOf(u)} {u.username && <span className="text-muted-foreground text-xs">@{u.username}</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
