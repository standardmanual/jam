'use client'

import { useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { OnChangeFn, SortingState } from '@tanstack/react-table'
import {
  applyListParamPatch,
  filterKeyOf,
  sortToSorting,
  sortingToSort,
  type ListParamPatchConfig,
} from '@/lib/admin/list-params'

export interface UseListParamsResult {
  q: string
  sort: string | undefined
  page: number
  /** `page`·`sort`·`q`를 뺀 나머지 필터 키만 — `DataTableFacetedFilter` 등 필터 UI가 읽는 값 */
  filters: Record<string, string | undefined>
  /** 페이지를 넘는 선택 무효화 판정 키(= {@link filterKeyOf}) */
  filterKey: string
  /** `filters` + `q`(빈 값 제외) — "필터 결과 전체" 조회·CSV 내보내기처럼 서버에 그대로
   *  넘길 쿼리 파라미터가 필요한 곳에서 쓴다 */
  filterQuery: Record<string, string>
  setQ: (value: string) => void
  setSort: (value: string | null) => void
  setFilters: (patch: Record<string, string | null | undefined>) => void
  reset: () => void
}

/**
 * 어드민 목록 화면의 URL 상태를 읽고 쓰는 공용 훅(티켓 20260924_0940). 실제 규칙은
 * `lib/admin/list-params.ts`의 순수 함수(`applyListParamPatch` 등)가 갖고 있고, 이 훅은
 * `usePathname`/`useSearchParams`/`useRouter`에 그 규칙을 연결하기만 한다.
 */
export function useListParams(config: ListParamPatchConfig = {}): UseListParamsResult {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const current = useMemo(() => Object.fromEntries(searchParams.entries()), [searchParams])

  const push = (patch: Record<string, string | null | undefined>) => {
    const next = applyListParamPatch(current, patch, config)
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(next)) {
      if (value != null && value !== '') params.set(key, value)
    }
    const qs = params.toString()
    router.push(`${pathname}${qs ? `?${qs}` : ''}`)
  }

  const filters: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(current)) {
    if (key !== 'page' && key !== 'sort' && key !== 'q') filters[key] = value
  }

  const filterQuery: Record<string, string> = {}
  for (const [key, value] of Object.entries(filters)) {
    if (value != null && value !== '') filterQuery[key] = value
  }
  if (current.q) filterQuery.q = current.q

  return {
    q: current.q ?? '',
    sort: current.sort,
    page: Math.max(1, parseInt(current.page ?? '1', 10) || 1),
    filters,
    filterKey: filterKeyOf(current),
    filterQuery,
    setQ: (value) => push({ q: value || null }),
    setSort: (value) => push({ sort: value }),
    setFilters: (patch) => push(patch),
    reset: () => router.push(pathname),
  }
}

/**
 * 표 머리 칸 클릭 정렬 ↔ URL `sort` 동기화(TanStack `onSortingChange`). 드롭다운 정렬
 * (`DataTableSortSelect`)과 같은 URL 키를 쓰므로 값 규칙은 `sortToSorting`/`sortingToSort`
 * (`lib/admin/list-params.ts`)를 그대로 공유한다.
 */
export function useUrlSorting(
  headerSorts: readonly string[],
  defaultSort: SortingState = []
): { sorting: SortingState; onSortingChange: OnChangeFn<SortingState> } {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const sorting = useMemo(() => {
    const fromUrl = sortToSorting(searchParams.get('sort') ?? undefined, headerSorts)
    return fromUrl.length > 0 ? fromUrl : defaultSort
    // eslint-disable-next-line react-hooks/exhaustive-deps -- headerSorts·defaultSort는 화면마다 고정 배열/리터럴로 넘어와 매 렌더 재생성돼도 값은 같다
  }, [searchParams, headerSorts])

  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater
    const params = new URLSearchParams(searchParams.toString())
    const sortValue = sortingToSort(next, headerSorts)
    if (sortValue) params.set('sort', sortValue)
    else params.delete('sort')
    params.delete('page')
    const qs = params.toString()
    router.push(`${pathname}${qs ? `?${qs}` : ''}`)
  }

  return { sorting, onSortingChange }
}
