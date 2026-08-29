'use client'

import { useEffect, useState } from 'react'
import { IconCheck, IconChevronDown } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/admin/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/admin/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/admin/ui/popover'

export interface SearchedUser {
  id: string
  username: string | null
  email: string
}

interface UserSearchComboboxProps {
  value: SearchedUser | null
  onChange: (user: SearchedUser | null) => void
  /** Radix Portal 컨테이너 — 어드민 테마 스코프 노드([data-admin-theme]) 지정용 */
  container?: HTMLElement | null
}

/**
 * 유저명/이메일 검색으로 대상 유저 1명을 고르는 콤보박스(티켓 20260829_2150) —
 * 고아 아이템배지 재배정 대상 지정에 쓴다(유저 ID 직접 입력 방식은 채택하지 않음,
 * 티켓 §"대상 유저 지정"). 기존 `/api/admin/users?q=`(유저명/이메일 ilike 검색,
 * 최대 20건)를 그대로 재사용한다 — simulator 페이지가 같은 API를 plain input으로
 * 쓰던 것을 이 화면에서는 shadcn Popover+Command 표준 콤보박스로 구현한다.
 */
export function UserSearchCombobox({ value, onChange, container }: UserSearchComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchedUser[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !query.trim()) return
    const handle = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/users?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults((data.users ?? []) as SearchedUser[])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(handle)
  }, [query, open])

  // query가 비면(방금 열었거나 지웠을 때) 직전 검색 결과를 그대로 보여주지 않는다
  // (BadgeSearchSelect.tsx와 동일 패턴) — effect 본문에서 setState를 동기 호출하지 않도록
  // 상태를 비우는 대신 파생값으로 처리한다(react-hooks/set-state-in-effect).
  const displayResults = query.trim() ? results : []

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value ? (
            <span className="truncate">
              {value.username ?? '(닉네임 없음)'} <span className="text-muted-foreground">· {value.email}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">유저명 또는 이메일로 검색</span>
          )}
          <IconChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start" container={container ?? undefined}>
        <Command shouldFilter={false}>
          <CommandInput placeholder="유저명 또는 이메일 검색..." value={query} onValueChange={setQuery} />
          <CommandList>
            {loading && <p className="py-6 text-center text-sm text-muted-foreground">검색 중...</p>}
            {!loading && query.trim() && displayResults.length === 0 && (
              <CommandEmpty>검색 결과가 없습니다</CommandEmpty>
            )}
            {!loading && displayResults.length > 0 && (
              <CommandGroup>
                {displayResults.map((u) => (
                  <CommandItem
                    key={u.id}
                    value={u.id}
                    onSelect={() => {
                      onChange(u)
                      setOpen(false)
                    }}
                  >
                    <IconCheck className={cn('h-4 w-4', value?.id === u.id ? 'opacity-100' : 'opacity-0')} />
                    <div className="flex flex-col">
                      <span>{u.username ?? '(닉네임 없음)'}</span>
                      <span className="text-xs text-muted-foreground">{u.email}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
