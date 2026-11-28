'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Input } from '@/components/ui/Input'
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
   * `mini`: compact보다 더 줄인 버전 — 높이 약 32px(입력 글자는 iOS 확대를 막으려고 16px 그대로).
   * 내 프로필의 팔로워·팔로잉 목록 위 전용(티켓 20261128_1700).
   */
  size?: 'default' | 'compact' | 'mini'
}

/** mini 크기의 «검색» 버튼 — xs 인라인 스타일을 덮어 높이 26px로 줄인다 */
const MINI_BUTTON_STYLE = {
  minHeight: 26,
  paddingTop: 3,
  paddingBottom: 3,
  paddingLeft: 12,
  paddingRight: 12,
} as const

export default function UserSearchBar({ defaultValue = '', size = 'default' }: UserSearchBarProps) {
  const router = useRouter()
  const [q, setQ] = useState(defaultValue)
  const isMini = size === 'mini'
  const isCompact = size === 'compact' || isMini

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
        containerClassName="focus-within:border-link focus-within:inset-ring focus-within:inset-ring-link"
        containerStyle={isMini ? { padding: '2px 2px 2px 12px', minHeight: 32 } : { padding: isCompact ? '4px 4px 4px 12px' : '6px 6px 6px 16px' }}
        className="placeholder:text-muted"
        leading={<SearchIcon className={`${isMini ? 'w-4 h-4' : 'w-5 h-5'} shrink-0 text-muted`} />}
        trailing={
          <Button
            type="submit"
            variant="primary"
            surface="sub"
            size={isCompact ? 'xs' : 'sm'}
            className="shrink-0"
            style={isMini ? MINI_BUTTON_STYLE : undefined}
          >
            {d.today.searchButton}
          </Button>
        }
      />
    </form>
  )
}
