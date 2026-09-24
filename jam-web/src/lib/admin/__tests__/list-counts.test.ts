import { countRowsByKey, type CountRowsClient, type CountRowsQuery } from '../list-counts'

type Row = Record<string, unknown>

/** PostgREST 흉내 스텁 — `notifications/__tests__/batch-query.test.ts`의 기록형 스텁과 동일한 방식 */
function createStubClient(tables: Record<string, Row[]>) {
  const rangeCalls: { table: string; inColumn: string; inValues: string[]; orders: string[]; range: [number, number] }[] = []

  function from(table: string) {
    return {
      select: (): CountRowsQuery => {
        const orders: string[] = []
        const eqFilters: { column: string; value: unknown }[] = []
        const isNullFilters: string[] = []
        let inColumn = ''
        let inValues: string[] = []

        const query: CountRowsQuery = {
          eq: (column, value) => {
            eqFilters.push({ column, value })
            return query
          },
          is: (column) => {
            isNullFilters.push(column)
            return query
          },
          in: (column, values) => {
            inColumn = column
            inValues = values
            return query
          },
          order: (column) => {
            orders.push(column)
            return query
          },
          range: async (from_, to) => {
            rangeCalls.push({ table, inColumn, inValues: [...inValues], orders: [...orders], range: [from_, to] })

            let rows = tables[table] ?? []
            rows = rows.filter((r) => inValues.includes(String(r[inColumn])))
            for (const f of eqFilters) rows = rows.filter((r) => r[f.column] === f.value)
            for (const column of isNullFilters) rows = rows.filter((r) => (r[column] ?? null) === null)
            rows = [...rows].sort((a, b) => {
              for (const col of orders) {
                const cmp = String(a[col]).localeCompare(String(b[col]))
                if (cmp !== 0) return cmp
              }
              return 0
            })

            return { data: rows.slice(from_, to + 1), error: null }
          },
        }
        return query
      },
    }
  }

  return { client: { from } as CountRowsClient, rangeCalls }
}

describe('countRowsByKey', () => {
  it('키별 건수를 정확히 센다 — 자식 행이 없는 id는 0으로 채운다', async () => {
    const rows: Row[] = [
      { id: 'r1', tribe_id: 't1' },
      { id: 'r2', tribe_id: 't1' },
      { id: 'r3', tribe_id: 't2' },
    ]
    const { client } = createStubClient({ badges: rows })
    const counts = await countRowsByKey(client, 'badges', 'tribe_id', ['t1', 't2', 't3'])
    expect(counts).toEqual({ t1: 2, t2: 1, t3: 0 })
  })

  it('1,000행을 넘는 결과를 끝까지 읽어 정확히 센다', async () => {
    const rows: Row[] = Array.from({ length: 1500 }, (_, i) => ({ id: `r${String(i).padStart(4, '0')}`, key: 'k1' }))
    const { client, rangeCalls } = createStubClient({ items: rows })
    const counts = await countRowsByKey(client, 'items', 'key', ['k1'])
    expect(counts.k1).toBe(1500)
    expect(rangeCalls.filter((c) => c.table === 'items').length).toBeGreaterThan(1)
  })

  it('ids가 200개를 넘으면 여러 묶음으로 나눠 조회한다(URL 상한)', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id-${String(i).padStart(3, '0')}`)
    const rows: Row[] = ids.map((id) => ({ id: `row-${id}`, key: id }))
    const { client, rangeCalls } = createStubClient({ items: rows })
    const counts = await countRowsByKey(client, 'items', 'key', ids)

    expect(Object.keys(counts)).toHaveLength(450)
    for (const id of ids) expect(counts[id]).toBe(1)
    expect(rangeCalls).toHaveLength(3) // 200 + 200 + 50
    expect(rangeCalls.every((c) => c.inValues.length <= 200)).toBe(true)
  })

  it('extraFilter로 추가 조건을 걸 수 있다', async () => {
    const rows: Row[] = [
      { id: 'r1', tribe_id: 't1', deleted: false },
      { id: 'r2', tribe_id: 't1', deleted: true },
    ]
    const { client } = createStubClient({ badges: rows })
    const counts = await countRowsByKey(client, 'badges', 'tribe_id', ['t1'], (q) => q.eq('deleted', false))
    expect(counts.t1).toBe(1)
  })

  it('extraFilter의 is(null)로 삭제되지 않은 행만 센다', async () => {
    const rows: Row[] = [
      { id: 'r1', tribe_id: 't1', deleted_at: null },
      { id: 'r2', tribe_id: 't1', deleted_at: '2026-09-01T00:00:00Z' },
      { id: 'r3', tribe_id: 't1' },
    ]
    const { client } = createStubClient({ badges: rows })
    const counts = await countRowsByKey(client, 'badges', 'tribe_id', ['t1'], (q) => q.is('deleted_at', null))
    expect(counts.t1).toBe(2)
  })

  it('모든 조회에 정렬이 붙는다(키 컬럼 + id 보조 정렬)', async () => {
    const rows: Row[] = [{ id: 'r1', tribe_id: 't1' }]
    const { client, rangeCalls } = createStubClient({ badges: rows })
    await countRowsByKey(client, 'badges', 'tribe_id', ['t1'])
    expect(rangeCalls[0].orders).toEqual(['tribe_id', 'id'])
  })

  it('조회가 실패하면 던진다', async () => {
    const client: CountRowsClient = {
      from: () => ({
        select: (): CountRowsQuery => {
          const query: CountRowsQuery = {
            eq: () => query,
            is: () => query,
            in: () => query,
            order: () => query,
            range: async () => ({ data: null, error: { message: '타임아웃' } }),
          }
          return query
        },
      }),
    }
    await expect(countRowsByKey(client, 't', 'key', ['a'])).rejects.toThrow('타임아웃')
  })

  it('ids가 비어 있으면 조회 없이 빈 객체를 돌려준다', async () => {
    const { client, rangeCalls } = createStubClient({ items: [] })
    const counts = await countRowsByKey(client, 'items', 'key', [])
    expect(counts).toEqual({})
    expect(rangeCalls).toHaveLength(0)
  })

  it('중복 id는 한 번만 센다', async () => {
    const { client, rangeCalls } = createStubClient({ items: [] })
    await countRowsByKey(client, 'items', 'key', ['a', 'a', 'b'])
    expect(rangeCalls[0].inValues).toEqual(['a', 'b'])
  })
})
