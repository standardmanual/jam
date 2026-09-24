import type { SortingState } from '@tanstack/react-table'

/**
 * 어드민 목록 URL 상태 규칙 — 단일 원천(티켓 20260924_0940, 하위 티켓 ②~⑪이 이 이름을
 * 그대로 쓴다). 서버(`page.tsx`)와 클라이언트(`use-list-params.ts`, 필터 바) 양쪽에서
 * 같은 규칙으로 URL을 읽고 써야 "필터를 바꾸면 1쪽으로 돌아간다" 같은 동작이 어긋나지
 * 않는다 — 전부 순수 함수로만 구성한다.
 */

/** 어드민 목록 화면의 한 쪽 크기 — 상위 티켓 §1-3에서 50으로 통일하기로 확정했다.
 *  기존 화면의 PAGE_SIZE(30·50·500)는 이 티켓에서 바꾸지 않는다(각 메뉴 티켓에서 전환). */
export const ADMIN_LIST_PAGE_SIZE = 50

/** 1-base 쪽 번호 → Supabase `.range(from, to)`에 바로 넘길 수 있는 [from, to] 튜플 */
export function pageRange(page: number, pageSize: number = ADMIN_LIST_PAGE_SIZE): [number, number] {
  const from = (Math.max(1, page) - 1) * pageSize
  return [from, from + pageSize - 1]
}

/** 총 건수 → 총 쪽수(최소 1쪽) */
export function totalPagesOf(totalCount: number, pageSize: number = ADMIN_LIST_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(totalCount / pageSize))
}

/**
 * 번호형 페이지 이동 목록 — 처음·끝은 항상 포함하고 현재 쪽 ±2만 채운 뒤 나머지는
 * 'ellipsis'로 생략한다(기존 POI 화면 전용 Pagination 컴포넌트의 buildPageList를 그대로 옮김).
 */
export function buildPageList(page: number, totalPages: number): (number | 'ellipsis')[] {
  const pages = new Set<number>([1, totalPages])
  for (let p = page - 2; p <= page + 2; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p)
  }
  const sorted = [...pages].sort((a, b) => a - b)
  const result: (number | 'ellipsis')[] = []
  let prev = 0
  for (const p of sorted) {
    if (prev && p - prev > 1) result.push('ellipsis')
    result.push(p)
    prev = p
  }
  return result
}

/** 현재 쿼리를 유지한 채 `page`만 바꾼 href를 만든다. 1쪽이면 `page` 키 자체를 지운다
 *  (기존 화면들의 "?page= 없으면 1쪽" 규칙과 동일). */
export function buildPageHref(pathname: string, searchParams: URLSearchParams, page: number): string {
  const params = new URLSearchParams(searchParams)
  if (page > 1) params.set('page', String(page))
  else params.delete('page')
  const qs = params.toString()
  return `${pathname}${qs ? `?${qs}` : ''}`
}

export interface ListParamPatchConfig {
  /** 필터 키의 기본값 — patch 값이 이 값과 같으면 URL에서 키를 지운다(빈 상태와 동일 취급) */
  defaults?: Record<string, string>
  /** 연쇄 필터 체인(부모 → 자식 순). 부모 키가 바뀌면 patch에 없는 하위 키를 함께 지운다 */
  cascade?: string[]
}

/**
 * 목록 URL 파라미터에 patch를 적용한 다음 상태를 계산한다(순수 함수).
 *
 * - patch 값이 null·빈 문자열·설정된 기본값이면 그 키를 지운다.
 * - `page` 외의 키가 하나라도 바뀌면 `page`를 지운다(필터·정렬이 바뀌면 1쪽으로 돌아간다).
 *   patch가 `page`만 담고 있으면(번호 페이지 이동) 이 규칙을 적용하지 않는다.
 * - `cascade`에 등록된 키가 바뀌면, patch에 그 하위 키가 명시돼 있지 않은 한 하위 키를
 *   함께 지운다(예: 배지 유형이 바뀌면 종목·트라이브 선택이 함께 풀린다).
 */
export function applyListParamPatch(
  current: Record<string, string | undefined>,
  patch: Record<string, string | null | undefined>,
  config: ListParamPatchConfig = {}
): Record<string, string | undefined> {
  const { defaults = {}, cascade = [] } = config
  const next: Record<string, string | undefined> = { ...current }
  const patchKeys = Object.keys(patch)
  const onlyPage = patchKeys.length > 0 && patchKeys.every((key) => key === 'page')

  for (const [key, rawValue] of Object.entries(patch)) {
    const isDefault = rawValue != null && defaults[key] === rawValue
    if (rawValue == null || rawValue === '' || isDefault) {
      delete next[key]
    } else {
      next[key] = rawValue
    }

    const cascadeIndex = cascade.indexOf(key)
    if (cascadeIndex !== -1) {
      for (const child of cascade.slice(cascadeIndex + 1)) {
        if (!(child in patch)) delete next[child]
      }
    }
  }

  if (!onlyPage) delete next.page

  return next
}

/**
 * 필터 조건만 담은 정규화 키(순서 무관, `page`·`sort` 제외) — 페이지를 넘는 선택
 * (`useCrossPageSelection`)이 "필터가 바뀌었으니 선택을 비운다"를 판정하는 기준이다.
 * 정렬이나 페이지 이동만으로는 대상 집합 자체가 바뀌지 않으므로 값이 그대로 유지돼야 한다.
 */
export function filterKeyOf(params: Record<string, string | undefined>): string {
  return Object.entries(params)
    .filter(([key, value]) => key !== 'page' && key !== 'sort' && value != null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
}

/**
 * URL `sort` 값 ↔ TanStack `SortingState` 변환 — 머리 칸 클릭 정렬(`useUrlSorting`)이 쓴다.
 * `sort` 값은 `${컬럼id}_asc` / `${컬럼id}_desc` 규칙을 따른다(기존 `BadgesTable.tsx`의
 * `paramToSorting`/`sortingToParam`을 일반화). `sortable`에 없는 컬럼 id는 무시한다.
 */
export function sortToSorting(sort: string | undefined, sortable: readonly string[]): SortingState {
  if (!sort) return []
  const columnId = sortable.find((id) => sort === `${id}_asc` || sort === `${id}_desc`)
  if (!columnId) return []
  return [{ id: columnId, desc: sort.endsWith('_desc') }]
}

export function sortingToSort(sorting: SortingState, sortable: readonly string[]): string | undefined {
  const entry = sorting.find((s) => sortable.includes(s.id))
  if (!entry) return undefined
  return `${entry.id}_${entry.desc ? 'desc' : 'asc'}`
}
