/**
 * `GET /api/admin/ops-places` 쿼리 읽기 (티켓 20261102_1602).
 *
 * 형식이나 범위가 틀린 값은 `null`을 돌려주고, 라우트가 400으로 받아 아무것도 읽지 않는다.
 * 쿼리가 하나도 없으면 카테고리 요약(`mode: 'summary'`), `category`가 있으면 그 카테고리의 장소 목록(`mode: 'list'`)이다.
 * `category` 없이 `q`·`sort`·`limit`·`offset`만 오면 요약에는 쓸 곳이 없으므로 400이다(조용히 무시하지 않는다).
 */
import type { PlaceListQuery, PlaceSort } from './types'

export const PLACES_DEFAULT_LIMIT = 30
export const PLACES_MAX_LIMIT = 100
export const PLACES_Q_MAX_LENGTH = 100
export const PLACES_QUERY_INVALID_MESSAGE =
  'category는 영문 소문자·숫자·밑줄, limit은 1부터 100까지, offset은 0 이상의 정수, sort는 drops 또는 name으로 보내 주세요. limit·offset·sort·q는 category와 함께만 쓸 수 있어요.'

const CATEGORY_RE = /^[a-z][a-z0-9_]{0,49}$/
const LIST_ONLY_KEYS = ['q', 'limit', 'offset', 'sort'] as const

/** 숫자만 있는 문자열을 범위 안의 정수로 읽는다. 값이 없으면 기본값, 형식이나 범위가 틀리면 null */
export function readIntParam(raw: string | null, fallback: number, min: number, max: number): number | null {
  if (raw === null) return fallback
  if (!/^\d+$/.test(raw)) return null
  const value = Number(raw)
  return value >= min && value <= max ? value : null
}

export type ParsedPlacesQuery = { mode: 'summary' } | { mode: 'list'; query: PlaceListQuery }

export function parsePlacesQuery(params: URLSearchParams): ParsedPlacesQuery | null {
  const category = params.get('category')
  if (category === null) {
    return LIST_ONLY_KEYS.some((key) => params.has(key)) ? null : { mode: 'summary' }
  }
  if (!CATEGORY_RE.test(category)) return null

  const limit = readIntParam(params.get('limit'), PLACES_DEFAULT_LIMIT, 1, PLACES_MAX_LIMIT)
  const offset = readIntParam(params.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER)
  if (limit === null || offset === null) return null

  const sortRaw = params.get('sort') ?? 'drops'
  if (sortRaw !== 'drops' && sortRaw !== 'name') return null
  const sort: PlaceSort = sortRaw

  const q = (params.get('q') ?? '').trim()
  if (q.length > PLACES_Q_MAX_LENGTH) return null

  return { mode: 'list', query: { category, q, limit, offset, sort } }
}
