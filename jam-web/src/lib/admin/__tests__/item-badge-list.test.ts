import {
  parseItemBadgeListParams,
  applyItemBadgeListQuery,
  loadItemBadgeIssuedCounts,
  type ItemBadgeListQuery,
} from '../item-badge-list'
import type { CountRowsClient, CountRowsQuery } from '../list-counts'

interface RecordedCall {
  method: string
  args: unknown[]
}

/** 기록형 스텁 — `poi-list-query.test.ts`와 같은 방식으로 실제 필터 호출이 나갔는지만 기록한다 */
function createStubQuery<T>() {
  const calls: RecordedCall[] = []
  const query: ItemBadgeListQuery<T> = {
    ilike: (...args) => {
      calls.push({ method: 'ilike', args })
      return query
    },
    eq: (...args) => {
      calls.push({ method: 'eq', args })
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

describe('parseItemBadgeListParams', () => {
  it('빈 파라미터는 필터 없음 + 이름 오름차순이다 — 필터가 없어도 목록을 보여 주는 조건', () => {
    expect(parseItemBadgeListParams({})).toEqual({
      q: '',
      tribeId: undefined,
      itemBookId: undefined,
      rarity: undefined,
      sort: 'name_asc',
    })
  })

  it('알려진 값은 그대로 좁혀진다', () => {
    expect(
      parseItemBadgeListParams({ q: ' 잼 ', tribe_id: 't1', item_book_id: 'b1', rarity: 'epic', sort: 'name_desc' })
    ).toEqual({ q: '잼', tribeId: 't1', itemBookId: 'b1', rarity: 'epic', sort: 'name_desc' })
  })

  it('알 수 없는 등급·정렬은 전체/기본 정렬로 떨어진다', () => {
    const parsed = parseItemBadgeListParams({ rarity: 'legendary', sort: 'issued_desc' })
    expect(parsed.rarity).toBeUndefined()
    expect(parsed.sort).toBe('name_asc')
  })

  it('검색어는 sanitizeSearchTerm을 거친다(쉼표·괄호 제거)', () => {
    expect(parseItemBadgeListParams({ q: '잼,(배지)' }).q).toBe('잼  배지')
  })
})

describe('applyItemBadgeListQuery', () => {
  it('필터가 없어도 아이템배지(type=item) 조건과 정렬은 항상 건다', () => {
    const { query, calls } = createStubQuery<unknown>()
    applyItemBadgeListQuery(query, parseItemBadgeListParams({}))

    expect(calls).toEqual([
      { method: 'eq', args: ['type', 'item'] },
      { method: 'order', args: ['name', { ascending: true }] },
      { method: 'order', args: ['id', { ascending: true }] },
    ])
  })

  it('검색·트라이브·컬렉션·등급이 각각 쿼리 호출로 나간다', () => {
    const { query, calls } = createStubQuery<unknown>()
    applyItemBadgeListQuery(
      query,
      parseItemBadgeListParams({ q: '잼', tribe_id: 't1', item_book_id: 'b1', rarity: 'rare', sort: 'name_desc' })
    )

    expect(calls).toContainEqual({ method: 'ilike', args: ['name', '%잼%'] })
    expect(calls).toContainEqual({ method: 'eq', args: ['tribe_id', 't1'] })
    expect(calls).toContainEqual({ method: 'eq', args: ['item_book_id', 'b1'] })
    expect(calls).toContainEqual({ method: 'eq', args: ['rarity', 'rare'] })
    expect(calls).toContainEqual({ method: 'order', args: ['name', { ascending: false }] })
  })
})

type Row = Record<string, unknown>

/** PostgREST 흉내 스텁 — 한 번에 최대 1,000행만 돌려준다(`list-counts.test.ts`와 같은 방식) */
function createCountClient(tables: Record<string, Row[]>): CountRowsClient {
  return {
    from: (table: string) => ({
      select: (): CountRowsQuery => {
        let inColumn = ''
        let inValues: string[] = []
        const orders: string[] = []
        const query: CountRowsQuery = {
          eq: () => query,
          in: (column, values) => {
            inColumn = column
            inValues = values
            return query
          },
          order: (column) => {
            orders.push(column)
            return query
          },
          range: async (from, to) => {
            const rows = (tables[table] ?? [])
              .filter((r) => inValues.includes(String(r[inColumn])))
              .sort((a, b) => {
                for (const col of orders) {
                  const cmp = String(a[col]).localeCompare(String(b[col]))
                  if (cmp !== 0) return cmp
                }
                return 0
              })
            return { data: rows.slice(from, Math.min(to, from + 999) + 1), error: null }
          },
        }
        return query
      },
    }),
  }
}

describe('loadItemBadgeIssuedCounts', () => {
  it('한 도안의 발급 수가 1,000행을 넘어도 끝까지 읽어 정확히 센다', async () => {
    const items: Row[] = []
    for (let i = 0; i < 1500; i++) items.push({ id: `a${String(i).padStart(5, '0')}`, badge_id: 'b1' })
    for (let i = 0; i < 3; i++) items.push({ id: `b${i}`, badge_id: 'b2' })

    const counts = await loadItemBadgeIssuedCounts(createCountClient({ inventory_items: items }), ['b1', 'b2', 'b3'])

    expect(counts).toEqual({ b1: 1500, b2: 3, b3: 0 })
  })

  it('inventory_items.badge_id 기준으로 센다', async () => {
    const calls: { table: string; inColumn: string }[] = []
    const client: CountRowsClient = {
      from: (table) => ({
        select: () => {
          const query: CountRowsQuery = {
            eq: () => query,
            in: (column) => {
              calls.push({ table, inColumn: column })
              return query
            },
            order: () => query,
            range: async () => ({ data: [], error: null }),
          }
          return query
        },
      }),
    }

    await loadItemBadgeIssuedCounts(client, ['b1'])

    expect(calls).toEqual([{ table: 'inventory_items', inColumn: 'badge_id' }])
  })
})
