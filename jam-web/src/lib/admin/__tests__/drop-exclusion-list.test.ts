import {
  parseExclusionTab,
  parseDropExclusionParams,
  applyBadgeExclusionQuery,
  applyCollectionExclusionQuery,
  resolveBadgeCollectionScope,
  collectionOptionsForTribe,
  splitExclusionResult,
  type ExclusionQuery,
  type TribeCollectionsClient,
} from '../drop-exclusion-list'

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
  const query: ExclusionQuery<T> = {
    ilike: record('ilike'),
    eq: record('eq'),
    in: record('in'),
    is: record('is'),
    not: record('not'),
    order: record('order'),
    range: async () => ({ data: [], count: 0, error: null }),
  }
  return { query, calls }
}

describe('parseExclusionTab', () => {
  it('collections만 컬렉션 탭이고 나머지는 아이템배지 탭이다', () => {
    expect(parseExclusionTab('collections')).toBe('collections')
    expect(parseExclusionTab('badges')).toBe('badges')
    expect(parseExclusionTab(undefined)).toBe('badges')
    expect(parseExclusionTab('bogus')).toBe('badges')
  })
})

describe('parseDropExclusionParams', () => {
  it('빈 파라미터는 아이템배지 탭·이름순·전체 상태다', () => {
    expect(parseDropExclusionParams({})).toEqual({
      tab: 'badges',
      q: '',
      tribeId: null,
      itemBookId: null,
      status: 'all',
      sort: 'name_asc',
    })
  })

  it('알려진 값은 그대로 좁혀진다', () => {
    expect(
      parseDropExclusionParams({
        tab: 'badges',
        q: ' 산 ',
        tribe_id: 't1',
        item_book_id: 'b1',
        status: 'excluded',
        sort: 'rarity_desc',
      })
    ).toEqual({ tab: 'badges', q: '산', tribeId: 't1', itemBookId: 'b1', status: 'excluded', sort: 'rarity_desc' })
  })

  it('컬렉션 탭은 컬렉션 필터를 무시하고 등급 정렬을 기본 정렬로 되돌린다', () => {
    const parsed = parseDropExclusionParams({ tab: 'collections', item_book_id: 'b1', sort: 'rarity_asc' })
    expect(parsed.itemBookId).toBeNull()
    expect(parsed.sort).toBe('name_asc')
  })

  it('알 수 없는 상태는 전체로 떨어지고 검색어는 정제된다', () => {
    const parsed = parseDropExclusionParams({ status: 'bogus', q: 'a,b(c)' })
    expect(parsed.status).toBe('all')
    expect(parsed.q).toBe('a b c')
  })
})

describe('applyBadgeExclusionQuery', () => {
  it('필터가 없으면 컬렉션에 속한 삭제되지 않은 아이템배지 전체를 이름순으로 본다', () => {
    const { query, calls } = createStubQuery<unknown>()
    applyBadgeExclusionQuery(query, parseDropExclusionParams({}), { kind: 'all' })
    expect(calls).toEqual([
      { method: 'eq', args: ['type', 'item'] },
      { method: 'is', args: ['deleted_at', null] },
      { method: 'not', args: ['item_book_id', 'is', null] },
      { method: 'order', args: ['name', { ascending: true }] },
      { method: 'order', args: ['id', { ascending: true }] },
    ])
  })

  it('컬렉션 범위·이름 검색·상태·등급 정렬이 모두 걸린다', () => {
    const { query, calls } = createStubQuery<unknown>()
    applyBadgeExclusionQuery(
      query,
      parseDropExclusionParams({ q: '산', status: 'included', sort: 'rarity_desc' }),
      { kind: 'collections', ids: ['b1', 'b2'] }
    )
    expect(calls).toEqual([
      { method: 'eq', args: ['type', 'item'] },
      { method: 'is', args: ['deleted_at', null] },
      { method: 'in', args: ['item_book_id', ['b1', 'b2']] },
      { method: 'ilike', args: ['name', '%산%'] },
      { method: 'eq', args: ['drop_excluded', false] },
      { method: 'order', args: ['rarity', { ascending: false }] },
      { method: 'order', args: ['id', { ascending: true }] },
    ])
  })

  it('제외됨 상태는 drop_excluded = true로 거른다', () => {
    const { query, calls } = createStubQuery<unknown>()
    applyBadgeExclusionQuery(query, parseDropExclusionParams({ status: 'excluded' }), { kind: 'all' })
    expect(calls).toContainEqual({ method: 'eq', args: ['drop_excluded', true] })
  })
})

describe('applyCollectionExclusionQuery', () => {
  it('필터가 없으면 이름순 정렬만 걸린다', () => {
    const { query, calls } = createStubQuery<unknown>()
    applyCollectionExclusionQuery(query, parseDropExclusionParams({ tab: 'collections' }))
    expect(calls).toEqual([
      { method: 'order', args: ['name', { ascending: true }] },
      { method: 'order', args: ['id', { ascending: true }] },
    ])
  })

  it('트라이브·이름 검색·상태·정렬이 모두 걸린다', () => {
    const { query, calls } = createStubQuery<unknown>()
    applyCollectionExclusionQuery(
      query,
      parseDropExclusionParams({ tab: 'collections', tribe_id: 't1', q: '산', status: 'excluded', sort: 'name_desc' })
    )
    expect(calls).toEqual([
      { method: 'eq', args: ['tribe_id', 't1'] },
      { method: 'ilike', args: ['name', '%산%'] },
      { method: 'eq', args: ['drop_excluded', true] },
      { method: 'order', args: ['name', { ascending: false }] },
      { method: 'order', args: ['id', { ascending: true }] },
    ])
  })
})

describe('resolveBadgeCollectionScope', () => {
  function createClient(rows: { id: string }[]) {
    const eqCalls: unknown[][] = []
    const client = {
      from: () => ({
        select: () => ({
          eq: async (...args: unknown[]) => {
            eqCalls.push(args)
            return { data: rows, error: null }
          },
        }),
      }),
    } as unknown as TribeCollectionsClient
    return { client, eqCalls }
  }

  it('컬렉션을 골랐으면 그 컬렉션 하나다(조회 없음)', async () => {
    const { client, eqCalls } = createClient([])
    const scope = await resolveBadgeCollectionScope(client, parseDropExclusionParams({ item_book_id: 'b1', tribe_id: 't1' }))
    expect(scope).toEqual({ kind: 'collections', ids: ['b1'] })
    expect(eqCalls).toEqual([])
  })

  it('트라이브만 골랐으면 그 트라이브의 컬렉션들이다', async () => {
    const { client, eqCalls } = createClient([{ id: 'b1' }, { id: 'b2' }])
    const scope = await resolveBadgeCollectionScope(client, parseDropExclusionParams({ tribe_id: 't1' }))
    expect(scope).toEqual({ kind: 'collections', ids: ['b1', 'b2'] })
    expect(eqCalls).toEqual([['tribe_id', 't1']])
  })

  it('아무것도 안 골랐으면 전체다', async () => {
    const { client } = createClient([])
    expect(await resolveBadgeCollectionScope(client, parseDropExclusionParams({}))).toEqual({ kind: 'all' })
  })
})

describe('collectionOptionsForTribe', () => {
  const books = [
    { id: 'a', tribe_id: 't1' },
    { id: 'b', tribe_id: 't2' },
    { id: 'c', tribe_id: null },
  ]

  it('트라이브를 고르면 그 트라이브의 컬렉션만 남긴다', () => {
    expect(collectionOptionsForTribe(books, 't1')).toEqual([{ id: 'a', tribe_id: 't1' }])
  })

  it('트라이브를 안 고르면 전체다', () => {
    expect(collectionOptionsForTribe(books, null)).toEqual(books)
  })
})

describe('splitExclusionResult', () => {
  it('갱신된 id는 처리, 대상 밖은 사유와 함께, 찾지 못한 대상은 "대상을 찾을 수 없음"으로 건너뛴다', () => {
    expect(splitExclusionResult(['a', 'b', 'c'], ['a', 'b'], ['a'], '아이템배지가 아닙니다')).toEqual({
      processed: ['a'],
      skipped: [
        { id: 'b', reason: '대상을 찾을 수 없음' },
        { id: 'c', reason: '아이템배지가 아닙니다' },
      ],
    })
  })
})
