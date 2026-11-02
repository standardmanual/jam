/**
 * 윤진이 장소를 읽는 API(`GET /api/admin/ops-places`)의 입력·출력 모양 (티켓 20261102_1602, 상위 20260930_1503).
 * 순수 타입이다. Supabase·서버 모듈을 가져오지 않는다.
 */

/** `poi_categories` 한 행에서 읽는 칸 */
export interface PlaceCategoryInput {
  slug: string
  label: string
}

/** `poi` 한 행에서 읽는 칸. 좌표·주소 칸은 읽지 않는다. 지역(`sido`·`gu`)은 313 이후 칸이고 채우기 전에는 NULL이다 (티켓 20261102_2254) */
export interface PlaceInput {
  id: string
  name: string
  category: string
  linked_badge_id: string | null
  is_active: boolean
  pending_review: boolean
  sido: string | null
  gu: string | null
}

/**
 * 장소의 상태 구분. 서로 겹치지 않는다(합이 전체 행 수).
 * - `pending`: 검수 대기(`pending_review = true`) — `is_active` 값과 상관없다.
 * - `inactive`: 검수 대기가 아니면서 `is_active = false`.
 * - `active`: 검수 대기가 아니고 `is_active = true` — 체크인 가능한 장소.
 */
export type PlaceState = 'active' | 'inactive' | 'pending'

/** 쿼리 `status` 값. `all`은 세 상태를 모두 센다 */
export type PlaceStatusFilter = PlaceState | 'all'

/** 모든 모드가 받는 거름: 상태(기본 active)와 지역(정확히 일치, 없으면 null) */
export interface PlaceFilter {
  status: PlaceStatusFilter
  sido: string | null
  gu: string | null
}

/** `poi_drops` 한 행에서 읽는 칸. 드랍한 유저·주운 유저 칸은 읽지 않는다 */
export interface PlaceDropInput {
  poi_id: string
  picked_up_at: string | null
}

export interface PlaceInputs {
  categories: PlaceCategoryInput[]
  places: PlaceInput[]
  drops: PlaceDropInput[]
}

export interface PlaceCategorySummary {
  slug: string
  label: string
  /** 거름(`status`·`sido`·`gu`)에 맞는 장소 수. 기본은 활성·검수 통과 장소만 센다 */
  placeCount: number
  /** 이 카테고리의 비활성 장소 수(검수 대기 제외). `status` 거름과 상관없이 센다 */
  inactiveCount: number
  /** 이 카테고리의 검수 대기 장소 수. `status` 거름과 상관없이 센다 */
  pendingReviewCount: number
  /** 체크인 배지가 연결된 장소 수 */
  checkinBadgeCount: number
  /** 이 카테고리 장소에 놓인 드랍 수(주워진 것을 포함한 전체) */
  dropCount: number
  /** 그중 주워진(`picked_up_at`이 있는) 드랍 수 */
  pickupCount: number
}

export interface PlaceEntry {
  id: string
  name: string
  category: string
  /** 시·도. 채우기 전이면 null */
  sido: string | null
  /** 시·군·구. 채우기 전이면 null */
  gu: string | null
  hasCheckinBadge: boolean
  dropCount: number
  pickupCount: number
}

export type PlaceSort = 'drops' | 'name'

export interface PlaceListQuery {
  category: string
  q: string
  limit: number
  offset: number
  sort: PlaceSort
}

/** `groupBy=region` 한 줄. 지역을 채우기 전인 장소는 `sido`·`gu`가 null인 줄로 모인다 */
export interface PlaceRegionGroup {
  sido: string | null
  gu: string | null
  placeCount: number
  checkinBadgeCount: number
  dropCount: number
  pickupCount: number
}
