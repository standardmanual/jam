/**
 * loadPathNames — 컬렉션별 획득 경로 화면의 이름 읽기 (티켓 20261022_1136 2회)
 *
 * 서비스 클라이언트만 메모리 안의 가짜 테이블로 바꾼다. 지키는 것:
 * 1. 넘긴 컬렉션·아이템 ID의 `id, name` 두 칸만 읽는다(관리자 ID 칸이 없고, 넘기지 않은 행은 읽지 않는다)
 * 2. ID가 200개를 넘으면 나눠 읽고(URL 길이), 쪽마다 정렬을 붙이며, 같은 행을 두 번 담지 않는다
 * 3. 읽을 ID가 없으면 그 표는 읽지 않는다
 * 4. 이름이 비었거나 null인 행은 맵에 없다(화면이 «이름을 모르는 …»으로 보인다)
 * 5. 표 하나라도 읽기에 실패하면 부분 결과 없이 던진다
 */
import { describe, it, expect } from 'vitest'
import { loadPathNames } from '../loadPathNames'

type Row = Record<string, unknown>
type Result = { data: Row[] | null; error: { message: string } | null }

interface FakeDb {
  tables: Record<string, Row[]>
  failTable: string | null
  selects: Array<{ table: string; columns: string[]; inValues: unknown[] }>
  unordered: number
}

class Query implements PromiseLike<Result> {
  private filters: Array<(row: Row) => boolean> = []
  private columns: string[] = []
  private inValues: unknown[] = []
  private orderBy: string[] = []
  private window: { from: number; to: number } | null = null
  constructor(
    private db: FakeDb,
    private table: string,
  ) {}
  select(columns: string) {
    this.columns = columns.split(',').map((c) => c.trim())
    return this
  }
  in(column: string, values: unknown[]) {
    this.inValues = values
    this.filters.push((row) => values.includes(row[column]))
    return this
  }
  order(column: string) {
    this.orderBy.push(column)
    return this
  }
  range(from: number, to: number) {
    this.window = { from, to }
    return this
  }
  private run(): Result {
    this.db.selects.push({ table: this.table, columns: this.columns, inValues: this.inValues })
    if (this.db.failTable === this.table) return { data: null, error: { message: `${this.table} 읽기 실패` } }
    if (this.orderBy.length === 0) this.db.unordered += 1
    let rows = (this.db.tables[this.table] ?? []).filter((row) => this.filters.every((test) => test(row)))
    rows = [...rows].sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0))
    if (this.window) rows = rows.slice(this.window.from, this.window.to + 1)
    return { data: rows.map((row) => Object.fromEntries(this.columns.map((c) => [c, row[c]]))), error: null }
  }
  then<R1 = Result, R2 = never>(
    onfulfilled?: ((value: Result) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected)
  }
}

function makeDb(tables: Record<string, Row[]> = {}): FakeDb {
  return { tables, failTable: null, selects: [], unordered: 0 }
}

function load(db: FakeDb, ids: { collectionIds: string[]; itemIds: string[] }) {
  const service = { from: (table: string) => new Query(db, table) }
  return loadPathNames(service as unknown as Parameters<typeof loadPathNames>[0], ids)
}

const pad = (prefix: string, n: number) => `${prefix}${String(n).padStart(5, '0')}`

describe('loadPathNames', () => {
  it('넘긴 ID의 이름만 읽고 id, name 두 칸만 select한다', async () => {
    const db = makeDb({
      item_books: [
        { id: 'c1', name: '컬렉션 하나', updated_by: 'secret-admin' },
        { id: 'c2', name: '읽지 않을 컬렉션', updated_by: 'secret-admin' },
      ],
      badges: [
        { id: 'i1', name: '아이템 하나', created_by: 'secret-admin' },
        { id: 'i2', name: '읽지 않을 아이템' },
      ],
    })
    const names = await load(db, { collectionIds: ['c1'], itemIds: ['i1'] })
    expect([...names.collections]).toEqual([['c1', '컬렉션 하나']])
    expect([...names.items]).toEqual([['i1', '아이템 하나']])
    expect(db.selects.map((s) => `${s.table}:${s.columns.join('|')}`).sort()).toEqual(['badges:id|name', 'item_books:id|name'])
    expect(JSON.stringify([...names.collections, ...names.items])).not.toContain('secret-admin')
  })

  it('ID가 200개를 넘으면 나눠 읽고 쪽마다 정렬하며 같은 행을 두 번 담지 않는다', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => pad('i', i))
    const db = makeDb({ badges: ids.map((id) => ({ id, name: `이름 ${id}` })), item_books: [] })
    const names = await load(db, { collectionIds: [], itemIds: [...ids, ...ids.slice(0, 10)] })
    expect(names.items.size).toBe(450)
    expect(db.selects.filter((s) => s.table === 'badges')).toHaveLength(3)
    expect(db.selects.filter((s) => s.table === 'badges').every((s) => s.inValues.length <= 200)).toBe(true)
    expect(db.unordered).toBe(0)
  })

  it('읽을 ID가 없으면 그 표는 읽지 않는다', async () => {
    const db = makeDb({ item_books: [{ id: 'c1', name: '컬렉션' }], badges: [] })
    const names = await load(db, { collectionIds: ['c1'], itemIds: [] })
    expect(names.collections.get('c1')).toBe('컬렉션')
    expect(names.items.size).toBe(0)
    expect(db.selects.some((s) => s.table === 'badges')).toBe(false)

    const none = makeDb()
    await load(none, { collectionIds: [], itemIds: [] })
    expect(none.selects).toEqual([])
  })

  it('이름이 null이거나 비었거나 없는 행은 맵에 없다', async () => {
    const db = makeDb({
      item_books: [
        { id: 'c1', name: null },
        { id: 'c2', name: '  ' },
        { id: 'c3', name: '컬렉션' },
      ],
      badges: [],
    })
    const names = await load(db, { collectionIds: ['c1', 'c2', 'c3', 'missing'], itemIds: [] })
    expect([...names.collections.keys()]).toEqual(['c3'])
  })

  it.each(['item_books', 'badges'])('%s를 읽지 못하면 부분 결과 없이 던진다', async (table) => {
    const db = makeDb({ item_books: [{ id: 'c1', name: '컬렉션' }], badges: [{ id: 'i1', name: '아이템' }] })
    db.failTable = table
    await expect(load(db, { collectionIds: ['c1'], itemIds: ['i1'] })).rejects.toThrow(`${table} 읽기 실패`)
  })
})
