'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/admin/ui/input'

/**
 * 아이템배지 발급 현황 검색바(티켓 20260829_2139) — `admin/badges/BadgesFilterBar.tsx`와
 * 동일한 디바운스+URL 동기화 패턴. 이 화면은 "배지 검색 우선 UX"(열린 결정 2)의 진입점이라
 * 필터는 검색어 하나뿐이다.
 */
export function ItemBadgeSearchBar() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '')

  useEffect(() => {
    const current = searchParams.get('q') ?? ''
    if (searchInput === current) return
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (searchInput.trim()) params.set('q', searchInput.trim())
      else params.delete('q')
      router.push(`/admin/item-badges?${params.toString()}`)
    }, 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  return (
    <Input
      placeholder="배지 이름으로 검색..."
      value={searchInput}
      onChange={(e) => setSearchInput(e.target.value)}
      className="h-9 w-full max-w-sm"
    />
  )
}
