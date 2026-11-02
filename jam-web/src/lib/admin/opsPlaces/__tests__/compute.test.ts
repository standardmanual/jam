/**
 * 장소 읽기 계산·쿼리 읽기 (티켓 20261102_1602)
 * - 카테고리 요약: 장소 수 합계는 poi 행 수와 같다(카테고리 표에 없는 값도 빠뜨리지 않는다), 체크인 배지 연결 수, 드랍·픽업 수
 * - 장소 목록: 카테고리 거르기, 이름 검색, 드랍 많은 순·이름 순, 동률은 이름·id 순
 * - 쿼리: 기본값, 범위, 목록 전용 키는 category 없이 400
 */
import { describe, it, expect } from 'vitest'
import { categoryExists, listCategoryPlaces, summarizeCategories } from '../compute'
import { parsePlacesQuery } from '../query'
import type { PlaceInputs } from '../types'

const INPUTS: PlaceInputs = {
  categories: [
    { slug: 'mountain', label: '산' },
    { slug: 'subway', label: '지하철역' },
    { slug: 'empty', label: '빈 카테고리' },
  ],
  places: [
    { id: 'p1', name: '북한산', category: 'mountain', linked_badge_id: 'b1' },
    { id: 'p2', name: '관악산', category: 'mountain', linked_badge_id: 'b2' },
    { id: 'p3', name: '이름 없는 언덕', category: 'mountain', linked_badge_id: null },
    { id: 'p4', name: '강남역', category: 'subway', linked_badge_id: 'b4' },
    { id: 'p5', name: '표에 없는 곳', category: 'ghost', linked_badge_id: null },
  ],
  drops: [
    { poi_id: 'p1', picked_up_at: null },
    { poi_id: 'p1', picked_up_at: '2026-10-01T00:00:00Z' },
    { poi_id: 'p2', picked_up_at: null },
    { poi_id: 'p2', picked_up_at: null },
    { poi_id: 'p2', picked_up_at: null },
    { poi_id: 'p4', picked_up_at: '2026-10-02T00:00:00Z' },
  ],
}

describe('summarizeCategories', () => {
  it('장소 수 합계가 poi 행 수와 같다 — 카테고리 표에 없는 값도 슬러그 이름으로 싣는다', () => {
    const summary = summarizeCategories(INPUTS)
    expect(summary.reduce((sum, c) => sum + c.placeCount, 0)).toBe(INPUTS.places.length)
    expect(summary.find((c) => c.slug === 'ghost')).toMatchObject({ label: 'ghost', placeCount: 1 })
  })

  it('체크인 배지 연결 수·드랍 수·픽업 수를 카테고리별로 센다', () => {
    const byslug = Object.fromEntries(summarizeCategories(INPUTS).map((c) => [c.slug, c]))
    expect(byslug.mountain).toEqual({
      slug: 'mountain',
      label: '산',
      placeCount: 3,
      checkinBadgeCount: 2,
      dropCount: 5,
      pickupCount: 1,
    })
    expect(byslug.subway).toMatchObject({ placeCount: 1, checkinBadgeCount: 1, dropCount: 1, pickupCount: 1 })
  })

  it('장소가 없는 카테고리도 0으로 싣고, 장소 많은 순으로 정렬한다', () => {
    const summary = summarizeCategories(INPUTS)
    expect(summary.map((c) => c.slug)).toEqual(['mountain', 'ghost', 'subway', 'empty'])
    expect(summary.find((c) => c.slug === 'empty')).toMatchObject({ placeCount: 0, dropCount: 0 })
  })
})

describe('listCategoryPlaces', () => {
  const base = { category: 'mountain', q: '', limit: 30, offset: 0, sort: 'drops' as const }

  it('그 카테고리 장소만, 드랍 많은 순(동률은 이름 순)으로 싣는다', () => {
    const list = listCategoryPlaces(INPUTS, base)
    expect(list.map((p) => p.id)).toEqual(['p2', 'p1', 'p3'])
    expect(list[0]).toEqual({
      id: 'p2',
      name: '관악산',
      category: 'mountain',
      hasCheckinBadge: true,
      dropCount: 3,
      pickupCount: 0,
    })
    expect(list[2]).toMatchObject({ hasCheckinBadge: false, dropCount: 0, pickupCount: 0 })
  })

  it('sort=name은 이름 순이다', () => {
    expect(listCategoryPlaces(INPUTS, { ...base, sort: 'name' }).map((p) => p.name)).toEqual([
      '관악산',
      '북한산',
      '이름 없는 언덕',
    ])
  })

  it('q는 이름에 포함된 장소만 남긴다', () => {
    expect(listCategoryPlaces(INPUTS, { ...base, q: '한산' }).map((p) => p.id)).toEqual(['p1'])
    expect(listCategoryPlaces(INPUTS, { ...base, q: '없음없음' })).toEqual([])
  })

  it('좌표·주소·유저 칸을 싣지 않는다', () => {
    const keys = Object.keys(listCategoryPlaces(INPUTS, base)[0]).sort()
    expect(keys).toEqual(['category', 'dropCount', 'hasCheckinBadge', 'id', 'name', 'pickupCount'])
  })
})

describe('categoryExists', () => {
  it('카테고리 표 또는 장소에 있으면 true', () => {
    expect(categoryExists(INPUTS, 'empty')).toBe(true)
    expect(categoryExists(INPUTS, 'ghost')).toBe(true)
    expect(categoryExists(INPUTS, 'nope')).toBe(false)
  })
})

describe('parsePlacesQuery', () => {
  const parse = (query: string) => parsePlacesQuery(new URLSearchParams(query))

  it('쿼리가 없으면 요약이다', () => {
    expect(parse('')).toEqual({ mode: 'summary' })
  })

  it('category가 있으면 기본값(limit 30, offset 0, sort drops)으로 목록이다', () => {
    expect(parse('category=mountain&limit=5')).toEqual({
      mode: 'list',
      query: { category: 'mountain', q: '', limit: 5, offset: 0, sort: 'drops' },
    })
  })

  it.each([
    'category=Mountain',
    'category=산',
    'category=a-b',
    'category=mountain&limit=0',
    'category=mountain&limit=101',
    'category=mountain&limit=abc',
    'category=mountain&limit=1.5',
    'category=mountain&offset=-1',
    'category=mountain&sort=random',
    `category=mountain&q=${'가'.repeat(101)}`,
    'limit=5',
    'sort=name',
    'q=산',
    'offset=3',
  ])('잘못된 쿼리 %s는 null(400)이다', (query) => {
    expect(parse(query)).toBeNull()
  })
})
