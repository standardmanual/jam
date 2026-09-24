import { parsePoiListParams, applyPoiListQuery, type PoiListQuery } from '../poi-list-query'

interface RecordedCall {
  method: string
  args: unknown[]
}

/** 기록형 스텁 — `notifications/__tests__/batch-query.test.ts`와 같은 방식으로, 실제 필터
 *  호출이 나갔는지만 기록한다(값 자체를 거르지는 않는다). */
function createStubQuery<T>() {
  const calls: RecordedCall[] = []
  const query: PoiListQuery<T> = {
    ilike: (...args) => {
      calls.push({ method: 'ilike', args })
      return query
    },
    eq: (...args) => {
      calls.push({ method: 'eq', args })
      return query
    },
    not: (...args) => {
      calls.push({ method: 'not', args })
      return query
    },
    is: (...args) => {
      calls.push({ method: 'is', args })
      return query
    },
    order: (...args) => {
      calls.push({ method: 'order', args })
      return query
    },
    range: async () => ({ data: [], count: 0, error: null }),
  }
  return { query, calls }
}

describe('parsePoiListParams', () => {
  it('빈 파라미터는 전부 기본값(all/created_desc)이다', () => {
    expect(parsePoiListParams({})).toEqual({
      q: '',
      category: 'all',
      status: 'all',
      tier: 'all',
      linked: 'all',
      sort: 'created_desc',
    })
  })

  it('알려진 값은 그대로 타입이 있는 값으로 좁혀진다', () => {
    const parsed = parsePoiListParams({
      q: ' 카페 ',
      category: 'cafe',
      status: 'active',
      tier: '2',
      linked: 'yes',
      sort: 'name_asc',
    })
    expect(parsed).toEqual({
      q: '카페',
      category: 'cafe',
      status: 'active',
      tier: 2,
      linked: 'yes',
      sort: 'name_asc',
    })
  })

  it('알 수 없는 값은 all/기본 정렬로 떨어진다', () => {
    const parsed = parsePoiListParams({ status: 'archived', tier: '9', linked: 'maybe', sort: 'popular' })
    expect(parsed.status).toBe('all')
    expect(parsed.tier).toBe('all')
    expect(parsed.linked).toBe('all')
    expect(parsed.sort).toBe('created_desc')
  })

  it('검색어는 sanitizeSearchTerm을 거친다(쉼표·괄호 제거)', () => {
    expect(parsePoiListParams({ q: '카페,(성수)' }).q).toBe('카페  성수')
  })
})

describe('applyPoiListQuery', () => {
  const base = parsePoiListParams({})

  it('검색어가 있으면 name에 ilike를 건다', () => {
    const { query, calls } = createStubQuery()
    applyPoiListQuery(query, { ...base, q: '카페' })
    expect(calls).toContainEqual({ method: 'ilike', args: ['name', '%카페%'] })
  })

  it('검색어가 없으면 ilike를 걸지 않는다', () => {
    const { query, calls } = createStubQuery()
    applyPoiListQuery(query, base)
    expect(calls.some((c) => c.method === 'ilike')).toBe(false)
  })

  it('category가 all이 아니면 eq를 건다', () => {
    const { query, calls } = createStubQuery()
    applyPoiListQuery(query, { ...base, category: 'cafe' })
    expect(calls).toContainEqual({ method: 'eq', args: ['category', 'cafe'] })
  })

  it('status active/inactive는 is_active eq로 변환된다', () => {
    const active = createStubQuery()
    applyPoiListQuery(active.query, { ...base, status: 'active' })
    expect(active.calls).toContainEqual({ method: 'eq', args: ['is_active', true] })

    const inactive = createStubQuery()
    applyPoiListQuery(inactive.query, { ...base, status: 'inactive' })
    expect(inactive.calls).toContainEqual({ method: 'eq', args: ['is_active', false] })
  })

  it('tier가 1 또는 2면 poi_tier eq를 건다', () => {
    const { query, calls } = createStubQuery()
    applyPoiListQuery(query, { ...base, tier: 2 })
    expect(calls).toContainEqual({ method: 'eq', args: ['poi_tier', 2] })
  })

  it('linked=yes는 not(linked_badge_id, is, null), linked=no는 is(linked_badge_id, null)', () => {
    const yes = createStubQuery()
    applyPoiListQuery(yes.query, { ...base, linked: 'yes' })
    expect(yes.calls).toContainEqual({ method: 'not', args: ['linked_badge_id', 'is', null] })

    const no = createStubQuery()
    applyPoiListQuery(no.query, { ...base, linked: 'no' })
    expect(no.calls).toContainEqual({ method: 'is', args: ['linked_badge_id', null] })
  })

  it('정렬 컬럼 뒤에 id를 보조 정렬로 붙인다', () => {
    const { query, calls } = createStubQuery()
    applyPoiListQuery(query, { ...base, sort: 'name_desc' })
    const orderCalls = calls.filter((c) => c.method === 'order')
    expect(orderCalls).toEqual([
      { method: 'order', args: ['name', { ascending: false }] },
      { method: 'order', args: ['id', { ascending: true }] },
    ])
  })

  it('필터가 전혀 없으면 정렬 호출만 나간다', () => {
    const { query, calls } = createStubQuery()
    applyPoiListQuery(query, base)
    expect(calls.map((c) => c.method)).toEqual(['order', 'order'])
  })
})
