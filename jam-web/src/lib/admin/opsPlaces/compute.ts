/**
 * 장소 읽기 API의 계산 — 카테고리 요약과 카테고리별 장소 목록 (티켓 20261102_1602). 순수 함수다.
 *
 * - 거름(`PlaceFilter`)은 상태(기본 활성·검수 통과만)와 지역(정확히 일치)이다. 기본 거름에서 장소 수 합계는 활성 장소 수이고,
 *   `status=all`이면 읽은 `poi` 행 수와 같다. 비활성·검수 대기 수는 상태 거름과 상관없이 따로 센다(지역 거름은 따른다).
 * - 장소 수 합계는 거른 `poi` 행 수와 같다. 카테고리 표(`poi_categories`)에 없는 카테고리 값을 가진 장소도 빠뜨리지 않고
 *   슬러그를 이름으로 삼아 한 줄로 싣는다(합계가 DB 행 수와 어긋나지 않게).
 * - 「드랍 수」는 그 장소에 놓인 `poi_drops` 행 전체(주워진 것 포함), 「픽업 수」는 그중 `picked_up_at`이 있는 행이다.
 * - 장소 좌표·주소·유저 칸은 입력에 없다. 지역은 `sido`·`gu`(시·도, 시·군·구)만 싣고 읍·면·동(`dong`)은 저장하지 않는다.
 * (티켓 20261102_2254)
 */
import { DEFAULT_PLACE_FILTER } from './query'
import type {
  PlaceCategorySummary,
  PlaceDropInput,
  PlaceEntry,
  PlaceFilter,
  PlaceInput,
  PlaceInputs,
  PlaceListQuery,
  PlaceRegionGroup,
  PlaceState,
} from './types'

interface DropCount {
  drops: number
  pickups: number
}

function countDropsByPlace(drops: readonly PlaceDropInput[]): Map<string, DropCount> {
  const byPlace = new Map<string, DropCount>()
  for (const drop of drops) {
    const entry = byPlace.get(drop.poi_id) ?? { drops: 0, pickups: 0 }
    entry.drops += 1
    if (drop.picked_up_at !== null) entry.pickups += 1
    byPlace.set(drop.poi_id, entry)
  }
  return byPlace
}

/** 카테고리 슬러그 → 표시 이름. 표에 없는 슬러그는 슬러그 그대로 쓴다 */
function labelOf(inputs: PlaceInputs): (slug: string) => string {
  const labels = new Map(inputs.categories.map((category) => [category.slug, category.label]))
  return (slug) => labels.get(slug) ?? slug
}

/** 상태 구분: 검수 대기가 먼저, 그다음 비활성, 나머지가 활성. 셋은 겹치지 않는다 */
export function stateOf(place: PlaceInput): PlaceState {
  if (place.pending_review) return 'pending'
  return place.is_active ? 'active' : 'inactive'
}

function matchesRegion(place: PlaceInput, filter: PlaceFilter): boolean {
  return (filter.sido === null || place.sido === filter.sido) && (filter.gu === null || place.gu === filter.gu)
}

/** 지역 거름만 적용한 장소(상태 구분 수를 셀 때 쓴다) */
function inRegion(places: readonly PlaceInput[], filter: PlaceFilter): PlaceInput[] {
  return places.filter((place) => matchesRegion(place, filter))
}

/** 상태·지역 거름을 모두 적용한 장소 */
export function filterPlaces(places: readonly PlaceInput[], filter: PlaceFilter): PlaceInput[] {
  return inRegion(places, filter).filter((place) => filter.status === 'all' || stateOf(place) === filter.status)
}

export function summarizeCategories(
  inputs: PlaceInputs,
  filter: PlaceFilter = DEFAULT_PLACE_FILTER
): PlaceCategorySummary[] {
  const dropsByPlace = countDropsByPlace(inputs.drops)
  const label = labelOf(inputs)
  const bySlug = new Map<string, PlaceCategorySummary>()
  const ensure = (slug: string): PlaceCategorySummary => {
    let summary = bySlug.get(slug)
    if (!summary) {
      summary = {
        slug,
        label: label(slug),
        placeCount: 0,
        inactiveCount: 0,
        pendingReviewCount: 0,
        checkinBadgeCount: 0,
        dropCount: 0,
        pickupCount: 0,
      }
      bySlug.set(slug, summary)
    }
    return summary
  }

  for (const category of inputs.categories) ensure(category.slug)
  // 비활성·검수 대기 수는 상태 거름과 상관없이 센다
  for (const place of inRegion(inputs.places, filter)) {
    const state = stateOf(place)
    if (state === 'inactive') ensure(place.category).inactiveCount += 1
    else if (state === 'pending') ensure(place.category).pendingReviewCount += 1
  }
  for (const place of filterPlaces(inputs.places, filter)) {
    const summary = ensure(place.category)
    summary.placeCount += 1
    if (place.linked_badge_id !== null) summary.checkinBadgeCount += 1
    const counted = dropsByPlace.get(place.id)
    if (counted) {
      summary.dropCount += counted.drops
      summary.pickupCount += counted.pickups
    }
  }

  return [...bySlug.values()].sort((a, b) => b.placeCount - a.placeCount || a.slug.localeCompare(b.slug))
}

/** 카테고리 하나의 장소를 이름 검색·정렬한 전체 목록(쪽 나누기 전) */
export function listCategoryPlaces(
  inputs: PlaceInputs,
  query: PlaceListQuery,
  filter: PlaceFilter = DEFAULT_PLACE_FILTER
): PlaceEntry[] {
  const dropsByPlace = countDropsByPlace(inputs.drops)
  const needle = query.q.toLowerCase()
  const entries = filterPlaces(inputs.places, filter)
    .filter((place) => place.category === query.category)
    .filter((place) => needle === '' || place.name.toLowerCase().includes(needle))
    .map((place): PlaceEntry => {
      const counted = dropsByPlace.get(place.id)
      return {
        id: place.id,
        name: place.name,
        category: place.category,
        sido: place.sido,
        gu: place.gu,
        hasCheckinBadge: place.linked_badge_id !== null,
        dropCount: counted?.drops ?? 0,
        pickupCount: counted?.pickups ?? 0,
      }
    })

  return entries.sort((a, b) => {
    if (query.sort === 'drops' && a.dropCount !== b.dropCount) return b.dropCount - a.dropCount
    return a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id)
  })
}

/** 지역(시·도, 시·군·구)별 집계. `category`를 주면 그 카테고리만 센다. 지역을 채우기 전인 장소는 sido·gu가 null인 줄로 모인다 */
export function groupPlacesByRegion(
  inputs: PlaceInputs,
  filter: PlaceFilter,
  category: string | null
): PlaceRegionGroup[] {
  const dropsByPlace = countDropsByPlace(inputs.drops)
  const groups = new Map<string, PlaceRegionGroup>()
  for (const place of filterPlaces(inputs.places, filter)) {
    if (category !== null && place.category !== category) continue
    const key = JSON.stringify([place.sido, place.gu])
    let group = groups.get(key)
    if (!group) {
      group = { sido: place.sido, gu: place.gu, placeCount: 0, checkinBadgeCount: 0, dropCount: 0, pickupCount: 0 }
      groups.set(key, group)
    }
    group.placeCount += 1
    if (place.linked_badge_id !== null) group.checkinBadgeCount += 1
    const counted = dropsByPlace.get(place.id)
    if (counted) {
      group.dropCount += counted.drops
      group.pickupCount += counted.pickups
    }
  }
  const text = (value: string | null) => value ?? ''
  return [...groups.values()].sort(
    (a, b) =>
      b.placeCount - a.placeCount ||
      text(a.sido).localeCompare(text(b.sido), 'ko') ||
      text(a.gu).localeCompare(text(b.gu), 'ko')
  )
}

/** 카테고리 슬러그가 카테고리 표 또는 장소 어느 쪽에든 있는가 */
export function categoryExists(inputs: PlaceInputs, slug: string): boolean {
  return inputs.categories.some((c) => c.slug === slug) || inputs.places.some((p) => p.category === slug)
}

export function categoryLabel(inputs: PlaceInputs, slug: string): string {
  return labelOf(inputs)(slug)
}
