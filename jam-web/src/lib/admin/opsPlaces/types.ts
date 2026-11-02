/**
 * 윤진이 장소를 읽는 API(`GET /api/admin/ops-places`)의 입력·출력 모양 (티켓 20261102_1602, 상위 20260930_1503).
 * 순수 타입이다. Supabase·서버 모듈을 가져오지 않는다.
 */

/** `poi_categories` 한 행에서 읽는 칸 */
export interface PlaceCategoryInput {
  slug: string
  label: string
}

/** `poi` 한 행에서 읽는 칸. 좌표·주소 칸은 읽지 않는다 */
export interface PlaceInput {
  id: string
  name: string
  category: string
  linked_badge_id: string | null
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
  placeCount: number
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
