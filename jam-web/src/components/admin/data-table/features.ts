import {
  columnVisibilityFeature,
  createSortedRowModel,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
} from '@tanstack/react-table'

/**
 * 어드민 Data Table 공용 feature 세트 (TanStack Table v9, 20260826_014).
 *
 * v9는 feature 단위로 opt-in한다 — 여기 등록하지 않은 기능은 번들에서 트리쉐이킹된다.
 * 페이지네이션·필터링 feature는 일부러 등록하지 않는다:
 * - 이 프로젝트의 어드민 목록은 전부 서버사이드 페이지네이션(`page.tsx`의 searchParams
 *   기반 쿼리, 20260826_011)이라 TanStack 자체 페이지네이션이 필요 없다. 페이지 이동은
 *   기존 `Pagination` 컴포넌트(URL page 파라미터)가 그대로 담당한다.
 * - 필터도 서버(URL searchParams)에 위임한다 — 목록/카드 뷰가 뷰포트에 따라 조건부로
 *   마운트되므로(`BadgeList.tsx`) 필터 UI(`BadgesFilterBar.tsx`)는 데스크탑 전용인 이
 *   테이블의 `table` 인스턴스 밖(page.tsx 레벨)에 산다. 그래서 `DataTableFacetedFilter`는
 *   TanStack의 `column.setFilterValue()`가 아니라 값/콜백을 직접 받는다
 *   (`data-table-faceted-filter.tsx` 주석 참고).
 *
 * 정렬(`rowSortingFeature`)은 `manualSorting: true`로 각 테이블에서 사용해 서버 정렬과
 * 결합한다 — `sortedRowModel`을 등록해두되 manualSorting이 실제 재정렬을 건너뛴다
 * (TanStack 공식 매뉴얼 정렬 방식).
 */
export const dataTableFeatures = tableFeatures({
  columnVisibilityFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
})

/** `ColumnDef`/`Column`/`Table`/`Row`의 첫 제네릭 인자로 넘겨 feature API 타입을 준다 */
export type DataTableFeatures = typeof dataTableFeatures
