/**
 * `GET /api/admin/ops-badges` 쿼리 읽기 (티켓 20261102_1602). 형식이나 범위가 틀리면 `null`이고 라우트가 400으로 받아 읽지 않는다.
 */
import { readIntParam } from '@/lib/admin/opsPlaces/query'

export const BADGES_DEFAULT_LIMIT = 30
export const BADGES_MAX_LIMIT = 100
export const BADGES_FAMILY_MAX_LENGTH = 100
export const BADGES_QUERY_INVALID_MESSAGE =
  'family는 100자 이하, limit은 1부터 100까지, offset은 0 이상의 정수로 보내 주세요.'

export interface BadgesQuery {
  /** 계열 이름에 들어 있어야 하는 글자. 빈 문자열이면 거르지 않는다 */
  family: string
  limit: number
  offset: number
}

export function parseBadgesQuery(params: URLSearchParams): BadgesQuery | null {
  const limit = readIntParam(params.get('limit'), BADGES_DEFAULT_LIMIT, 1, BADGES_MAX_LIMIT)
  const offset = readIntParam(params.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER)
  if (limit === null || offset === null) return null
  const family = (params.get('family') ?? '').trim()
  if (family.length > BADGES_FAMILY_MAX_LENGTH) return null
  return { family, limit, offset }
}
