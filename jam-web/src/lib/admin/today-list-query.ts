/**
 * 투데이 콘텐츠 목록 쿼리 단일화(티켓 20260924_0947, 상위 티켓 §4.1 투데이 행) — 목록 페이지
 * (`admin/today/page.tsx`)·전체 선택용 ID 조회(`api/admin/today/ids`)·내보내기
 * (`api/admin/today/export`)가 같은 필터·정렬 규칙을 쓰도록 `parseTodayListParams`(URL → 타입)
 * + `applyTodayListQuery`(타입 → 쿼리)로 나눈다(`poi-list-query.ts`와 같은 구조). 세 곳이 각자
 * 필터를 다시 구현하면 "총 N개"와 "전체 선택" 건수가 어긋난다.
 *
 * 날짜 조건은 예전 `page.tsx`와 같다: 선택 날짜(KST 달력 기준)에 걸치는 카드 —
 * `starts_at <= 그날 끝 AND ends_at >= 그날 시작`.
 */
import type { TodayCardRow, TodayCardTemplateType } from '@/types/database'
import { normalizeDateParam, kstDayBoundsIso } from './today-calendar'
import { TODAY_TEMPLATE_OPTIONS } from './today-sections'
import { sanitizeSearchTerm } from './search-term'
import { UNKNOWN_IMAGE_SOURCE_FILTER } from './contentImageSource'

/** 목록 표에 실제로 쓰는 컬럼만 select — 상세·폼 전용 컬럼(본문·참조 등)은 넣지 않는다 */
export const TODAY_LIST_COLUMNS =
  'id, title, template_type, layout_type, exposure_tags, starts_at, ends_at, sort_order, is_active, created_at, image_source'

export type TodayListRow = Pick<
  TodayCardRow,
  | 'id'
  | 'title'
  | 'template_type'
  | 'layout_type'
  | 'exposure_tags'
  | 'starts_at'
  | 'ends_at'
  | 'sort_order'
  | 'is_active'
  | 'created_at'
  | 'image_source'
>

/** "필터 결과 전체 선택" 상한(상위 티켓 §6 결정 1) */
export const TODAY_SELECT_ALL_CAP = 1000

export const TODAY_LIST_SORT_OPTIONS = [
  { value: 'order', label: '노출 순서' },
  { value: 'created_desc', label: '최근 등록순' },
  { value: 'title_asc', label: '제목 가나다순' },
  { value: 'title_desc', label: '제목 역순' },
] as const

export type TodayListSort = (typeof TODAY_LIST_SORT_OPTIONS)[number]['value']

export const DEFAULT_TODAY_LIST_SORT: TodayListSort = 'order'

function isTodayListSort(value: string | undefined): value is TodayListSort {
  return TODAY_LIST_SORT_OPTIONS.some((o) => o.value === value)
}

function isTemplateType(value: string | undefined): value is TodayCardTemplateType {
  return TODAY_TEMPLATE_OPTIONS.some((o) => o.value === value)
}

export interface TodayListParams {
  /** 'YYYY-MM-DD'(KST 달력 날짜) — 형식이 잘못됐거나 없으면 오늘 */
  date: string
  template: TodayCardTemplateType | undefined
  /** {@link sanitizeSearchTerm}을 거친 제목 검색어 — 빈 문자열이면 검색하지 않는다 */
  q: string
  sort: TodayListSort
  /** 제작 경로 필터(티켓 20260925_1411) — `admin-generator`·`agent-generator` 중 하나, 값
   *  없음(NULL)을 거르는 `UNKNOWN_IMAGE_SOURCE_FILTER`, 또는 필터 없음(undefined). */
  imageSource: string | undefined
}

/** URL(또는 API 쿼리) 파라미터 → 타입이 있는 목록 조건. 세 곳이 전부 이 함수를 거친다. */
export function parseTodayListParams(
  raw: Record<string, string | undefined>,
  now: Date = new Date()
): TodayListParams {
  return {
    date: normalizeDateParam(raw.date, now),
    template: isTemplateType(raw.template) ? raw.template : undefined,
    q: sanitizeSearchTerm(raw.q ?? ''),
    sort: isTodayListSort(raw.sort) ? raw.sort : DEFAULT_TODAY_LIST_SORT,
    imageSource: raw.image_source,
  }
}

export interface TodayListQueryResult<T> {
  data: T[] | null
  count: number | null
  error: { message: string } | null
}

/** Supabase 쿼리 빌더가 구조적으로 그대로 들어맞는 최소 인터페이스 — 호출부는
 *  `supabase.from('today_cards').select(...) as unknown as TodayListQuery<Row>`로 좁혀 쓴다. */
export interface TodayListQuery<T> {
  lte(column: string, value: string): TodayListQuery<T>
  gte(column: string, value: string): TodayListQuery<T>
  eq(column: string, value: string): TodayListQuery<T>
  ilike(column: string, pattern: string): TodayListQuery<T>
  is(column: string, value: null): TodayListQuery<T>
  order(column: string, options?: { ascending?: boolean }): TodayListQuery<T>
  range(from: number, to: number): PromiseLike<TodayListQueryResult<T>>
}

const SORT_COLUMNS: Record<TodayListSort, readonly (readonly [string, boolean])[]> = {
  order: [
    ['sort_order', true],
    ['starts_at', false],
  ],
  created_desc: [['created_at', false]],
  title_asc: [['title', true]],
  title_desc: [['title', false]],
}

/**
 * 날짜·템플릿·검색어·정렬을 쿼리에 적용한다. `.select()`까지 호출한 쿼리를 넘기면 `.range()`를
 * 부를 수 있는 상태로 돌려준다 — 쪽 크기(목록)·상한(전체 선택 ID 조회)은 호출부가 정한다.
 * 보조 정렬로 `id`를 항상 붙인다(동순위 페이징 안정성, `poi-list-query.ts`와 같은 이유).
 */
export function applyTodayListQuery<T>(query: TodayListQuery<T>, params: TodayListParams): TodayListQuery<T> {
  const { startIso, endIso } = kstDayBoundsIso(params.date)
  let next = query.lte('starts_at', endIso).gte('ends_at', startIso)

  if (params.template) next = next.eq('template_type', params.template)
  if (params.q) next = next.ilike('title', `%${params.q}%`)

  if (params.imageSource === UNKNOWN_IMAGE_SOURCE_FILTER) next = next.is('image_source', null)
  else if (params.imageSource) next = next.eq('image_source', params.imageSource)

  for (const [column, ascending] of SORT_COLUMNS[params.sort]) {
    next = next.order(column, { ascending })
  }
  next = next.order('id', { ascending: true })

  return next
}
