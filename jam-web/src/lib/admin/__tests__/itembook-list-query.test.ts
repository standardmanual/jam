import {
  applyItemBookListFilters,
  applyItemBookListSort,
  parseItemBookListParams,
  type ItemBookListQuery,
} from '../itembook-list-query'

const NOW = '2026-09-24T03:00:00.000Z'

/** 호출된 조건을 순서대로 기록하는 스텁 — 실제 쿼리 빌더 대신 "어떤 조건이 걸렸는가"만 본다 */
function recordingQuery() {
  const calls: string[] = []
  const query: ItemBookListQuery<unknown> = {
    eq: (column, value) => {
      calls.push(`eq ${column}=${String(value)}`)
      return query
    },
    ilike: (column, pattern) => {
      calls.push(`ilike ${column} ${pattern}`)
      return query
    },
    or: (filters) => {
      calls.push(`or ${filters}`)
      return query
    },
    order: (column, options) => {
      calls.push(`order ${column} ${options?.ascending === false ? 'desc' : 'asc'}`)
      return query
    },
    range: async () => ({ data: [], count: 0, error: null }),
  }
  return { query, calls }
}

function conditionsOf(rawStatus: string | undefined) {
  const { query, calls } = recordingQuery()
  applyItemBookListFilters(query, parseItemBookListParams({ status: rawStatus }), NOW)
  return calls
}

describe('parseItemBookListParams', () => {
  it('빈 파라미터는 상태 전체·최근 등록순이다(기존 화면과 같은 기본 동작)', () => {
    expect(parseItemBookListParams({})).toEqual({ q: '', tribe: undefined, status: 'all', sort: 'created_desc' })
  })

  it('알 수 없는 상태·정렬 값은 기본값으로 떨어진다', () => {
    const parsed = parseItemBookListParams({ status: 'archived', sort: 'weird' })
    expect(parsed.status).toBe('all')
    expect(parsed.sort).toBe('created_desc')
  })

  it("트라이브 'all'은 필터 없음으로 본다", () => {
    expect(parseItemBookListParams({ tribe: 'all' }).tribe).toBeUndefined()
    expect(parseItemBookListParams({ tribe: 't1' }).tribe).toBe('t1')
  })

  it('검색어는 sanitizeSearchTerm을 거친다(쉼표·괄호 제거)', () => {
    expect(parseItemBookListParams({ q: '성수,(카페)' }).q).toBe('성수  카페')
  })
})

describe('applyItemBookListFilters — 상태 필터 4종', () => {
  it('노출 중: 활성이면서 노출 기간 안(체커의 활성 컬렉션 조건과 같다)', () => {
    expect(conditionsOf('visible')).toEqual([
      'eq is_active=true',
      `or valid_from.is.null,valid_from.lte.${NOW}`,
      `or valid_until.is.null,valid_until.gte.${NOW}`,
    ])
  })

  it('기간 밖: 활성이지만 시작 전이거나 종료 후', () => {
    expect(conditionsOf('out_of_period')).toEqual([
      'eq is_active=true',
      `or valid_from.gt.${NOW},valid_until.lt.${NOW}`,
    ])
  })

  it('비활성: 활성 값이 꺼져 있는 것(기간과 무관)', () => {
    expect(conditionsOf('inactive')).toEqual(['eq is_active=false'])
  })

  it('전체: 상태 조건을 걸지 않는다', () => {
    expect(conditionsOf('all')).toEqual([])
    expect(conditionsOf(undefined)).toEqual([])
  })
})

describe('applyItemBookListFilters — 검색·트라이브', () => {
  it('이름 검색과 트라이브 필터가 상태 조건과 함께 걸린다', () => {
    const { query, calls } = recordingQuery()
    applyItemBookListFilters(query, parseItemBookListParams({ q: '서울', tribe: 't1', status: 'inactive' }), NOW)
    expect(calls).toEqual(['ilike name %서울%', 'eq tribe_id=t1', 'eq is_active=false'])
  })
})

describe('applyItemBookListSort', () => {
  it('정렬 4종은 id를 마지막 기준으로 함께 걸어 페이지 경계가 흔들리지 않게 한다', () => {
    const cases: [Parameters<typeof applyItemBookListSort>[1], string[]][] = [
      ['created_desc', ['order created_at desc', 'order id asc']],
      ['created_asc', ['order created_at asc', 'order id asc']],
      ['name_asc', ['order name asc', 'order id asc']],
      ['name_desc', ['order name desc', 'order id asc']],
    ]
    for (const [sort, expected] of cases) {
      const { query, calls } = recordingQuery()
      applyItemBookListSort(query, sort)
      expect(calls).toEqual(expected)
    }
  })
})
