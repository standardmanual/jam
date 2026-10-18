/**
 * 배지 상세 페이지 — 잠긴 개체의 가림 (티켓 20261018_0054 2회, 운영 로직 7.3절)
 *
 * `/badges/[id]?item=<개체 id>`가 잠긴 개체를 가리킬 때 이 화면은 배지 이름·그림·일련번호를 그리면 안 된다.
 *  - 내 잠긴 개체를 `?item`으로 지목하면 화면을 그리지 않고 `/inventory/[itemId]`(잠긴 상세)로 보낸다.
 *  - 그 밖의 경우에도 잠긴 개체는 보유 목록에서 빠진다: 대표 일련번호, 이력 목록, 획득 여부, 만료 안내가 잠긴 개체의 값으로 채워지지 않는다.
 *  - 열린 개체는 기존 그대로다.
 *
 * 페이지 함수를 모의 Supabase로 직접 호출하고, 돌려받은 React 요소 트리(렌더 전)를 훑어 값을 확인한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/badges/[id]/__tests__/page.locked.test.tsx"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'

type Row = Record<string, unknown>

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
const LOCKED_ID = '22222222-2222-4222-8222-222222222222'
const OPEN_ID = '55555555-5555-4555-8555-555555555555'

const BADGE = {
  id: BADGE_ID,
  type: 'item',
  name: '새벽의 첫 바퀴',
  description: '새벽에 달린 기록',
  image_url: null,
  rarity: 'epic',
  item_book_id: null,
  deleted_at: null,
  background_color: null,
  background_shader_id: null,
  background_image_url: null,
  background_animation: null,
  condition_json: {},
}

function item(id: string, extra: Row = {}): Row {
  return {
    id,
    serial_number: id === LOCKED_ID ? 4242 : 7,
    serial_prefix: id === LOCKED_ID ? 'ZZZZ' : 'ABCD',
    obtained_at: '2026-10-18T01:00:00Z',
    expires_at: null,
    obtained_by: 'system_event',
    dropped_at: null,
    destroyed_at: null,
    locked: false,
    ...extra,
  }
}

function call(searchParams: Record<string, string> = {}) {
  return BadgeDetailPage({ params: Promise.resolve({ id: BADGE_ID }), searchParams: Promise.resolve(searchParams) })
}

/** 렌더 전의 요소 트리에서 컴포넌트 이름으로 요소를 모두 찾는다 */
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
  state.tables = {
    badges: [BADGE],
    inventory: [{ id: 'inv-1' }],
    inventory_items: [],
  }
})

describe('배지 상세 — 잠긴 개체의 가림', () => {
  it('?item이 내 잠긴 개체를 가리키면 화면을 그리지 않고 잠긴 상세로 보낸다', async () => {
    state.tables.inventory_items = [item(LOCKED_ID, { locked: true }), item(OPEN_ID)]

    await expect(call({ item: LOCKED_ID })).rejects.toThrow(`NEXT_REDIRECT:/inventory/${LOCKED_ID}`)
  })

  it('?item이 없어도 잠긴 개체의 일련번호가 대표 일련번호로 쓰이지 않는다(열린 개체가 대표다)', async () => {
    state.tables.inventory_items = [item(LOCKED_ID, { locked: true, obtained_at: '2026-10-19T01:00:00Z' }), item(OPEN_ID)]

    const page = await call()

    const serials = findAll(page, 'ItemSerialCode')
    expect(serials).toHaveLength(1)
    expect(serials[0].props.code).toBe('ABCD000007')
    const history = findAll(page, 'ItemEarnHistory')
    expect(JSON.stringify(history[0]?.props.items)).not.toContain('ZZZZ')
    expect(JSON.stringify(history[0]?.props.items)).not.toContain('4242')
  })

  it('잠긴 개체만 가진 경우 일련번호와 이력이 비고 획득한 것으로 취급하지 않는다', async () => {
    state.tables.inventory_items = [item(LOCKED_ID, { locked: true })]

    const page = await call()

    expect(findAll(page, 'ItemSerialCode')).toHaveLength(0)
    expect(findAll(page, 'ItemEarnHistory')).toHaveLength(0)
    const hero = findAll(page, 'BadgeHeroSection')
    expect(hero[0].props.hasEarned).toBe(false)
  })

  it('열린 개체는 기존대로 일련번호와 이력이 나온다', async () => {
    state.tables.inventory_items = [item(OPEN_ID)]

    const page = await call({ item: OPEN_ID })

    expect(findAll(page, 'ItemSerialCode')[0].props.code).toBe('ABCD000007')
    expect(findAll(page, 'BadgeHeroSection')[0].props.hasEarned).toBe(true)
  })

  it('잠겼다가 열린 개체(locked false)는 ?item으로 지목해도 리다이렉트하지 않는다', async () => {
    state.tables.inventory_items = [item(OPEN_ID, { locked: false })]

    await expect(call({ item: OPEN_ID })).resolves.toBeTruthy()
  })

  it('locked 값이 없는 옛 행도 열린 개체로 본다', async () => {
    state.tables.inventory_items = [item(OPEN_ID, { locked: undefined })]

    const page = await call({ item: OPEN_ID })

    expect(findAll(page, 'ItemSerialCode')).toHaveLength(1)
  })
})
