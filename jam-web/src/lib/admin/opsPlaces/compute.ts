/**
 * 장소 읽기 API의 계산 — 카테고리 요약과 카테고리별 장소 목록 (티켓 20261102_1602). 순수 함수다.
 *
 * - 장소 수 합계는 읽은 `poi` 행 수와 같다. 카테고리 표(`poi_categories`)에 없는 카테고리 값을 가진 장소도 빠뜨리지 않고
 *   슬러그를 이름으로 삼아 한 줄로 싣는다(합계가 DB 행 수와 어긋나지 않게).
 * - 「드랍 수」는 그 장소에 놓인 `poi_drops` 행 전체(주워진 것 포함), 「픽업 수」는 그중 `picked_up_at`이 있는 행이다.
 * - 장소 좌표·주소·유저 칸은 입력에 없다. 지역(시·구) 칸은 `poi`에 대응하는 칸이 없어 싣지 않는다.
 */
import type { PlaceCategorySummary, PlaceDropInput, PlaceEntry, PlaceInputs, PlaceListQuery } from './types'

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

export function summarizeCategories(inputs: PlaceInputs): PlaceCategorySummary[] {
  const dropsByPlace = countDropsByPlace(inputs.drops)
  const label = labelOf(inputs)
  const bySlug = new Map<string, PlaceCategorySummary>()
  const ensure = (slug: string): PlaceCategorySummary => {
    let summary = bySlug.get(slug)
    if (!summary) {
      summary = { slug, label: label(slug), placeCount: 0, checkinBadgeCount: 0, dropCount: 0, pickupCount: 0 }
      bySlug.set(slug, summary)
    }
    return summary
  }

  for (const category of inputs.categories) ensure(category.slug)
  for (const place of inputs.places) {
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
export function listCategoryPlaces(inputs: PlaceInputs, query: PlaceListQuery): PlaceEntry[] {
  const dropsByPlace = countDropsByPlace(inputs.drops)
  const needle = query.q.toLowerCase()
  const entries = inputs.places
    .filter((place) => place.category === query.category)
    .filter((place) => needle === '' || place.name.toLowerCase().includes(needle))
    .map((place): PlaceEntry => {
      const counted = dropsByPlace.get(place.id)
      return {
        id: place.id,
        name: place.name,
        category: place.category,
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

/** 카테고리 슬러그가 카테고리 표 또는 장소 어느 쪽에든 있는가 */
export function categoryExists(inputs: PlaceInputs, slug: string): boolean {
  return inputs.categories.some((c) => c.slug === slug) || inputs.places.some((p) => p.category === slug)
}

export function categoryLabel(inputs: PlaceInputs, slug: string): string {
  return labelOf(inputs)(slug)
}
