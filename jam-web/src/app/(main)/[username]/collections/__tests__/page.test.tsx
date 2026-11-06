/**
 * /{username}/collections — 다른 사람의 컬렉션 탭에서 꺼진·기간이 끝난·시작 전 컬렉션도 그 사람이 가졌으면 나온다
 * (티켓 20261106_1231, 2단계 T5)
 *
 * 모킹한 DB 가짜는 필터를 적용하지 않는다. «거름 조건을 걸지 않았다»는 item_books 조회에 건 조건(eq·or)을 기록해 확인하고,
 * 「슬롯이 없으면 안 나옴」은 페이지의 슬롯 거름으로 확인한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement, ReactNode } from 'react'

const tables: Record<string, unknown[]> = {}
const calls: { table: string; method: string; args: unknown[] }[] = []
const state = vi.hoisted(() => ({ viewerId: 'viewer' }))

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
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: state.viewerId } } }) } }),
  createServiceClient: () => ({ from: (t: string) => chain(t) }),
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`)
  },
}))

import UserItemBooksPage from '../page'

/** 렌더 트리에서 컬렉션 카드 링크(`/collections/{id}`)의 id를 모은다 */
function collectBookIds(node: ReactNode, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const n of node) collectBookIds(n, out)
    return out
  }
  if (!node || typeof node !== 'object') return out
  const el = node as ReactElement<{ href?: string; children?: ReactNode }>
  const href = el.props?.href
  if (typeof href === 'string' && href.startsWith('/collections/')) out.push(href.slice('/collections/'.length))
  collectBookIds(el.props?.children, out)
  return out
}

async function renderIds() {
  const element = (await UserItemBooksPage({ params: Promise.resolve({ username: 'target' }) })) as ReactElement
  return collectBookIds(element).sort()
}

const book = (id: string, extra: Record<string, unknown>) => ({ id, name: id, image_url: null, tribe: null, ...extra })

beforeEach(() => {
  calls.length = 0
  state.viewerId = 'viewer'
  tables.users = [{ id: 'target', username: 'target', display_name: '타겟' }]
  tables.inventory = [{ id: 'inv' }]
  tables.inventory_items = ['on', 'off', 'ended', 'future', 'noslot'].map((k) => ({
    badge_id: `${k}-1`,
    badge: { item_book_id: `book-${k}`, type: 'item', deleted_at: null },
  }))
  tables.item_books = [
    book('book-on', { is_active: true }),
    book('book-off', { is_active: false }),
    book('book-ended', { is_active: true, valid_until: '2020-01-01T00:00:00Z' }),
    book('book-future', { is_active: true, valid_from: '2999-01-01T00:00:00Z' }),
    book('book-noslot', { is_active: false }),
  ]
  tables.badges = ['on', 'off', 'ended', 'future', 'noslot'].map((k, i) => ({
    id: `${k}-1`,
    item_book_id: `book-${k}`,
    type: 'item',
    drop_excluded: false,
    rarity: 'common',
    created_at: String(i),
    name: k,
    deleted_at: null,
  }))
  tables.user_item_book_slots = ['on', 'off', 'ended', 'future'].map((k) => ({ item_book_id: `book-${k}`, badge_id: `${k}-1` }))
  tables.user_item_book_completions = []
})

describe('/{username}/collections — 다른 사람 프로필의 컬렉션 탭', () => {
  it('item_books 조회에 is_active·노출 기간 조건을 걸지 않는다', async () => {
    await renderIds()
    const bookCalls = calls.filter((c) => c.table === 'item_books')
    expect(bookCalls.length).toBeGreaterThan(0)
    expect(bookCalls.some((c) => c.method === 'or')).toBe(false)
    expect(bookCalls.some((c) => c.method === 'eq')).toBe(false)
  })

  it('꺼진·기간이 끝난·시작 전 컬렉션도 켜진 컬렉션과 함께 나온다', async () => {
    expect(await renderIds()).toEqual(['book-ended', 'book-future', 'book-off', 'book-on'])
  })

  it('슬롯이 없는 컬렉션은 나오지 않는다', async () => {
    expect(await renderIds()).not.toContain('book-noslot')
  })

  it('내 프로필이면 슬롯이 없어도 가진 컬렉션이 모두 나온다', async () => {
    state.viewerId = 'target'
    expect(await renderIds()).toEqual(['book-ended', 'book-future', 'book-noslot', 'book-off', 'book-on'])
  })
})
