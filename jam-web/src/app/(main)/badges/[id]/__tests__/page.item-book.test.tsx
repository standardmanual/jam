/**
 * 배지 상세 — 속한 컬렉션 카드는 «열람 가능»할 때만 그린다 (티켓 20261106_1230, T4)
 *
 *  - 켜진 컬렉션 소속 배지는 가진 것이 없어도 카드가 나온다(기존 그대로).
 *  - 꺼진 컬렉션 소속 배지는 이 화면 주인이 열린 개체를 가졌을 때만 카드가 나온다(링크 대상 `/collections/[id]`가 열린다).
 *  - 꺼진 컬렉션인데 가진 것이 없거나 잠긴 개체만 가졌으면 카드가 없다.
 *
 * 페이지 함수를 모의 Supabase로 직접 호출하고 요소 트리에서 `ListRowCard`를 찾는다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/badges/[id]/__tests__/page.item-book.test.tsx"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'

type Row = Record<string, unknown>

const NOW = '2026-11-06T03:00:00.000Z'

const state = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }))

function makeBuilder(table: string): unknown {
  const rows = state.tables[table] ?? []
  const builder: unknown = new Proxy(
    {},
    {
      get(_target, method) {
        if (typeof method !== 'string') return undefined
        if (method === 'then') {
          return (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null })
        }
        return () => {
          if (method === 'maybeSingle' || method === 'single') return Promise.resolve({ data: rows[0] ?? null, error: null })
          return builder
        }
      },
    }
  )
  return builder
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: (table: string) => makeBuilder(table),
  }),
  createServiceClient: () => ({ from: (table: string) => makeBuilder(table) }),
}))

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))

import BadgeDetailPage from '../page'

const BADGE_ID = '33333333-3333-4333-8333-333333333333'
const BOOK_ID = 'book-1'

const BADGE = {
  id: BADGE_ID,
  type: 'item',
  name: '새벽의 첫 바퀴',
  description: '새벽에 달린 기록',
  image_url: null,
  rarity: 'epic',
  item_book_id: BOOK_ID,
  deleted_at: null,
  background_color: null,
  background_shader_id: null,
  background_image_url: null,
  background_animation: null,
  condition_json: {},
}

function book(overrides: Row = {}): Row {
  return { id: BOOK_ID, name: '새벽 컬렉션', image_url: null, is_active: true, valid_from: null, valid_until: null, ...overrides }
}

function item(overrides: Row = {}): Row {
  return {
    id: 'item-1',
    serial_number: 7,
    serial_prefix: 'ABCD',
    obtained_at: '2026-10-18T01:00:00Z',
    expires_at: null,
    obtained_by: 'system_event',
    dropped_at: null,
    destroyed_at: null,
    locked: false,
    ...overrides,
  }
}

function call() {
  return BadgeDetailPage({ params: Promise.resolve({ id: BADGE_ID }), searchParams: Promise.resolve({}) })
}

function findAll(node: ReactNode, name: string, out: ReactElement<Record<string, unknown>>[] = []): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, name, out)
    return out
  }
  if (!isValidElement(node)) return out
  const element = node as ReactElement<Record<string, unknown>>
  if (typeof element.type === 'function' && element.type.name === name) out.push(element)
  findAll(element.props.children as ReactNode, name, out)
  return out
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NOW))
  state.tables = { badges: [BADGE], inventory: [{ id: 'inv-1' }], inventory_items: [], item_books: [book()] }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('배지 상세 — 컬렉션 카드', () => {
  it('켜진 컬렉션은 가진 것이 없어도 카드가 나온다', async () => {
    const cards = findAll(await call(), 'ListRowCard')
    expect(cards).toHaveLength(1)
    expect(cards[0].props.href).toBe(`/collections/${BOOK_ID}`)
  })

  it('꺼진 컬렉션(비활성)이어도 열린 개체를 가졌으면 카드가 나온다', async () => {
    state.tables.item_books = [book({ is_active: false })]
    state.tables.inventory_items = [item()]

    const cards = findAll(await call(), 'ListRowCard')
    expect(cards).toHaveLength(1)
    expect(cards[0].props.title).toBe('새벽 컬렉션')
  })

  it('꺼진 컬렉션(시작 전)이어도 열린 개체를 가졌으면 카드가 나온다', async () => {
    state.tables.item_books = [book({ valid_from: '2026-12-01T00:00:00+00:00' })]
    state.tables.inventory_items = [item()]

    expect(findAll(await call(), 'ListRowCard')).toHaveLength(1)
  })

  it('꺼진 컬렉션인데 가진 것이 없으면 카드가 없다', async () => {
    state.tables.item_books = [book({ is_active: false })]

    expect(findAll(await call(), 'ListRowCard')).toHaveLength(0)
  })

  it('꺼진 컬렉션인데 잠긴 개체만 가졌으면 카드가 없다(잠긴 개체는 컬렉션을 드러내지 않는다)', async () => {
    state.tables.item_books = [book({ is_active: false })]
    state.tables.inventory_items = [item({ locked: true })]

    expect(findAll(await call(), 'ListRowCard')).toHaveLength(0)
  })
})
