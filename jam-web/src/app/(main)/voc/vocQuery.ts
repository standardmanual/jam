/**
 * VOC 게시판의 정렬·페이지를 주소 쿼리(`/voc?sort=answered&page=2`)로 읽고 쓰는 규칙 (티켓 20261110_1217).
 *
 * - 기본값(최신순, 1쪽)은 쿼리에서 뺀다.
 * - 정렬을 바꾸면 1쪽으로 돌아가므로 page 키도 함께 지운다. 정렬은 replace, 페이지 번호는 push로 쓴다
 *   (호출하는 쪽 `page.tsx`가 정한다) — 뒤로가기가 이전 페이지로 돌아가게 하려는 것이다.
 */
import type { VocSortKey } from '@/app/api/voc/route'
import { buildQueryHref, readEnumParam, readPageParam, type QuerySource } from '@/lib/urlQueryState'

export const VOC_SORT_KEYS = ['latest', 'answered'] as const satisfies readonly VocSortKey[]
export const DEFAULT_VOC_SORT: VocSortKey = 'latest'

const SORT_KEY = 'sort'
const PAGE_KEY = 'page'

/** 주소 쿼리 → 정렬·페이지. 모르는 값은 기본값(최신순·1쪽). */
export function readVocQuery(params: QuerySource): { sort: VocSortKey; page: number } {
  return {
    sort: readEnumParam(params, SORT_KEY, VOC_SORT_KEYS, DEFAULT_VOC_SORT),
    page: readPageParam(params, PAGE_KEY),
  }
}

/** 정렬 전환 주소 — page는 항상 지운다(1쪽으로 리셋). */
export function vocSortHref(pathname: string, params: QuerySource, sort: VocSortKey): string {
  return buildQueryHref(pathname, params, {
    [SORT_KEY]: sort === DEFAULT_VOC_SORT ? null : sort,
    [PAGE_KEY]: null,
  })
}

/** 페이지 전환 주소 — 1쪽은 쿼리에서 뺀다. 정렬 등 다른 쿼리는 보존한다. */
export function vocPageHref(pathname: string, params: QuerySource, page: number): string {
  return buildQueryHref(pathname, params, { [PAGE_KEY]: page <= 1 ? null : String(page) })
}
