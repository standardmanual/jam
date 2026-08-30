'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { DataTableToolbar } from '@/components/admin/data-table/data-table-toolbar'
import { DataTableFacetedFilter } from '@/components/admin/data-table/data-table-faceted-filter'
import { BADGE_TYPES, BADGE_TYPE_LABEL, UNASSIGNED_POI_CATEGORY } from '@/lib/admin/badge-labels'

const TYPE_OPTIONS = BADGE_TYPES.map((t) => ({ value: t as string, label: BADGE_TYPE_LABEL[t] }))

const RARITY_OPTIONS = [
  { value: 'common', label: 'Common' },
  { value: 'rare', label: 'Rare' },
  { value: 'legend', label: 'Legend' },
  { value: 'mythic', label: 'Mythic' },
]

const STATUS_OPTIONS = [
  { value: 'active', label: '활성' },
  { value: 'inactive', label: '비활성' },
  { value: 'all', label: '전체' },
]

// 최신순/오래된순은 created_at 기준이라 데스크탑 테이블에 노출되는 컬럼이 없어 헤더 클릭으로
// 대체할 수 없다(BadgesTable.tsx 주석 참고) — 이 드롭다운이 계속 담당한다. 이름 오름/내림차순은
// 데스크탑에서는 "이름" 헤더 클릭으로도 가능하지만, 모바일 카드 뷰는 헤더가 없어 이 드롭다운이
// 유일한 경로다(이번 티켓은 모바일 카드 뷰를 건드리지 않는다).
const SORT_OPTIONS = [
  { value: 'created_desc', label: '최신순' },
  { value: 'created_asc', label: '오래된 순' },
  { value: 'name_asc', label: '이름 (가나다)' },
  { value: 'name_desc', label: '이름 (역순)' },
]

const ACTIVITY_TYPE_OPTIONS = [
  { value: 'cycling', label: '사이클링' },
  { value: 'running', label: '러닝' },
  { value: 'trail_running', label: '트레일 러닝' },
  { value: 'hiking', label: '하이킹' },
  { value: 'walking', label: '걷기' },
]

// 타입 변경 시 초기화할 서브 필터 파라미터
const SUB_FILTER_KEYS = ['activity_type', 'poi_category', 'faction_id', 'item_book_id']

interface BadgesFilterBarProps {
  factions: { id: string; name: string }[]
  itemBooks: { id: string; name: string; faction_id: string | null }[]
  poiCategories: { slug: string; label: string }[]
}

/**
 * 배지 목록 필터 바(20260826_014) — shadcn 공식 Data Table Toolbar 패턴으로 재구현.
 *
 * 데스크탑 테이블뿐 아니라 모바일 카드 뷰(BadgeList.tsx)에도 적용되는 페이지 레벨
 * 필터라 TanStack `table` 인스턴스와 무관하게 URL(searchParams)로 서버 필터링을 직접
 * 제어한다(`DataTableFacetedFilter`가 `column` 대신 값/콜백을 받는 이유).
 */
export default function BadgesFilterBar({ factions, itemBooks, poiCategories }: BadgesFilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '')

  const currentType = searchParams.get('type') ?? 'all'
  const currentFactionId = searchParams.get('faction_id') ?? 'all'
  const currentStatus = searchParams.get('status') ?? 'active'

  const update = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === 'all' || value === 'created_desc') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    }
    params.delete('page')
    router.push(`/admin/badges?${params.toString()}`)
  }

  // 검색어는 타이핑마다 즉시 서버로 보내지 않고 디바운스 후 반영한다(공식 Toolbar의 Input은
  // 별도 검색 버튼이 없다 — 그렇다고 매 키 입력마다 라우팅하면 요청이 과도해진다).
  useEffect(() => {
    const current = searchParams.get('q') ?? ''
    if (searchInput === current) return
    const timer = setTimeout(() => update({ q: searchInput.trim() || null }), 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  const handleTypeChange = (values: string[]) => {
    const value = values[0] ?? 'all'
    // 타입 변경 시 서브 필터 전체 초기화
    const cleared = Object.fromEntries(SUB_FILTER_KEYS.map((k) => [k, null])) as Record<string, null>
    update({ type: value, ...cleared })
  }

  const handleFactionChange = (values: string[]) => {
    // 세계관 변경 시 아이템북 초기화
    update({ faction_id: values[0] ?? 'all', item_book_id: null })
  }

  const hasFilter =
    searchParams.has('q') ||
    searchParams.has('type') ||
    searchParams.has('rarity') ||
    searchParams.has('status') ||
    SUB_FILTER_KEYS.some((k) => searchParams.has(k))

  // 선택된 세계관 기준으로 아이템북 필터링
  const filteredItemBooks =
    currentFactionId === 'all' ? itemBooks : itemBooks.filter((b) => b.faction_id === currentFactionId)

  return (
    <div className="flex flex-col gap-3">
      <DataTableToolbar
        actions={
          <Select value={searchParams.get('sort') ?? 'created_desc'} onValueChange={(v) => update({ sort: v })}>
            <SelectTrigger className="h-8 w-auto min-w-[8rem]" aria-label="정렬">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      >
        <Input
          placeholder="배지 이름, 설명으로 검색..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="h-8 w-[180px] lg:w-[260px]"
        />

        <DataTableFacetedFilter
          title="타입"
          options={TYPE_OPTIONS}
          selected={currentType === 'all' ? [] : [currentType]}
          onChange={handleTypeChange}
        />

        {/* 액티비티 서브 필터 */}
        {currentType === 'activity' && (
          <DataTableFacetedFilter
            title="액티비티"
            options={ACTIVITY_TYPE_OPTIONS}
            selected={searchParams.get('activity_type') ? [searchParams.get('activity_type') as string] : []}
            onChange={(values) => update({ activity_type: values[0] ?? null })}
          />
        )}

        {/* 지점 카테고리 서브 필터 — 체크인 배지는 연결된 지점(poi.category)으로만 분류된다.
            "미할당"은 연결된 지점이 하나도 없는 배지를 걸러 보는 옵션(티켓 20260830_1510) —
            poi_categories의 실제 카테고리가 아니라 전용 sentinel 값이다. */}
        {currentType === 'checkin' && (
          <DataTableFacetedFilter
            title="지점 카테고리"
            options={[
              ...poiCategories.map((c) => ({ value: c.slug, label: c.label })),
              { value: UNASSIGNED_POI_CATEGORY, label: '미할당' },
            ]}
            selected={searchParams.get('poi_category') ? [searchParams.get('poi_category') as string] : []}
            onChange={(values) => update({ poi_category: values[0] ?? null })}
          />
        )}

        {/* 아이템 서브 필터: 세계관 + 아이템북 */}
        {currentType === 'item' && (
          <>
            <DataTableFacetedFilter
              title="세계관"
              options={factions.map((f) => ({ value: f.id, label: f.name }))}
              selected={currentFactionId === 'all' ? [] : [currentFactionId]}
              onChange={handleFactionChange}
            />
            <DataTableFacetedFilter
              title="컬렉션"
              options={filteredItemBooks.map((b) => ({ value: b.id, label: b.name }))}
              selected={searchParams.get('item_book_id') ? [searchParams.get('item_book_id') as string] : []}
              onChange={(values) => update({ item_book_id: values[0] ?? null })}
            />
          </>
        )}

        <DataTableFacetedFilter
          title="등급"
          options={RARITY_OPTIONS}
          selected={searchParams.get('rarity') ? [searchParams.get('rarity') as string] : []}
          onChange={(values) => update({ rarity: values[0] ?? null })}
        />

        <DataTableFacetedFilter
          title="상태"
          options={STATUS_OPTIONS}
          selected={[currentStatus]}
          onChange={(values) => update({ status: values[0] ?? null })}
        />

        {hasFilter && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => {
              setSearchInput('')
              router.push('/admin/badges')
            }}
          >
            필터 초기화
          </Button>
        )}
      </DataTableToolbar>
    </div>
  )
}
