/**
 * loadItemPathInputs — 얻을 길 계산 입력 읽기 (티켓 20261004_1641, 상위 20260930_1503 ⑦b)
 *
 * 서비스 클라이언트만 메모리 안의 가짜 테이블로 바꾼다(필터·정렬·`range`·`or` 구문을 실제로 처리한다). 지키는 것:
 * 1. 1,000행을 넘는 표는 쪽을 넘겨 끝까지 읽는다(아이템 배지·레시피·미션 모두). 쪽마다 정렬을 붙이고, 컬렉션이 많아 `in` 값을 쪼개도 같은 아이템이 두 번 담기지 않는다
 * 2. 컬렉션은 공개된 것 전부다 — 기간이 끝난 것은 싣고 비활성·공개 전은 뺀다. 아이템은 그 컬렉션 소속이고 삭제되지 않은 아이템 배지만 읽는다
 * 3. 표 하나라도 읽기에 실패하면 부분 결과 없이 던진다(조용히 「막힘」이 되지 않는다)
 * 4. select 목록에 관리자 ID 칸이 없다
 */
import { describe, it, expect } from 'vitest'
import { loadItemPathInputs } from '../load'

type Row = Record<string, unknown>
type Result = { data: Row[] | null; error: { message: string } | null }

interface FakeDb {
  tables: Record<string, Row[]>
  failTable: string | null
  /** `select`한 칸 목록(표 이름 → 목록들) */
  selects: Array<{ table: string; columns: string[] }>
  /** `range`로 읽은 구간 */
  ranges: Array<{ table: string; from: number; to: number }>
  /** 정렬 없이 읽은 횟수 — 0이어야 한다 */
  unordered: number
}

/** `valid_from.is.null,valid_from.lte.<iso>` 같은 PostgREST `or` 목록을 행 판정 함수로 바꾼다 */
function parseOr(expr: string): (row: Row) => boolean {
  const conditions = expr.split(',').map((part) => {
    const [column, op, ...rest] = part.split('.')
    const value = rest.join('.')
    return (row: Row): boolean => {
      const cell = row[column]
      if (op === 'is') return value === 'null' && cell === null
      if (cell === null || cell === undefined) return false
      const left = new Date(cell as string).getTime()
      const right = new Date(value).getTime()
      return op === 'lte' ? left <= right : op === 'gte' ? left >= right : false
    }
  })
  return (row) => conditions.some((test) => test(row))
}

class Query implements PromiseLike<Result> {
  private filters: Array<(row: Row) => boolean> = []
  private columns: string[] = []
  private orderBy: string[] = []
  private window: { from: number; to: number } | null = null
  constructor(
    private db: FakeDb,
    private table: string
  ) {}
  select(columns: string) {
    this.columns = columns.split(',').map((c) => c.trim())
    this.db.selects.push({ table: this.table, columns: this.columns })
    return this
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value)
    return this
  }
  is(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value)
    return this
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]))
    return this
  }
  or(expr: string) {
    this.filters.push(parseOr(expr))
    return this
  }
  order(column: string) {
    this.orderBy.push(column)
    return this
  }
  range(from: number, to: number) {
    this.window = { from, to }
    this.db.ranges.push({ table: this.table, from, to })
    return this
  }
  private run(): Result {
    if (this.db.failTable === this.table) return { data: null, error: { message: `${this.table} 읽기 실패` } }
    if (this.orderBy.length === 0) this.db.unordered += 1
    let rows = (this.db.tables[this.table] ?? []).filter((row) => this.filters.every((test) => test(row)))
    rows = [...rows].sort((a, b) => {
      for (const column of this.orderBy) {
        const x = String(a[column])
        const y = String(b[column])
        if (x !== y) return x < y ? -1 : 1
      }
      return 0
    })
    if (this.window) rows = rows.slice(this.window.from, this.window.to + 1)
    return { data: rows.map((row) => Object.fromEntries(this.columns.map((c) => [c, row[c]]))), error: null }
  }
  then<R1 = Result, R2 = never>(
    onfulfilled?: ((value: Result) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected)
  }
}

function makeDb(tables: Record<string, Row[]> = {}): FakeDb {
  return { tables, failTable: null, selects: [], ranges: [], unordered: 0 }
}

function load(db: FakeDb, now: Date) {
  const service = { from: (table: string) => new Query(db, table) }
  return loadItemPathInputs(service as unknown as Parameters<typeof loadItemPathInputs>[0], now)
}

const NOW = new Date('2026-10-04T00:00:00.000Z')
const PAST = '2026-09-01T00:00:00.000Z'
const FUTURE = '2026-11-01T00:00:00.000Z'
const ADMIN_ID = 'secret-admin-user-id'

function book(id: string, over: Row = {}): Row {
  return { id, is_active: true, valid_from: null, valid_until: null, drop_excluded: false, updated_by: ADMIN_ID, ...over }
}

function itemRow(id: string, bookId: string | null, over: Row = {}): Row {
  return {
    id,
    type: 'item',
    item_book_id: bookId,
    deleted_at: null,
    drop_excluded: false,
    valid_from: null,
    valid_until: null,
    ...over,
  }
}

const pad = (prefix: string, n: number) => `${prefix}${String(n).padStart(5, '0')}`

describe('loadItemPathInputs — 컬렉션·아이템 범위', () => {
  it('공개된 컬렉션은 기간이 끝난 것까지 싣고, 비활성·공개 전은 뺀다', async () => {
    const db = makeDb({
      item_books: [
        book('open'),
        book('ended', { valid_until: PAST }),
        book('inactive', { is_active: false }),
        book('not-launched', { valid_from: FUTURE }),
        book('boundary', { valid_from: NOW.toISOString() }),
      ],
      badges: [],
    })
    const inputs = await load(db, NOW)
    expect(inputs.collections.map((c) => c.id)).toEqual(['boundary', 'ended', 'open'])
    expect(inputs.collections[1]).toEqual({
      id: 'ended',
      is_active: true,
      valid_from: null,
      valid_until: PAST,
      drop_excluded: false,
    })
  })

  it('아이템은 읽어 온 컬렉션 소속이고 삭제되지 않은 아이템 배지만 읽는다', async () => {
    const db = makeDb({
      item_books: [book('c1'), book('hidden', { is_active: false })],
      badges: [
        itemRow('i1', 'c1'),
        itemRow('i2', 'c1', { drop_excluded: true }),
        itemRow('deleted', 'c1', { deleted_at: PAST }),
        itemRow('in-hidden-book', 'hidden'),
        itemRow('no-book', null),
        { ...itemRow('activity', 'c1'), type: 'activity' },
      ],
    })
    const inputs = await load(db, NOW)
    expect(inputs.items.map((i) => i.id)).toEqual(['i1', 'i2'])
    expect(inputs.items[1].drop_excluded).toBe(true)
  })

  it('공개된 컬렉션이 하나도 없으면 아이템 배지 표는 읽지 않는다', async () => {
    const db = makeDb({ item_books: [book('c1', { is_active: false })], badges: [itemRow('i1', 'c1')] })
    const inputs = await load(db, NOW)
    expect(inputs.collections).toEqual([])
    expect(inputs.items).toEqual([])
    expect(db.selects.some((s) => s.table === 'badges')).toBe(false)
  })

  it('레시피·미션 행은 계산이 쓰는 칸 그대로 담는다', async () => {
    const db = makeDb({
      item_books: [],
      combination_recipes: [{ id: 'r1', reward_badge_ids: ['i1'], valid_from: PAST, valid_until: null }],
      missions: [
        {
          id: 'm1',
          reward_badge_ids: ['i1', 'i2'],
          starts_at: PAST,
          ends_at: null,
          exposure_mode: 'scheduled',
          exposure_at: PAST,
        },
      ],
    })
    const inputs = await load(db, NOW)
    expect(inputs.recipes).toEqual([{ id: 'r1', reward_badge_ids: ['i1'], valid_from: PAST, valid_until: null }])
    expect(inputs.missions).toEqual([
      { id: 'm1', reward_badge_ids: ['i1', 'i2'], starts_at: PAST, ends_at: null, exposure_mode: 'scheduled', exposure_at: PAST },
    ])
  })
})

describe('loadItemPathInputs — 1,000행 넘는 쪽 읽기', () => {
  it('아이템 배지 2,500개·레시피 1,100개·미션 1,001개를 끝까지 읽고 쪽마다 정렬한다', async () => {
    const db = makeDb({
      item_books: [book('c1')],
      badges: Array.from({ length: 2500 }, (_, i) => itemRow(pad('i', i), 'c1')),
      combination_recipes: Array.from({ length: 1100 }, (_, i) => ({
        id: pad('r', i),
        reward_badge_ids: [],
        valid_from: null,
        valid_until: null,
      })),
      missions: Array.from({ length: 1001 }, (_, i) => ({
        id: pad('m', i),
        reward_badge_ids: [],
        starts_at: PAST,
        ends_at: null,
        exposure_mode: 'start_date',
        exposure_at: null,
      })),
    })
    const inputs = await load(db, NOW)

    expect(inputs.items).toHaveLength(2500)
    expect(new Set(inputs.items.map((i) => i.id)).size).toBe(2500)
    expect(inputs.recipes).toHaveLength(1100)
    expect(inputs.missions).toHaveLength(1001)
    expect(db.ranges.filter((r) => r.table === 'badges').map((r) => r.from)).toEqual([0, 1000, 2000])
    expect(db.ranges.filter((r) => r.table === 'combination_recipes').map((r) => r.from)).toEqual([0, 1000])
    expect(db.ranges.filter((r) => r.table === 'missions').map((r) => r.from)).toEqual([0, 1000])
    expect(db.unordered).toBe(0)
  })

  it('컬렉션이 많아 in 값을 나눠 읽어도 같은 아이템이 두 번 담기지 않는다', async () => {
    const books = Array.from({ length: 450 }, (_, i) => book(pad('c', i)))
    const db = makeDb({
      item_books: books,
      badges: books.map((b, i) => itemRow(pad('i', i), b.id as string)),
    })
    const inputs = await load(db, NOW)
    expect(inputs.collections).toHaveLength(450)
    expect(inputs.items).toHaveLength(450)
    expect(new Set(inputs.items.map((i) => i.id)).size).toBe(450)
    expect(db.selects.filter((s) => s.table === 'badges')).toHaveLength(3)
  })
})

describe('loadItemPathInputs — 읽기 실패', () => {
  const full = (): Record<string, Row[]> => ({
    item_books: [book('c1')],
    badges: [itemRow('i1', 'c1')],
    combination_recipes: [],
    missions: [],
  })

  it.each(['item_books', 'badges', 'combination_recipes', 'missions'])(
    '%s를 읽지 못하면 부분 결과 없이 던진다',
    async (table) => {
      const db = makeDb(full())
      db.failTable = table
      await expect(load(db, NOW)).rejects.toThrow(`${table} 읽기 실패`)
    }
  )

  it('실패가 없으면 같은 데이터로 정상 결과를 돌려준다', async () => {
    const inputs = await load(makeDb(full()), NOW)
    expect(inputs.items.map((i) => i.id)).toEqual(['i1'])
  })
})

describe('loadItemPathInputs — 관리자 ID', () => {
  it('select 목록에 관리자 ID 칸이 없고 결과 어디에도 값이 없다', async () => {
    const db = makeDb({
      item_books: [book('c1')],
      badges: [itemRow('i1', 'c1', { updated_by: ADMIN_ID })],
      combination_recipes: [{ id: 'r1', reward_badge_ids: [], valid_from: null, valid_until: null, updated_by: ADMIN_ID }],
      missions: [
        {
          id: 'm1',
          reward_badge_ids: [],
          starts_at: PAST,
          ends_at: null,
          exposure_mode: 'start_date',
          exposure_at: null,
          created_by: ADMIN_ID,
        },
      ],
    })
    const inputs = await load(db, NOW)
    for (const { columns } of db.selects) {
      expect(columns.some((c) => /(_by|admin)/.test(c))).toBe(false)
    }
    expect(JSON.stringify(inputs)).not.toContain(ADMIN_ID)
  })
})
