/**
 * 믹스 레시피 목록 조건·삭제 분류 회귀 (티켓 20260924_0949)
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/recipe-list.test.ts
 */
import { parseRecipeListParams, applyRecipeListQuery, type RecipeListQuery } from '../recipe-list'
import { classifyRecipeDeletion, recipeDeleteBlockedMessage, type RecipeDeletionCandidate } from '../recipe-bulk'

interface RecordedCall {
  method: string
  args: unknown[]
}

/** 기록형 스텁 — 실제 검색·정렬 호출이 나갔는지만 기록한다 */
function createStubQuery<T>() {
  const calls: RecordedCall[] = []
  const query: RecipeListQuery<T> = {
    ilike: (...args) => {
      calls.push({ method: 'ilike', args })
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

describe('parseRecipeListParams', () => {
  it('빈 파라미터는 검색 없음·최신순이다', () => {
    expect(parseRecipeListParams({})).toEqual({ q: '', sort: 'created_desc' })
  })

  it('알려진 정렬은 그대로, 알 수 없는 정렬은 최신순으로 떨어진다', () => {
    expect(parseRecipeListParams({ sort: 'name_asc' }).sort).toBe('name_asc')
    expect(parseRecipeListParams({ sort: 'created_asc' }).sort).toBe('created_asc')
    expect(parseRecipeListParams({ sort: 'popular' }).sort).toBe('created_desc')
  })

  it('검색어는 쉼표·괄호를 걷어낸다', () => {
    expect(parseRecipeListParams({ q: ' 믹스,(A) ' }).q).toBe('믹스  A')
  })
})

describe('applyRecipeListQuery', () => {
  it('검색어가 있으면 name에 ilike를 건다', () => {
    const { query, calls } = createStubQuery()
    applyRecipeListQuery(query, parseRecipeListParams({ q: '믹스' }))
    expect(calls).toContainEqual({ method: 'ilike', args: ['name', '%믹스%'] })
  })

  it('검색어가 없으면 ilike를 걸지 않는다', () => {
    const { query, calls } = createStubQuery()
    applyRecipeListQuery(query, parseRecipeListParams({}))
    expect(calls.some((c) => c.method === 'ilike')).toBe(false)
  })

  it.each([
    ['created_desc', 'created_at', false],
    ['created_asc', 'created_at', true],
    ['name_asc', 'name', true],
    ['name_desc', 'name', false],
  ])('정렬 %s는 %s 컬럼(오름차순=%s) 뒤에 id를 보조 정렬로 붙인다', (sort, column, ascending) => {
    const { query, calls } = createStubQuery()
    applyRecipeListQuery(query, parseRecipeListParams({ sort }))
    expect(calls.filter((c) => c.method === 'order')).toEqual([
      { method: 'order', args: [column, { ascending }] },
      { method: 'order', args: ['id', { ascending: true }] },
    ])
  })
})

describe('classifyRecipeDeletion — 참조로 막힌 레시피는 사유와 함께 건너뛴다', () => {
  const candidate = (overrides: Partial<RecipeDeletionCandidate> = {}): RecipeDeletionCandidate => ({
    id: 'r1',
    name: '믹스 A',
    total: 0,
    ...overrides,
  })

  it('참조가 없으면 삭제 가능으로 분류한다', () => {
    const result = classifyRecipeDeletion(['r1'], new Map([['r1', candidate()]]))
    expect(result).toEqual({ deletable: ['r1'], skipped: [] })
  })

  it('참조가 하나라도 있으면 단건 DELETE 409와 같은 문장의 사유로 건너뛴다', () => {
    const result = classifyRecipeDeletion(['r1'], new Map([['r1', candidate({ total: 2 })]]))
    expect(result.deletable).toEqual([])
    expect(result.skipped).toEqual([
      { id: 'r1', label: '믹스 A', reason: recipeDeleteBlockedMessage(2) },
    ])
  })

  it('존재하지 않는 id는 찾을 수 없다는 사유로 건너뛴다', () => {
    const result = classifyRecipeDeletion(['ghost'], new Map())
    expect(result.skipped).toEqual([{ id: 'ghost', reason: '레시피를 찾을 수 없습니다.' }])
  })

  it('이름이 없는 레시피는 label 없이 건너뛴다', () => {
    const result = classifyRecipeDeletion(['r1'], new Map([['r1', candidate({ name: null, total: 1 })]]))
    expect(result.skipped[0].label).toBeUndefined()
  })

  it('막힌 항목만 건너뛰고 나머지는 삭제 가능으로 남는다(요청 순서 유지)', () => {
    const candidates = new Map([
      ['r1', candidate({ id: 'r1' })],
      ['r2', candidate({ id: 'r2', total: 1 })],
      ['r3', candidate({ id: 'r3' })],
    ])
    const result = classifyRecipeDeletion(['r1', 'r2', 'r3'], candidates)
    expect(result.deletable).toEqual(['r1', 'r3'])
    expect(result.skipped.map((s) => s.id)).toEqual(['r2'])
  })
})
