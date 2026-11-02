/**
 * 장소 읽기 계산·쿼리 읽기 (티켓 20261102_1602)
 * - 카테고리 요약: 장소 수 합계는 poi 행 수와 같다(카테고리 표에 없는 값도 빠뜨리지 않는다), 체크인 배지 연결 수, 드랍·픽업 수
 * - 장소 목록: 카테고리 거르기, 이름 검색, 드랍 많은 순·이름 순, 동률은 이름·id 순
 * - 쿼리: 기본값, 범위, 목록 전용 키는 category 없이 400
 * - 티켓 20261102_2254: 상태 거름(기본 활성만, 비활성·검수 대기 수는 따로), 지역 거름·지역 집계, 목록 행의 sido·gu, status·sido·gu·groupBy 쿼리
 */
import { describe, it, expect } from 'vitest'
import { categoryExists, groupPlacesByRegion, listCategoryPlaces, stateOf, summarizeCategories } from '../compute'
import { parsePlacesQuery } from '../query'
import type { PlaceFilter, PlaceInput, PlaceInputs } from '../types'

function pl(
  id: string,
  name: string,
  category: string,
  linked: string | null,
  over: Partial<PlaceInput> = {}
): PlaceInput {
  return {
    id,
    name,
    category,
    linked_badge_id: linked,
    is_active: true,
    pending_review: false,
    sido: null,
    gu: null,
    ...over,
  }
}

const ALL: PlaceFilter = { status: 'all', sido: null, gu: null }

const INPUTS: PlaceInputs = {
  categories: [
    { slug: 'mountain', label: '산' },
    { slug: 'subway', label: '지하철역' },
    { slug: 'empty', label: '빈 카테고리' },
  ],
  places: [
    pl('p1', '북한산', 'mountain', 'b1', { sido: '서울특별시', gu: '강북구' }),
    pl('p2', '관악산', 'mountain', 'b2', { sido: '서울특별시', gu: '관악구' }),
    pl('p3', '이름 없는 언덕', 'mountain', null, { sido: '경기도', gu: '성남시' }),
    pl('p4', '강남역', 'subway', 'b4', { sido: '서울특별시', gu: '강남구' }),
    pl('p5', '표에 없는 곳', 'ghost', null),
    pl('p6', '닫힌 산', 'mountain', null, { is_active: false, sido: '서울특별시', gu: '관악구' }),
    pl('p7', '검수 대기 산', 'mountain', null, { pending_review: true, is_active: false, sido: '경기도', gu: '성남시' }),
    pl('p8', '닫힌 역', 'subway', null, { is_active: false }),
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
  it('status=all의 장소 수 합계가 poi 행 수와 같다 — 카테고리 표에 없는 값도 슬러그 이름으로 싣는다', () => {
    const summary = summarizeCategories(INPUTS, ALL)
    expect(summary.reduce((sum, c) => sum + c.placeCount, 0)).toBe(INPUTS.places.length)
    expect(summary.find((c) => c.slug === 'ghost')).toMatchObject({ label: 'ghost', placeCount: 1 })
  })

  it('체크인 배지 연결 수·드랍 수·픽업 수를 카테고리별로 센다', () => {
    const byslug = Object.fromEntries(summarizeCategories(INPUTS).map((c) => [c.slug, c]))
    expect(byslug.mountain).toEqual({
      slug: 'mountain',
      label: '산',
      placeCount: 3,
      inactiveCount: 1,
      pendingReviewCount: 1,
      checkinBadgeCount: 2,
      dropCount: 5,
      pickupCount: 1,
    })
    expect(byslug.subway).toMatchObject({
      placeCount: 1,
      inactiveCount: 1,
      pendingReviewCount: 0,
      checkinBadgeCount: 1,
      dropCount: 1,
      pickupCount: 1,
    })
  })

  it('기본은 활성·검수 통과 장소만 센다 — 비활성·검수 대기는 따로 싣는다', () => {
    const summary = summarizeCategories(INPUTS)
    expect(summary.reduce((sum, c) => sum + c.placeCount, 0)).toBe(5)
    expect(summary.reduce((sum, c) => sum + c.inactiveCount, 0)).toBe(2)
    expect(summary.reduce((sum, c) => sum + c.pendingReviewCount, 0)).toBe(1)
  })

  it('활성+비활성+검수 대기 = 전체 행 수 (상태는 겹치지 않는다)', () => {
    expect(INPUTS.places.map(stateOf).sort()).toEqual([
      'active', 'active', 'active', 'active', 'active', 'inactive', 'inactive', 'pending',
    ])
    expect(stateOf(pl('x', 'x', 'c', null, { pending_review: true, is_active: true }))).toBe('pending')
  })

  it('status=inactive·pending은 그 상태만 센다', () => {
    const inactive = summarizeCategories(INPUTS, { status: 'inactive', sido: null, gu: null })
    expect(inactive.reduce((sum, c) => sum + c.placeCount, 0)).toBe(2)
    const pending = summarizeCategories(INPUTS, { status: 'pending', sido: null, gu: null })
    expect(pending.reduce((sum, c) => sum + c.placeCount, 0)).toBe(1)
  })

  it('지역 거름은 장소 수와 비활성·검수 대기 수에 모두 적용된다', () => {
    const summary = summarizeCategories(INPUTS, { status: 'active', sido: '서울특별시', gu: null })
    const mountain = summary.find((c) => c.slug === 'mountain')
    expect(mountain).toMatchObject({ placeCount: 2, inactiveCount: 1, pendingReviewCount: 0 })
    expect(summary.find((c) => c.slug === 'subway')).toMatchObject({ placeCount: 1, inactiveCount: 0 })
    const gu = summarizeCategories(INPUTS, { status: 'active', sido: '서울특별시', gu: '관악구' })
    expect(gu.find((c) => c.slug === 'mountain')).toMatchObject({ placeCount: 1, inactiveCount: 1 })
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
      sido: '서울특별시',
      gu: '관악구',
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

  it('좌표·주소·동·유저 칸을 싣지 않는다', () => {
    const keys = Object.keys(listCategoryPlaces(INPUTS, base)[0]).sort()
    expect(keys).toEqual(['category', 'dropCount', 'gu', 'hasCheckinBadge', 'id', 'name', 'pickupCount', 'sido'])
  })

  it('기본은 활성만, status=all은 비활성·검수 대기까지, 지역으로 거를 수 있다', () => {
    expect(listCategoryPlaces(INPUTS, base).map((p) => p.id)).toEqual(['p2', 'p1', 'p3'])
    expect(listCategoryPlaces(INPUTS, base, ALL)).toHaveLength(5)
    const seoul = listCategoryPlaces(INPUTS, base, { status: 'all', sido: '서울특별시', gu: null })
    expect(seoul.map((p) => p.id).sort()).toEqual(['p1', 'p2', 'p6'])
    expect(listCategoryPlaces(INPUTS, base, { status: 'active', sido: '경기도', gu: '성남시' }).map((p) => p.id)).toEqual(['p3'])
  })

  it('지역을 채우기 전인 장소는 sido·gu가 null이다', () => {
    const subway = listCategoryPlaces(INPUTS, { ...base, category: 'ghost' })
    expect(subway[0]).toMatchObject({ sido: null, gu: null })
  })
})

describe('groupPlacesByRegion', () => {
  const active: PlaceFilter = { status: 'active', sido: null, gu: null }

  it('시·도, 시·군·구별로 장소·체크인 배지·드랍·픽업 수를 센다. 지역을 모르는 장소는 null 줄로 모은다', () => {
    const groups = groupPlacesByRegion(INPUTS, active, null)
    expect(groups.find((g) => g.gu === '관악구')).toEqual({
      sido: '서울특별시',
      gu: '관악구',
      placeCount: 1,
      checkinBadgeCount: 1,
      dropCount: 3,
      pickupCount: 0,
    })
    expect(groups.find((g) => g.sido === null)).toMatchObject({ gu: null, placeCount: 1 })
    expect(groups.reduce((sum, g) => sum + g.placeCount, 0)).toBe(5)
  })

  it('category를 주면 그 카테고리만 센다', () => {
    const groups = groupPlacesByRegion(INPUTS, active, 'subway')
    expect(groups).toEqual([
      { sido: '서울특별시', gu: '강남구', placeCount: 1, checkinBadgeCount: 1, dropCount: 1, pickupCount: 1 },
    ])
  })

  it('상태·지역 거름을 따르고 장소 많은 순으로 정렬한다', () => {
    const all = groupPlacesByRegion(INPUTS, ALL, 'mountain')
    // 두 줄이 2곳으로 같으면 시·도, 시·군·구 이름 순이다
    expect(all.slice(0, 2).map((g) => `${g.sido} ${g.gu} ${g.placeCount}`)).toEqual(['경기도 성남시 2', '서울특별시 관악구 2'])
    expect(all.reduce((sum, g) => sum + g.placeCount, 0)).toBe(5)
    expect(groupPlacesByRegion(INPUTS, { status: 'active', sido: '경기도', gu: null }, null)).toHaveLength(1)
  })

  it('좌표·주소·동 칸이 없다', () => {
    expect(Object.keys(groupPlacesByRegion(INPUTS, active, null)[0]).sort()).toEqual([
      'checkinBadgeCount', 'dropCount', 'gu', 'pickupCount', 'placeCount', 'sido',
    ])
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

  const defaultFilter = { status: 'active', sido: null, gu: null }

  it('쿼리가 없으면 활성만 보는 요약이다', () => {
    expect(parse('')).toEqual({ mode: 'summary', filter: defaultFilter })
  })

  it('status·sido·gu는 모든 모드가 받는다 (sido·gu는 앞뒤 공백을 지운다)', () => {
    const filter = { status: 'all', sido: '서울특별시', gu: '강남구' }
    const q = `status=all&sido=${encodeURIComponent(' 서울특별시 ')}&gu=${encodeURIComponent('강남구')}`
    expect(parse(q)).toEqual({ mode: 'summary', filter })
    expect(parse(`category=subway&${q}`)).toMatchObject({ mode: 'list', filter })
    expect(parse(`groupBy=region&${q}`)).toEqual({ mode: 'region', category: null, filter })
  })

  it('groupBy=region은 category를 함께 받는다', () => {
    expect(parse('groupBy=region&category=mountain')).toEqual({
      mode: 'region',
      category: 'mountain',
      filter: defaultFilter,
    })
  })

  it('category가 있으면 기본값(limit 30, offset 0, sort drops)으로 목록이다', () => {
    expect(parse('category=mountain&limit=5')).toEqual({
      mode: 'list',
      query: { category: 'mountain', q: '', limit: 5, offset: 0, sort: 'drops' },
      filter: defaultFilter,
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
    'status=deleted',
    'status=',
    'sido=',
    'gu=%20',
    `sido=${'가'.repeat(101)}`,
    'groupBy=gu',
    'groupBy=region&limit=5',
    'groupBy=region&sort=name',
    'groupBy=region&category=Mountain',
  ])('잘못된 쿼리 %s는 null(400)이다', (query) => {
    expect(parse(query)).toBeNull()
  })
})
