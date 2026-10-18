/**
 * GET /api/inventory/items/[itemId]/history — 잠긴 개체의 응답에 가림 대상 값이 없다 (티켓 20261018_0054 2회, 운영 로직 7.3절)
 *
 * 이력 응답은 «얻은 날과 경로(obtained_by)»와 드랍·픽업 이벤트(지점 이름, 유저 이름)만 싣는다. 이름·그림·설명·컬렉션·트라이브·일련번호·배지 id는
 * 읽지도 싣지도 않는다. 잠긴 개체에서도 그렇다는 것을 응답 전체를 문자열로 만들어 고정하고, 내 개체가 아니면 열람할 수 없다는 기존 규칙도 함께 확인한다.
 * (화면의 이력 시트는 잠긴 상태에서 노출하지 않는다 — `LockedItemDetail`.)
 *
 * 실행: cd jam-web && npx vitest run "src/app/api/inventory/items/[itemId]/history/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, unknown> | null

const state = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  item: null as Row,
  inventory: { user_id: 'user-1' } as Row,
  drops: [] as Record<string, unknown>[],
  users: [{ id: 'user-1', username: 'runner', display_name: '러너' }] as Record<string, unknown>[],
  selected: [] as { table: string; columns: string }[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user }, error: null }) } }),
  createServiceClient: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {
        select: (columns: string) => {
          state.selected.push({ table, columns })
          return builder
        },
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        single: async () => ({ data: table === 'inventory_items' ? state.item : state.inventory, error: null }),
        then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
          resolve({ data: table === 'poi_drops' ? state.drops : state.users, error: null }),
      }
      return builder
    },
  }),
}))

import { GET } from '../route'

const ITEM_ID = '22222222-2222-4222-8222-222222222222'

const get = () => GET(new Request('http://localhost/api/inventory/items/x/history') as never, { params: Promise.resolve({ itemId: ITEM_ID }) })

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  state.user = { id: 'user-1' }
  state.item = { id: ITEM_ID, obtained_at: '2026-10-18T01:00:00Z', obtained_by: 'system_event', inventory_id: 'inv-1' }
  state.inventory = { user_id: 'user-1' }
  state.drops = []
  state.users = [{ id: 'user-1', username: 'runner', display_name: '러너' }]
  state.selected = []
})

describe('이력 API — 잠긴 개체', () => {
  it('얻은 날과 경로만 싣고 이름·그림·설명·컬렉션·트라이브·일련번호·배지 id는 없다', async () => {
    // 잠긴 개체 행에 가림 대상 값이 있어도(서비스 클라이언트가 읽은 값이 아니라 가정) 응답에 옮겨지지 않는다
    state.item = { ...(state.item as Record<string, unknown>), locked: true, badge_id: 'badge-secret', serial_number: 4242, serial_prefix: 'ZZZZ', name: '새어 나가면 안 되는 이름' }

    const res = await get()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.events).toEqual([
      { type: 'obtained', timestamp: '2026-10-18T01:00:00Z', user_id: 'user-1', username: '러너', obtained_by: 'system_event' },
    ])
    const serialized = JSON.stringify(body)
    for (const secret of ['badge-secret', 'badge_id', '4242', 'ZZZZ', '새어 나가면 안 되는 이름', 'serial', 'image', 'description', 'collection', 'tribe']) {
      expect(serialized, `응답에 ${secret}이 실렸다`).not.toContain(secret)
    }
  })

  it('개체 정보 표(badges·item_books·tribes)를 읽지 않고, 개체 행에서는 이력에 필요한 칸만 고른다', async () => {
    await get()

    const tables = state.selected.map((s) => s.table)
    expect(tables).not.toContain('badges')
    expect(tables).not.toContain('item_books')
    expect(tables).not.toContain('tribes')
    expect(state.selected.find((s) => s.table === 'inventory_items')?.columns).toBe('id, obtained_at, obtained_by, inventory_id')
  })

  it('내 개체가 아니면 403이고 이력을 싣지 않는다', async () => {
    state.inventory = { user_id: 'someone-else' }

    const res = await get()

    expect(res.status).toBe(403)
    expect(JSON.stringify(await res.json())).not.toContain('events')
  })

  it('로그인하지 않았으면 401이다', async () => {
    state.user = null

    expect((await get()).status).toBe(401)
  })
})
