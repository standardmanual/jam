import {
  parsePoiReviewListParams,
  applyPoiReviewListQuery,
  collectPendingNaverCategories,
  type PoiReviewQuery,
  type NaverCategoryQueryClient,
} from '../poi-review-list'

interface RecordedCall {
  method: string
  args: unknown[]
}

/** 기록형 스텁 — 실제 필터 호출이 나갔는지만 기록한다(`poi-list-query.test.ts`와 같은 방식). */
function createStubQuery<T>() {
  const calls: RecordedCall[] = []
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args })
      return query
    }
  const query: PoiReviewQuery<T> = {
    ilike: record('ilike'),
    eq: record('eq'),
    in: record('in'),
    gte: record('gte'),
    lte: record('lte'),
    order: record('order'),
    range: async () => ({ data: [], count: 0, error: null }),
  }
  return { query, calls }
}

describe('parsePoiReviewListParams', () => {
  it('빈 파라미터는 전부 기본값이다', () => {
    expect(parsePoiReviewListParams({})).toEqual({
      q: '',
      category: 'all',
      naverCategories: [],
      from: '',
      to: '',
      sort: 'created_desc',
    })
  })

  it('알려진 값은 그대로 타입이 있는 값으로 좁혀진다', () => {
    expect(
      parsePoiReviewListParams({
        q: ' 공원 ',
        category: 'park',
        naver_category: '스포츠,레저>공원|여행>명소',
        from: '2026-09-01',
        to: '2026-09-24',
        sort: 'name_asc',
      })
    ).toEqual({
      q: '공원',
      category: 'park',
      naverCategories: ['스포츠,레저>공원', '여행>명소'],
      from: '2026-09-01',
      to: '2026-09-24',
      sort: 'name_asc',
    })
  })

  it('검색어의 PostgREST 예약 문자를 정제한다', () => {
    expect(parsePoiReviewListParams({ q: 'a,b(c)' }).q).toBe('a b c')
  })

  it('알 수 없는 정렬·형식이 다른 날짜는 기본값으로 떨어진다', () => {
    const parsed = parsePoiReviewListParams({ sort: 'bogus', from: '9/1', to: '2026-13' })
    expect(parsed.sort).toBe('created_desc')
    expect(parsed.from).toBe('')
    expect(parsed.to).toBe('')
  })

  it('네이버 원본 분류의 중복·빈 값은 제거한다', () => {
    expect(parsePoiReviewListParams({ naver_category: '가||가| 나 ' }).naverCategories).toEqual(['가', '나'])
  })
})

describe('applyPoiReviewListQuery', () => {
  it('필터가 없어도 검토 대기 조건과 수집일 최신순 + id 보조 정렬이 걸린다', () => {
    const { query, calls } = createStubQuery<unknown>()
    applyPoiReviewListQuery(query, parsePoiReviewListParams({}))
    expect(calls).toEqual([
      { method: 'eq', args: ['pending_review', true] },
      { method: 'order', args: ['created_at', { ascending: false }] },
      { method: 'order', args: ['id', { ascending: true }] },
    ])
  })

  it('이름·카테고리·네이버 분류·수집일 범위가 모두 걸린다', () => {
    const { query, calls } = createStubQuery<unknown>()
    applyPoiReviewListQuery(
      query,
      parsePoiReviewListParams({
        q: '공원',
        category: 'park',
        naver_category: '가|나',
        from: '2026-09-01',
        to: '2026-09-24',
        sort: 'name_desc',
      })
    )
    expect(calls).toEqual([
      { method: 'eq', args: ['pending_review', true] },
      { method: 'ilike', args: ['name', '%공원%'] },
      { method: 'eq', args: ['category', 'park'] },
      { method: 'in', args: ['naver_category', ['가', '나']] },
      { method: 'gte', args: ['created_at', '2026-09-01T00:00:00'] },
      { method: 'lte', args: ['created_at', '2026-09-24T23:59:59'] },
      { method: 'order', args: ['name', { ascending: false }] },
      { method: 'order', args: ['id', { ascending: true }] },
    ])
  })
})

describe('collectPendingNaverCategories', () => {
  function createClient(pages: { naver_category: string | null }[][]): {
    client: NaverCategoryQueryClient
    ranges: [number, number][]
  } {
    const ranges: [number, number][] = []
    let call = 0
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              range: async (from: number, to: number) => {
                ranges.push([from, to])
                return { data: pages[call++] ?? [], error: null }
              },
            }),
          }),
        }),
      }),
    } as unknown as NaverCategoryQueryClient
    return { client, ranges }
  }

  it('한 페이지가 상한(1,000행)이면 다음 페이지까지 끝까지 읽는다', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({ naver_category: i === 0 ? '나' : '가' }))
    const { client, ranges } = createClient([full, [{ naver_category: '다' }, { naver_category: null }]])

    expect(await collectPendingNaverCategories(client)).toEqual(['가', '나', '다'])
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('빈 값은 선택지에서 뺀다', async () => {
    const { client } = createClient([[{ naver_category: '' }, { naver_category: '  ' }, { naver_category: null }]])
    expect(await collectPendingNaverCategories(client)).toEqual([])
  })
})
