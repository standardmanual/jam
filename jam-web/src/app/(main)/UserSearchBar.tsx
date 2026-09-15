'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Button from '@/components/ui/Button'
import { SearchIcon } from '@/components/ui/icons'
import { d } from '@/lib/i18n'

interface UserSearchBarProps {
  /** 검색 결과 페이지 등에서 초기 검색어를 채워둘 때 사용 */
  defaultValue?: string
  /**
   * `default`(기본값): 기존 크기 그대로.
   * `compact`: 세로 크기(패딩·버튼 높이)를 축소한 조밀한 버전 — 가로폭은 동일하다.
   * `/search` 페이지 전용(티켓 20260915_2133), 홈 화면 등 기존 호출부는 영향 없음.
   */
  size?: 'default' | 'compact'
}

export default function UserSearchBar({ defaultValue = '', size = 'default' }: UserSearchBarProps) {
  const router = useRouter()
  const [q, setQ] = useState(defaultValue)
  const isCompact = size === 'compact'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = q.trim()
    if (!trimmed) return // 빈 검색어·공백만이면 제출 무시
    router.push(`/search?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex items-center gap-2 rounded-[var(--radius-cards)] bg-surface-inverse ${
        isCompact ? 'p-[var(--spacing-4)]' : 'p-[var(--spacing-8)]'
      }`}
    >
      <SearchIcon className="w-5 h-5 shrink-0 ml-2 text-text-inverse/40" />
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={d.today.searchPlaceholder}
        aria-label={d.today.searchAriaLabel}
        className={`flex-1 min-w-0 bg-transparent px-1 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse placeholder:text-text-inverse/40 focus:outline-none ${
          isCompact ? 'py-1' : 'py-2'
        }`}
      />
      <Button
        type="submit"
        variant="primary"
        surface="sub"
        size={isCompact ? 'xs' : 'sm'}
        className="shrink-0"
      >
        {d.today.searchButton}
      </Button>
    </form>
  )
}
