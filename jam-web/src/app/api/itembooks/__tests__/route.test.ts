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
      { inventory_id: 'inv-1', badge_id: 'badge-live', locked: false },
      { inventory_id: 'inv-1', badge_id: 'badge-ended', locked: false },
      { inventory_id: 'inv-1', badge_id: 'badge-future', locked: false },
      { inventory_id: 'inv-1', badge_id: 'badge-inactive', locked: false },
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

  it('잠긴 개체만 가진 컬렉션은 목록에 없다(열기 전에는 어떤 컬렉션의 배지인지 드러나지 않는다, 티켓 20261018_0054 2회)', async () => {
    // book-live의 개체 하나가 잠겨 있고, 다른 컬렉션 개체는 열려 있다
    state.tables.inventory_items = [
      { inventory_id: 'inv-1', badge_id: 'badge-live', locked: true },
      { inventory_id: 'inv-1', badge_id: 'badge-ended', locked: false },
    ]

    const res = await GET()
    const { itemBooks } = (await res.json()) as { itemBooks: { id: string }[] }

    expect(itemBooks.map((b) => b.id)).toEqual(['book-ended'])
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

/**
 * 티켓 20261016_2340 3회-나 — 조회 응답의 등급 필드(`tierMode`·`tier`·`tiers`)
 * 옛(tier_mode 꺼진) 컬렉션은 기존 필드 이름·값이 그대로이고 새 필드는 `false`·`null`·`{}`다.
 */
type TierBook = {
  id: string
  name: string
  description: string | null
  image_url: string | null
  tribe: null
  totalBadgeCount: number
  discoveredBadgeCount: number
  slottedCount: number
  isCompleted: boolean
  tierMode: boolean
  tier: string | null
  tiers: Record<string, { total: number; filled: number; complete: boolean; recorded: boolean }>
}

function namedBadge(id: string, itemBookId: string, name: string, rarity: string): Row {
  return { id, item_book_id: itemBookId, type: 'item', drop_excluded: false, deleted_at: null, name, rarity }
}

async function fetchBooks(): Promise<TierBook[]> {
  const res = await GET()
  return ((await res.json()) as { itemBooks: TierBook[] }).itemBooks
}

describe('GET /api/itembooks — 등급 필드(티켓 20261016_2340 3회-나)', () => {
  const LEGACY_KEYS = [
    'id', 'name', 'description', 'image_url', 'tribe',
    'totalBadgeCount', 'discoveredBadgeCount', 'slottedCount', 'isCompleted',
  ]

  it('옛 컬렉션은 기존 필드의 이름과 값이 그대로이고 새 필드는 tierMode false·tier null·tiers {}다', async () => {
    state.tables.inventory_items = [
      { inventory_id: 'inv-1', badge_id: 'old-a', locked: false },
      { inventory_id: 'inv-1', badge_id: 'old-b', locked: false },
    ]
    state.tables.badges = [itemBadge('old-a', 'book-old'), itemBadge('old-b', 'book-old')]
    state.tables.item_books = [book('book-old')]
    state.tables.user_item_book_slots = [{ user_id: USER_ID, item_book_id: 'book-old', badge_id: 'old-a' }]

    const books = await fetchBooks()
    expect(books).toEqual([
      {
        id: 'book-old',
        name: '컬렉션 book-old',
        description: null,
        image_url: null,
        tribe: null,
        totalBadgeCount: 2,
        discoveredBadgeCount: 2,
        slottedCount: 1,
        isCompleted: false,
        tierMode: false,
        tier: null,
        tiers: {},
      },
    ])
    for (const key of LEGACY_KEYS) expect(books[0]).toHaveProperty(key)
  })

  it('옛 완성 기록이 있는 옛 컬렉션은 장착을 풀어도 isCompleted true이고 새 필드는 그대로다', async () => {
    state.tables.inventory_items = [{ inventory_id: 'inv-1', badge_id: 'old-a', locked: false }]
    state.tables.badges = [itemBadge('old-a', 'book-old')]
    state.tables.item_books = [book('book-old')]
    state.tables.user_item_book_completions = [{ user_id: USER_ID, item_book_id: 'book-old' }]

    const [b] = await fetchBooks()
    expect(b.isCompleted).toBe(true)
    expect(b.slottedCount).toBe(0)
    expect(b).toMatchObject({ tierMode: false, tier: null, tiers: {} })
  })

  describe('tier_mode 컬렉션', () => {
    beforeEach(() => {
      state.tables.inventory_items = [
        { inventory_id: 'inv-1', badge_id: 'c-a', locked: false },
        { inventory_id: 'inv-1', badge_id: 'r-a', locked: false },
      ]
      // 이름 두 개(가·나)가 common·rare 두 등급으로 있다
      state.tables.badges = [
        namedBadge('c-a', 'book-tier', '가', 'common'),
        namedBadge('c-b', 'book-tier', '나', 'common'),
        namedBadge('r-a', 'book-tier', '가', 'rare'),
        namedBadge('r-b', 'book-tier', '나', 'rare'),
      ]
      state.tables.item_books = [book('book-tier', { tier_mode: true })]
    })

    it('꽂힌 등급을 tier로, 등급별 진행을 tiers로 돌려준다', async () => {
      state.tables.user_item_book_slots = [{ user_id: USER_ID, item_book_id: 'book-tier', badge_id: 'c-a' }]

      const [b] = await fetchBooks()
      expect(b.tierMode).toBe(true)
      expect(b.tier).toBe('common')
      expect(b.tiers).toEqual({
        common: { total: 2, filled: 1, complete: false, recorded: false },
        rare: { total: 2, filled: 0, complete: false, recorded: false },
      })
      expect(b.isCompleted).toBe(false)
    })

    it('등급별 완성 기록이 하나라도 있으면 장착을 풀어도 isCompleted true이고 그 등급만 recorded다', async () => {
      state.tables.user_item_book_slots = []
      state.tables.user_item_book_tier_completions = [{ user_id: USER_ID, item_book_id: 'book-tier', tier: 'rare' }]

      const [b] = await fetchBooks()
      expect(b.isCompleted).toBe(true)
      expect(b.tier).toBeNull()
      expect(b.tiers.rare).toMatchObject({ complete: false, recorded: true })
      expect(b.tiers.common).toMatchObject({ complete: false, recorded: false })
    })

    it('기록이 없어도 지금 계산상 완성이면 isCompleted true다', async () => {
      state.tables.user_item_book_slots = [
        { user_id: USER_ID, item_book_id: 'book-tier', badge_id: 'c-a' },
        { user_id: USER_ID, item_book_id: 'book-tier', badge_id: 'c-b' },
      ]

      const [b] = await fetchBooks()
      expect(b.isCompleted).toBe(true)
      expect(b.tiers.common).toEqual({ total: 2, filled: 2, complete: true, recorded: false })
    })

    it('다른 유저의 등급별 완성 기록은 세지 않는다', async () => {
      state.tables.user_item_book_tier_completions = [{ user_id: 'other', item_book_id: 'book-tier', tier: 'common' }]

      const [b] = await fetchBooks()
      expect(b.isCompleted).toBe(false)
      expect(b.tiers.common?.recorded).toBe(false)
    })
  })
})
