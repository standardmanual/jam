/**
 * GET /api/itembooks — 공개되지 않은 컬렉션은 목록에 나오지 않는다 (티켓 20260930_1516, 결정 E1·E2)
 *
 * 검증 대상:
 *  - 공개 전 컬렉션(비활성, `valid_from`이 미래)은 응답에 없다
 *  - 기간이 끝난 컬렉션(`valid_until`이 과거)은 응답에 그대로 나온다 — 보유자는 계속 본다(E1)
 *  - 배지·슬롯·완성 조회는 걸러진 컬렉션 id로만 한다
 *
 * Supabase 모킹은 `item_books` 쿼리의 `eq`·`or` 조건을 행에 실제로 적용한다. 필터가 안 걸리면
 * 공개 전 컬렉션이 응답에 남아 테스트가 실패한다.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/itembooks/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const NOW = '2026-10-01T03:00:00.000Z'
const USER_ID = 'user-1'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  authenticated: true,
  tables: {} as Record<string, Row[]>,
  /** 테이블별로 `in(column, ids)`에 실제 넘어온 id 목록 */
  inCalls: [] as { table: string; column: string; ids: unknown[] }[],
}))

/** `col.op.value`를 쉼표로 이어 붙인 PostgREST `or` 표현식을 행에 적용한다(OR) */
function matchesOr(row: Row, expr: string): boolean {
  return expr.split(',').some((part) => {
    const [column, op, ...rest] = part.split('.')
    const value = rest.join('.')
    const cell = row[column] as string | null | undefined
    if (op === 'is') return value === 'null' && (cell === null || cell === undefined)
    if (cell === null || cell === undefined) return false
    const left = new Date(cell).getTime()
    const right = new Date(value).getTime()
    if (op === 'lte') return left <= right
    if (op === 'gte') return left >= right
    if (op === 'lt') return left < right
    if (op === 'gt') return left > right
    throw new Error(`테스트 모킹이 모르는 or 연산자: ${op}`)
  })
}

function makeBuilder(table: string) {
  let rows = [...(state.tables[table] ?? [])]
  const builder = {
    select: () => builder,
    in(column: string, ids: unknown[]) {
      state.inCalls.push({ table, column, ids })
      rows = rows.filter((r) => ids.includes(r[column]))
      return builder
    },
    eq(column: string, value: unknown) {
      rows = rows.filter((r) => r[column] === value)
      return builder
    },
    is(column: string, value: null) {
      rows = rows.filter((r) => (r[column] ?? null) === value)
      return builder
    },
    not(column: string, op: string, value: null) {
      if (op !== 'is') throw new Error(`테스트 모킹이 모르는 not 연산자: ${op}`)
      rows = rows.filter((r) => (r[column] ?? null) !== value)
      return builder
    },
    or(expr: string) {
      rows = rows.filter((r) => matchesOr(r, expr))
      return builder
    },
    single: async () => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
  }
  return builder
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.authenticated ? { id: USER_ID } : null } }),
    },
    from: (table: string) => makeBuilder(table),
  }),
}))

import { GET } from '../route'

function book(id: string, overrides: Row = {}): Row {
  return {
    id,
    name: `컬렉션 ${id}`,
    description: null,
    image_url: null,
    tribe_id: null,
    is_active: true,
    valid_from: null,
    valid_until: null,
    ...overrides,
  }
}

function itemBadge(id: string, itemBookId: string): Row {
  return { id, item_book_id: itemBookId, type: 'item', drop_excluded: false, deleted_at: null }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NOW))
  state.authenticated = true
  state.inCalls = []
  state.tables = {
    inventory: [{ id: 'inv-1', user_id: USER_ID }],
    // 유저는 네 컬렉션의 아이템을 모두 가지고 있다
    inventory_items: [
      { inventory_id: 'inv-1', badge_id: 'badge-live' },
      { inventory_id: 'inv-1', badge_id: 'badge-ended' },
      { inventory_id: 'inv-1', badge_id: 'badge-future' },
      { inventory_id: 'inv-1', badge_id: 'badge-inactive' },
    ],
    badges: [
      itemBadge('badge-live', 'book-live'),
      itemBadge('badge-ended', 'book-ended'),
      itemBadge('badge-future', 'book-future'),
      itemBadge('badge-inactive', 'book-inactive'),
    ],
    item_books: [
      book('book-live', { valid_from: '2026-09-01T00:00:00+00:00', valid_until: '2026-12-31T00:00:00+00:00' }),
      // 종료 후 — 보유자에게는 계속 보인다(E1)
      book('book-ended', { valid_from: '2026-08-01T00:00:00+00:00', valid_until: '2026-09-30T00:00:00+00:00' }),
      // 공개 전 — 시작 시각이 미래
      book('book-future', { valid_from: '2026-10-05T00:00:00+00:00' }),
      // 공개 전 — 비활성
      book('book-inactive', { is_active: false }),
    ],
    user_item_book_slots: [],
    user_item_book_completions: [],
    tribes: [],
  }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/itembooks', () => {
  it('공개 전 컬렉션(비활성·시작 전)은 응답에 없고, 기간이 끝난 컬렉션은 있다', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const { itemBooks } = (await res.json()) as { itemBooks: { id: string }[] }

    expect(itemBooks.map((b) => b.id)).toEqual(['book-live', 'book-ended'])
  })

  it('배지·슬롯·완성 조회는 걸러진 컬렉션 id로만 한다', async () => {
    await GET()

    const bookScopedIn = state.inCalls.filter((c) => c.column === 'item_book_id')
    expect(bookScopedIn.length).toBeGreaterThan(0)
    for (const call of bookScopedIn) {
      expect(call.ids.sort()).toEqual(['book-ended', 'book-live'])
    }
  })

  it('모든 컬렉션이 공개 전이면 빈 목록을 돌려준다', async () => {
    state.tables.item_books = [book('book-future', { valid_from: '2026-10-05T00:00:00+00:00' }), book('book-inactive', { is_active: false })]

    const res = await GET()
    expect(await res.json()).toEqual({ itemBooks: [] })
  })

  it('로그인하지 않았으면 401이다', async () => {
    state.authenticated = false
    const res = await GET()
    expect(res.status).toBe(401)
  })
})
