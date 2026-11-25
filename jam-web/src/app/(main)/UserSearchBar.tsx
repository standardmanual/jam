'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Input } from '@ds/components/forms/Input'
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

  // DS Input(캡슐 --field-radius, --surface 면, 1px --field-border, --foreground 글자)에 검색 아이콘과 제출 버튼을 슬롯으로 결합한다(티켓 20261125_1444).
  return (
    <form onSubmit={handleSubmit}>
      <Input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={d.today.searchPlaceholder}
        aria-label={d.today.searchAriaLabel}
        containerClassName="focus-within:border-link focus-within:shadow-[inset_0_0_0_1px_var(--link)]"
        containerStyle={{ padding: isCompact ? '4px 4px 4px 12px' : '6px 6px 6px 16px' }}
        className="placeholder:text-muted"
        leading={<SearchIcon className="w-5 h-5 shrink-0 text-muted" />}
        trailing={
          <Button
            type="submit"
            variant="primary"
            surface="sub"
            size={isCompact ? 'xs' : 'sm'}
            className="shrink-0"
          >
            {d.today.searchButton}
          </Button>
        }
      />
    </form>
  )
}
