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

/** 티켓 20261016_2340 3회-나 — 등급 필드. 옛 컬렉션은 기존 필드가 그대로이고 새 필드는 false·null·{}다. */
describe('GET /api/users/[username]/itembooks — 등급 필드(티켓 20261016_2340 3회-나)', () => {
  type Tiers = Record<string, { total: number; filled: number; complete: boolean; recorded: boolean }>
  async function callRaw() {
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ username: 'me' }) })
    return (await res.json()).books as Record<string, unknown>[]
  }

  beforeEach(() => {
    tables.users = [{ id: 'me' }]
    tables.inventory = [{ id: 'inv' }]
    tables.user_item_book_completions = []
    tables.user_item_book_tier_completions = []
  })

  it('옛 컬렉션은 기존 필드의 이름과 값이 그대로이고 새 필드는 tierMode false·tier null·tiers {}다', async () => {
    tables.inventory_items = [{ badge_id: 'b1', badge: { item_book_id: 'book', type: 'item', deleted_at: null } }]
    tables.item_books = [{ id: 'book', name: '북', image_url: null, tribe: null }]
    tables.badges = [
      { id: 'b1', item_book_id: 'book', type: 'item', drop_excluded: false, rarity: 'rare', created_at: '1' },
      { id: 'b2', item_book_id: 'book', type: 'item', drop_excluded: false, rarity: 'rare', created_at: '2' },
    ]
    tables.user_item_book_slots = [{ item_book_id: 'book', badge_id: 'b1' }]

    expect(await callRaw()).toEqual([
      {
        id: 'book',
        name: '북',
        image_url: null,
        tribe: null,
        totalBadgeCount: 2,
        slottedCount: 1,
        isCompleted: false,
        rarity: 'rare',
        tierMode: false,
        tier: null,
        tiers: {},
      },
    ])
  })

  describe('tier_mode 컬렉션', () => {
    beforeEach(() => {
      tables.inventory_items = [{ badge_id: 'c-a', badge: { item_book_id: 'book', type: 'item', deleted_at: null } }]
      tables.item_books = [{ id: 'book', name: '북', image_url: null, tier_mode: true, tribe: null }]
      tables.badges = [
        { id: 'c-a', item_book_id: 'book', type: 'item', drop_excluded: false, name: '가', rarity: 'common', created_at: '1' },
        { id: 'c-b', item_book_id: 'book', type: 'item', drop_excluded: false, name: '나', rarity: 'common', created_at: '2' },
        { id: 'r-a', item_book_id: 'book', type: 'item', drop_excluded: false, name: '가', rarity: 'rare', created_at: '3' },
      ]
    })

    it('꽂힌 등급을 tier로, 등급별 진행을 tiers로 돌려주고 기존 rarity 필드는 최초 등록 배지 등급 그대로다', async () => {
      tables.user_item_book_slots = [{ item_book_id: 'book', badge_id: 'r-a' }]

      const [b] = await callRaw()
      expect(b).toMatchObject({ tierMode: true, tier: 'rare', rarity: 'common', isCompleted: true })
      expect(b.tiers as Tiers).toEqual({
        common: { total: 2, filled: 0, complete: false, recorded: false },
        rare: { total: 1, filled: 1, complete: true, recorded: false },
      })
    })

    it('등급별 완성 기록이 있으면 장착을 풀어도 isCompleted true이고 그 등급만 recorded다', async () => {
      tables.user_item_book_slots = []
      tables.user_item_book_tier_completions = [{ item_book_id: 'book', tier: 'common' }]

      const [b] = await callRaw()
      expect(b.isCompleted).toBe(true)
      expect((b.tiers as Tiers).common).toMatchObject({ complete: false, recorded: true })
      expect((b.tiers as Tiers).rare).toMatchObject({ recorded: false })
    })
  })
})
