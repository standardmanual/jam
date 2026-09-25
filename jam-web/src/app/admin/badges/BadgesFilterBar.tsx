'use client'

import { Button } from '@/components/admin/ui/button'
import { DataTableToolbar } from '@/components/admin/data-table/data-table-toolbar'
import { DataTableFacetedFilter } from '@/components/admin/data-table/data-table-faceted-filter'
import { DataTableSearch } from '@/components/admin/data-table/data-table-search'
import { DataTableSortSelect } from '@/components/admin/data-table/data-table-sort-select'
import { useListParams } from '@/components/admin/data-table/use-list-params'
import { BADGE_TYPES, BADGE_TYPE_LABEL, UNASSIGNED_POI_CATEGORY } from '@/lib/admin/badge-labels'
import { BADGE_LIST_SORT_OPTIONS, CONDITION_FIELD_FILTER_OPTIONS, DEFAULT_BADGE_LIST_SORT } from '@/lib/admin/badge-list-view'
import { IMAGE_SOURCE_FILTER_OPTIONS } from '@/lib/admin/contentImageSource'

const TYPE_OPTIONS = BADGE_TYPES.map((t) => ({ value: t as string, label: BADGE_TYPE_LABEL[t] }))

const RARITY_OPTIONS = [
  { value: 'common', label: 'Common' },
  { value: 'rare', label: 'Rare' },
  { value: 'epic', label: 'Epic' },
  { value: 'mystic', label: 'Mystic' },
]

const STATUS_OPTIONS = [
  { value: 'active', label: '활성' },
  { value: 'inactive', label: '비활성' },
  { value: 'all', label: '전체' },
]

// 목록(계열순·레벨순 포함)은 `badge-list-view.ts`가 서버 페이지와 공유하는 단일 출처다 —
// 여기서 다시 나열하면 서버가 모르는 값을 고를 수 있다(티켓 20260905_0032 C-2).
const SORT_OPTIONS = BADGE_LIST_SORT_OPTIONS

// JAM!(어드민 전용 분류, admin_category='jam')을 여섯 번째 종목처럼 이 목록에 함께 둔다 —
// 별도의 "카테고리" 드롭다운으로 분리해 두면 종목을 고르려는 어드민이 못 찾는다(티켓
// 20260910_2258). 선택값 매핑은 handleActivityTypeChange 참고.
const ACTIVITY_TYPE_OPTIONS = [
  { value: 'cycling', label: '사이클링' },
  { value: 'running', label: '러닝' },
  { value: 'trail_running', label: '트레일 러닝' },
  { value: 'hiking', label: '하이킹' },
  { value: 'walking', label: '걷기' },
  { value: 'jam', label: 'JAM!' },
]

// 연쇄 필터 체인(부모 → 자식). type이 바뀌면 이 뒤의 서브 필터가 전부 풀리고, tribe_id가
// 바뀌면 item_book_id만 풀린다(`applyListParamPatch`의 cascade 규칙).
const FILTER_CASCADE = ['type', 'activity_type', 'admin_category', 'poi_category', 'tribe_id', 'item_book_id']

interface BadgesFilterBarProps {
  tribes: { id: string; name: string }[]
  itemBooks: { id: string; name: string; tribe_id: string | null }[]
  poiCategories: { slug: string; label: string }[]
}

/**
 * 배지 목록 필터 바(티켓 20260924_0944) — 공용 부품(`useListParams`·`DataTableSearch`·
 * `DataTableSortSelect`·`DataTableFacetedFilter`)으로 전면 교체했다.
 *
 * `status` 기본값을 `'active'`로 등록해 두면(예전 버그였던) "전체" 선택이 URL에서 지워지지
 * 않는다 — 옛 코드는 값이 `'all'`이면 무조건 키를 지워서, "전체"를 골라도 `status`가
 * 기본값(active)으로 되돌아갔다(`badges/page.tsx`의 `parseBadgeListParams`는 처음부터
 * `status=all`을 올바르게 존중했다 — 문제는 이 필터 바가 URL에 그 값을 남기지 못한 것뿐).
 */
export default function BadgesFilterBar({ tribes, itemBooks, poiCategories }: BadgesFilterBarProps) {
  const { q, filters, setFilters, reset } = useListParams({
    defaults: { status: 'active' },
    cascade: FILTER_CASCADE,
  })

  const currentType = filters.type ?? 'all'
  const currentTribeId = filters.tribe_id ?? 'all'
  const currentStatus = filters.status ?? 'active'
  const hasFilter = q !== '' || Object.keys(filters).length > 0

  const handleTypeChange = (values: string[]) => {
    setFilters({ type: values[0] ?? null })
  }

  const handleTribeChange = (values: string[]) => {
    // 트라이브 변경 시 아이템북 초기화(cascade가 처리 — item_book_id는 명시하지 않는다)
    setFilters({ tribe_id: values[0] ?? null })
  }

  // "액티비티" 드롭다운에서 JAM!을 고르면 activity_type이 아니라 admin_category=jam으로
  // 매핑한다(서버 쿼리 파라미터는 그대로, 티켓 20260910_2258). 둘은 동시에 걸리지 않는
  // 상호배타 선택이라 하나를 세팅하면 다른 하나는 비운다.
  const handleActivityTypeChange = (values: string[]) => {
    const value = values[0]
    if (value === 'jam') {
      setFilters({ activity_type: null, admin_category: 'jam' })
    } else {
      setFilters({ activity_type: value ?? null, admin_category: null })
    }
  }

  // 선택된 트라이브 기준으로 아이템북 필터링
  const filteredItemBooks =
    currentTribeId === 'all' ? itemBooks : itemBooks.filter((b) => b.tribe_id === currentTribeId)

  return (
    <div className="flex flex-col gap-3">
      <DataTableToolbar actions={<DataTableSortSelect options={SORT_OPTIONS} defaultValue={DEFAULT_BADGE_LIST_SORT} />}>
        <DataTableSearch placeholder="배지 이름, 설명으로 검색..." />

        <DataTableFacetedFilter
          title="타입"
          options={TYPE_OPTIONS}
          selected={currentType === 'all' ? [] : [currentType]}
          onChange={handleTypeChange}
        />

        {/* 액티비티 서브 필터 — JAM!(admin_category='jam')도 여섯 번째 종목으로 여기 섞여
            있다(티켓 20260910_2258). */}
        {currentType === 'activity' && (
          <DataTableFacetedFilter
            title="액티비티"
            options={ACTIVITY_TYPE_OPTIONS}
            selected={filters.admin_category === 'jam' ? ['jam'] : filters.activity_type ? [filters.activity_type] : []}
            onChange={handleActivityTypeChange}
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
            selected={filters.poi_category ? [filters.poi_category] : []}
            onChange={(values) => setFilters({ poi_category: values[0] ?? null })}
          />
        )}

        {/* 아이템 서브 필터: 트라이브 + 아이템북 */}
        {currentType === 'item' && (
          <>
            <DataTableFacetedFilter
              title="트라이브"
              options={tribes.map((f) => ({ value: f.id, label: f.name }))}
              selected={currentTribeId === 'all' ? [] : [currentTribeId]}
              onChange={handleTribeChange}
            />
            <DataTableFacetedFilter
              title="컬렉션"
              options={filteredItemBooks.map((b) => ({ value: b.id, label: b.name }))}
              selected={filters.item_book_id ? [filters.item_book_id] : []}
              onChange={(values) => setFilters({ item_book_id: values[0] ?? null })}
            />
          </>
        )}

        <DataTableFacetedFilter
          title="등급"
          options={RARITY_OPTIONS}
          selected={filters.rarity ? [filters.rarity] : []}
          onChange={(values) => setFilters({ rarity: values[0] ?? null })}
        />

        {/* 조건 필드 필터 — 선택지는 조건 레지스트리에서 파생된다(예: 평균 파워를 쓰는 배지만).
            새 조건 필드를 레지스트리에 추가하면 여기에도 자동으로 나타난다. */}
        <DataTableFacetedFilter
          title="조건 필드"
          options={CONDITION_FIELD_FILTER_OPTIONS}
          selected={filters.condition_field ? [filters.condition_field] : []}
          onChange={(values) => setFilters({ condition_field: values[0] ?? null })}
        />

        <DataTableFacetedFilter
          title="상태"
          options={STATUS_OPTIONS}
          selected={[currentStatus]}
          onChange={(values) => setFilters({ status: values[0] ?? null })}
        />

        {/* 제작 경로 필터(티켓 20260924_2200) — 값 3종 + "미상"(값 없음). 옵션·sentinel은
            contentImageSource.ts가 단일 출처다. */}
        <DataTableFacetedFilter
          title="제작 경로"
          options={IMAGE_SOURCE_FILTER_OPTIONS}
          selected={filters.image_source ? [filters.image_source] : []}
          onChange={(values) => setFilters({ image_source: values[0] ?? null })}
        />

        {hasFilter && (
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={reset}>
            필터 초기화
          </Button>
        )}
      </DataTableToolbar>
    </div>
  )
}
