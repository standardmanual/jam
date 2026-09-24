/**
 * POI 검토 큐 목록 쿼리 단일화(티켓 20260924_0948) — 목록 페이지(`admin/poi/review/page.tsx`)와
 * 전체 선택용 ID 조회(`api/admin/poi/review/ids`)가 같은 필터·정렬 규칙을 쓰도록
 * `parsePoiReviewListParams`(URL → 타입) + `applyPoiReviewListQuery`(타입 → 쿼리)로 나눈다.
 * 두 곳이 각자 필터를 구현하면 "검토 대기 N건"과 "이 조건의 N건 모두 선택" 건수가 어긋날 수 있다
 * (`poi-list-query.ts`와 같은 이유).
 */
import type { PoiRow } from '@/types/database'
import { sanitizeSearchTerm } from './search-term'

/** 검토 큐 목록에 쓰는 컬럼 — `admin/poi/review/page.tsx`의 단일 출처 */
export const POI_REVIEW_LIST_COLUMNS =
  'id, name, latitude, longitude, category, naver_category, naver_keyword, created_at, is_active'

export type PoiReviewRow = Pick<
  PoiRow,
  | 'id'
  | 'name'
  | 'latitude'
  | 'longitude'
  | 'category'
  | 'naver_category'
  | 'naver_keyword'
  | 'created_at'
  | 'is_active'
>

const POI_REVIEW_SORTS = ['created_desc', 'created_asc', 'name_asc', 'name_desc'] as const
export type PoiReviewSort = (typeof POI_REVIEW_SORTS)[number]

function isPoiReviewSort(value: string | undefined): value is PoiReviewSort {
  return !!value && (POI_REVIEW_SORTS as readonly string[]).includes(value)
}

/** 네이버 원본 분류 여러 개를 URL 한 값에 담는 구분자 — 분류 문자열 자체에 쉼표(`,`)와
 *  `>`가 들어가므로(예: "스포츠,레저>공원") 쉼표로는 나눌 수 없다 */
export const NAVER_CATEGORY_SEPARATOR = '|'

export interface PoiReviewListParams {
  /** {@link sanitizeSearchTerm}을 거친 검색어 — 빈 문자열이면 검색하지 않는다 */
  q: string
  /** 배정 카테고리(slug) */
  category: string | 'all'
  /** 네이버 원본 분류 — 비어 있으면 필터 없음 */
  naverCategories: string[]
  /** 수집일 범위(YYYY-MM-DD) — 형식이 다르면 빈 문자열 */
  from: string
  to: string
  sort: PoiReviewSort
}

const DEFAULT_SORT: PoiReviewSort = 'created_desc'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** URL(또는 API 쿼리) 파라미터 → 타입이 있는 목록 조건. 목록·전체 선택이 전부 이 함수를 거친다. */
export function parsePoiReviewListParams(raw: Record<string, string | undefined>): PoiReviewListParams {
  const naverCategories = (raw.naver_category ?? '')
    .split(NAVER_CATEGORY_SEPARATOR)
    .map((value) => value.trim())
    .filter((value) => value !== '')

  return {
    q: sanitizeSearchTerm(raw.q ?? ''),
    category: raw.category?.trim() || 'all',
    naverCategories: Array.from(new Set(naverCategories)),
    from: raw.from && DATE_RE.test(raw.from) ? raw.from : '',
    to: raw.to && DATE_RE.test(raw.to) ? raw.to : '',
    sort: isPoiReviewSort(raw.sort) ? raw.sort : DEFAULT_SORT,
  }
}

const SORT_COLUMN: Record<PoiReviewSort, readonly [string, boolean]> = {
  created_desc: ['created_at', false],
  created_asc: ['created_at', true],
  name_asc: ['name', true],
  name_desc: ['name', false],
}

export interface PoiReviewQueryResult<T> {
  data: T[] | null
  count: number | null
  error: { message: string } | null
}

/** Supabase 쿼리 빌더가 구조적으로 그대로 들어맞는 최소 인터페이스 — 호출부는
 *  `supabase.from('poi').select(...) as unknown as PoiReviewQuery<Row>`로 좁혀 쓴다.
 *  `pending_review`는 생성 타입에 없는 컬럼이라(마이그레이션 143) 컬럼명을 string으로 받는다. */
export interface PoiReviewQuery<T> {
  ilike(column: string, pattern: string): PoiReviewQuery<T>
  eq(column: string, value: string | boolean | number): PoiReviewQuery<T>
  in(column: string, values: string[]): PoiReviewQuery<T>
  gte(column: string, value: string): PoiReviewQuery<T>
  lte(column: string, value: string): PoiReviewQuery<T>
  order(column: string, options?: { ascending?: boolean }): PoiReviewQuery<T>
  range(from: number, to: number): PromiseLike<PoiReviewQueryResult<T>>
}

/**
 * 검토 대기(`pending_review = true`) 조건에 검색·필터·정렬을 더한다. `.select()`까지 호출한
 * 쿼리를 넘기면 `.range()`를 부를 수 있는 상태로 돌려준다. 보조 정렬로 `id`를 항상 붙인다
 * (동순위 페이징 안정성).
 */
export function applyPoiReviewListQuery<T>(query: PoiReviewQuery<T>, params: PoiReviewListParams): PoiReviewQuery<T> {
  let next = query.eq('pending_review', true)

  if (params.q) next = next.ilike('name', `%${params.q}%`)
  if (params.category !== 'all') next = next.eq('category', params.category)
  if (params.naverCategories.length > 0) next = next.in('naver_category', params.naverCategories)
  if (params.from) next = next.gte('created_at', `${params.from}T00:00:00`)
  if (params.to) next = next.lte('created_at', `${params.to}T23:59:59`)

  const [column, ascending] = SORT_COLUMN[params.sort]
  next = next.order(column, { ascending })
  next = next.order('id', { ascending: true })

  return next
}

/** 네이버 원본 분류 선택지 조회에 필요한 최소 인터페이스 */
export interface NaverCategoryQueryClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: boolean): {
        order(column: string): {
          range(
            from: number,
            to: number
          ): PromiseLike<{ data: { naver_category: string | null }[] | null; error: { message: string } | null }>
        }
      }
    }
  }
}

const NAVER_CATEGORY_PAGE_SIZE = 1000

/**
 * 검토 대기 행의 네이버 원본 분류 고유값(가나다순) — 필터 선택지용. 검토 대기 행을 끝까지 읽어야
 * 1,000행 상한에 걸려 선택지가 조용히 잘리지 않는다(페이지를 넘기며 빈 페이지가 나올 때까지).
 */
export async function collectPendingNaverCategories(client: NaverCategoryQueryClient): Promise<string[]> {
  const values = new Set<string>()

  for (let from = 0; ; from += NAVER_CATEGORY_PAGE_SIZE) {
    const { data, error } = await client
      .from('poi')
      .select('naver_category')
      .eq('pending_review', true)
      .order('id')
      .range(from, from + NAVER_CATEGORY_PAGE_SIZE - 1)
    if (error) throw new Error(error.message)

    const rows = data ?? []
    for (const row of rows) {
      const value = row.naver_category?.trim()
      if (value) values.add(value)
    }
    if (rows.length < NAVER_CATEGORY_PAGE_SIZE) break
  }

  return Array.from(values).sort((a, b) => a.localeCompare(b, 'ko'))
}
