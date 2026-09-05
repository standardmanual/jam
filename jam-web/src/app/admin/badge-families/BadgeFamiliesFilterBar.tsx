'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { DataTableToolbar } from '@/components/admin/data-table/data-table-toolbar'
import { DataTableFacetedFilter } from '@/components/admin/data-table/data-table-faceted-filter'

interface FilterOption {
  value: string
  label: string
}

interface BadgeFamiliesFilterBarProps {
  /** 종목 선택지 — 목록에 실제로 있는 종목만(순서는 배지 트리 탭 순서) */
  activityOptions: FilterOption[]
  /** 사용 조건 지표 선택지 — 라벨·순서는 조건 레지스트리에서 나온다 */
  conditionOptions: FilterOption[]
}

/**
 * 계열 목록 필터 바 (티켓 20260905_0032 C-3)
 *
 * B묶음이 만든 계열 목록에는 좁힐 수단이 없었다 — **164계열이 되면 눈으로 훑을 수 없다.**
 * 배지 목록 필터(`admin/badges/BadgesFilterBar.tsx`)와 같은 shadcn Data Table Toolbar
 * 패턴이라, 두 화면의 조작 방식이 갈리지 않는다. 필터 상태는 URL(searchParams)에 두고
 * 서버 컴포넌트가 목록을 좁힌다(공유 링크로 같은 화면을 열 수 있다).
 */
export default function BadgeFamiliesFilterBar({
  activityOptions,
  conditionOptions,
}: BadgeFamiliesFilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '')

  const update = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') params.delete(key)
      else params.set(key, value)
    }
    const queryString = params.toString()
    router.push(queryString ? `/admin/badge-families?${queryString}` : '/admin/badge-families')
  }

  // 검색어는 타이핑마다 라우팅하지 않고 디바운스 후 반영한다(배지 목록 필터와 같은 방식).
  useEffect(() => {
    const current = searchParams.get('q') ?? ''
    if (searchInput === current) return
    const timer = setTimeout(() => update({ q: searchInput.trim() || null }), 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  const hasFilter =
    searchParams.has('q') || searchParams.has('activity_type') || searchParams.has('condition_key')

  return (
    <DataTableToolbar>
      <Input
        placeholder="계열명, 계열 키로 검색..."
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className="h-8 w-[180px] lg:w-[260px]"
      />

      <DataTableFacetedFilter
        title="종목"
        options={activityOptions}
        selected={searchParams.get('activity_type') ? [searchParams.get('activity_type') as string] : []}
        onChange={(values) => update({ activity_type: values[0] ?? null })}
      />

      <DataTableFacetedFilter
        title="사용 조건 지표"
        options={conditionOptions}
        selected={searchParams.get('condition_key') ? [searchParams.get('condition_key') as string] : []}
        onChange={(values) => update({ condition_key: values[0] ?? null })}
      />

      {hasFilter && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => {
            setSearchInput('')
            router.push('/admin/badge-families')
          }}
        >
          필터 초기화
        </Button>
      )}
    </DataTableToolbar>
  )
}
