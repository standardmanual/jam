'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Button from '@/components/ui/Button'
import { SearchIcon } from '@/components/ui/icons'
import { d } from '@/lib/i18n'

interface UserSearchBarProps {
  /** 검색 결과 페이지 등에서 초기 검색어를 채워둘 때 사용 */
  defaultValue?: string
}

export default function UserSearchBar({ defaultValue = '' }: UserSearchBarProps) {
  const router = useRouter()
  const [q, setQ] = useState(defaultValue)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = q.trim()
    if (!trimmed) return // 빈 검색어·공백만이면 제출 무시
    router.push(`/search?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 p-[var(--spacing-8)] rounded-[var(--radius-cards)] bg-surface-inverse"
    >
      <SearchIcon className="w-5 h-5 shrink-0 ml-2 text-text-inverse/40" />
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={d.today.searchPlaceholder}
        aria-label={d.today.searchAriaLabel}
        className="flex-1 min-w-0 bg-transparent px-1 py-2 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse placeholder:text-text-inverse/40 focus:outline-none"
      />
      <Button type="submit" variant="primary" surface="sub" size="sm" className="shrink-0">
        {d.today.searchButton}
      </Button>
    </form>
  )
}
