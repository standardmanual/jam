/**
 * 다른 사람 프로필의 컬렉션 목록 API — 꺼진·기간이 끝난·시작 전 컬렉션도 그 사람이 가졌으면 나온다 (티켓 20261106_1231, 2단계 T5)
 *
 * 모킹한 DB 가짜는 필터를 실제로 적용하지 않는다. 그래서 «거름 조건을 걸지 않았다»는 것은
 * item_books 조회에 건 조건(eq·or)을 기록해 직접 확인하고, 「슬롯이 없으면 안 나옴」은 라우트의 슬롯 거름으로 확인한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const tables: Record<string, unknown[]> = {}
const calls: { table: string; method: string; args: unknown[] }[] = []

function chain(table: string) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'is', 'or', 'order']) {
    q[m] = (...args: unknown[]) => {
      calls.push({ table, method: m, args })
      return q
    }
  }
  q.single = () => Promise.resolve({ data: (tables[table] ?? [])[0] ?? null, error: null })
  q.maybeSingle = q.single
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(res)
  return q
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'viewer' } } }) } }),
  createServiceClient: () => ({ from: (t: string) => chain(t) }),
}))

import { GET } from '../route'

async function call() {
  const res = await GET(new Request('http://x'), { params: Promise.resolve({ username: 'target' }) })
  return (await res.json()).books as { id: string; slottedCount: number }[]
}

// 세 컬렉션이 모두 그 사람이 가진 개체를 갖는다. 꺼진 것·기간이 끝난 것·시작 전인 것은 각자 한 칸씩 꽂혀 있다.
const INACTIVE = { id: 'book-off', name: '꺼진 컬렉션', image_url: null, tribe: null, is_active: false }
const EXPIRED = { id: 'book-ended', name: '끝난 컬렉션', image_url: null, tribe: null, is_active: true, valid_until: '2020-01-01T00:00:00Z' }
const NOT_STARTED = { id: 'book-future', name: '시작 전 컬렉션', image_url: null, tribe: null, is_active: true, valid_from: '2999-01-01T00:00:00Z' }
const NO_SLOT = { id: 'book-noslot', name: '꽂지 않은 컬렉션', image_url: null, tribe: null, is_active: false }

beforeEach(() => {
  calls.length = 0
  tables.users = [{ id: 'target' }]
  tables.inventory = [{ id: 'inv' }]
  tables.inventory_items = [
    { badge_id: 'off-1', badge: { item_book_id: 'book-off', type: 'item', deleted_at: null } },
    { badge_id: 'ended-1', badge: { item_book_id: 'book-ended', type: 'item', deleted_at: null } },
    { badge_id: 'future-1', badge: { item_book_id: 'book-future', type: 'item', deleted_at: null } },
    { badge_id: 'noslot-1', badge: { item_book_id: 'book-noslot', type: 'item', deleted_at: null } },
  ]
  tables.item_books = [INACTIVE, EXPIRED, NOT_STARTED, NO_SLOT]
  tables.badges = ['off', 'ended', 'future', 'noslot'].map((k, i) => ({
    id: `${k}-1`,
    item_book_id: `book-${k}`,
    type: 'item',
    drop_excluded: false,
    rarity: 'common',
    created_at: String(i),
  }))
  tables.user_item_book_slots = [
    { item_book_id: 'book-off', badge_id: 'off-1' },
    { item_book_id: 'book-ended', badge_id: 'ended-1' },
    { item_book_id: 'book-future', badge_id: 'future-1' },
  ]
  tables.user_item_book_completions = []
  tables.user_item_book_tier_completions = []
})

describe('GET /api/users/[username]/itembooks — 다른 사람 프로필에서 비활성 컬렉션', () => {
  it('item_books 조회에 is_active·노출 기간 조건을 걸지 않는다', async () => {
    await call()
    const bookCalls = calls.filter((c) => c.table === 'item_books')
    expect(bookCalls.length).toBeGreaterThan(0)
    expect(bookCalls.some((c) => c.method === 'or')).toBe(false)
    expect(bookCalls.some((c) => c.method === 'eq')).toBe(false)
  })

  it('꺼진·기간이 끝난·시작 전 컬렉션도 그 사람이 슬롯을 가졌으면 나온다', async () => {
    const books = await call()
    expect(books.map((b) => b.id).sort()).toEqual(['book-ended', 'book-future', 'book-off'])
    for (const b of books) expect(b.slottedCount).toBe(1)
  })

  it('슬롯이 없는 컬렉션은 꺼졌든 켜졌든 나오지 않는다', async () => {
    const books = await call()
    expect(books.some((b) => b.id === 'book-noslot')).toBe(false)
  })

  it('잠긴 개체만 가진 컬렉션은 발견 판정에서 빠진다 — 조회에 locked=false를 건다', async () => {
    await call()
    const locked = calls.filter((c) => c.table === 'inventory_items' && c.method === 'eq' && c.args[0] === 'locked')
    expect(locked.map((c) => c.args[1])).toEqual([false])
  })
})
