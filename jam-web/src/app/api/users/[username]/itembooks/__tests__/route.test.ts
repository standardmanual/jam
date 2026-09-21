/**
 * 유저 컬렉션 목록 API — 「N/M」이 공용 함수(computeBookCompletion)를 따르는지 확인 (티켓 20260921_1112)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const tables: Record<string, unknown[]> = {}

function chain(table: string) {
  const q: Record<string, unknown> = {}
  const self = () => q
  for (const m of ['select', 'eq', 'in', 'is', 'or', 'order']) q[m] = self
  q.single = () => Promise.resolve({ data: (tables[table] ?? [])[0] ?? null, error: null })
  q.maybeSingle = q.single
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(res)
  return q
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }),
  createServiceClient: () => ({ from: (t: string) => chain(t) }),
}))

import { GET } from '../route'

async function call() {
  const res = await GET(new Request('http://x'), { params: Promise.resolve({ username: 'me' }) })
  return (await res.json()).books as { totalBadgeCount: number; slottedCount: number; isCompleted: boolean }[]
}

describe('GET /api/users/[username]/itembooks', () => {
  beforeEach(() => {
    tables.users = [{ id: 'me' }]
    tables.inventory = [{ id: 'inv' }]
    tables.inventory_items = [
      { badge_id: 'b1', badge: { item_book_id: 'book', type: 'item', deleted_at: null } },
    ]
    tables.item_books = [{ id: 'book', name: '북', image_url: null, tribe: null }]
    tables.badges = [
      { id: 'b1', item_book_id: 'book', type: 'item', drop_excluded: false, rarity: 'common', created_at: '1' },
      { id: 'b2', item_book_id: 'book', type: 'item', drop_excluded: false, rarity: 'common', created_at: '2' },
      { id: 'b3', item_book_id: 'book', type: 'item', drop_excluded: true, rarity: 'common', created_at: '3' },
    ]
    tables.user_item_book_completions = []
  })

  it('드랍 제외 배지는 분모에서 빠지고, 제외 배지를 장착해도 분자에 세지 않는다', async () => {
    tables.user_item_book_slots = [
      { item_book_id: 'book', badge_id: 'b1' },
      { item_book_id: 'book', badge_id: 'b3' },
    ]
    const books = await call()
    expect(books[0].totalBadgeCount).toBe(2)
    expect(books[0].slottedCount).toBe(1)
    expect(books[0].isCompleted).toBe(false)
  })

  it('제외 배지를 뺀 나머지를 모두 장착하면 완성으로 표시한다', async () => {
    tables.user_item_book_slots = [
      { item_book_id: 'book', badge_id: 'b1' },
      { item_book_id: 'book', badge_id: 'b2' },
    ]
    const books = await call()
    expect(books[0].totalBadgeCount).toBe(2)
    expect(books[0].slottedCount).toBe(2)
    expect(books[0].isCompleted).toBe(true)
  })
})
