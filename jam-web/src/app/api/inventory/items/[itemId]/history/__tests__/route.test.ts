/**
 * GET /api/inventory/items/[itemId]/history — 잠긴 개체의 응답에 가림 대상 값이 없다 (티켓 20261018_0054 2회, 운영 로직 7.3절)
 * + 탈퇴한 유저의 이벤트가 빠지지 않고 `withdrawn`으로 실린다 (티켓 20261021_1249 2회, 운영 로직 17.2절):
 * 줍은 유저가 탈퇴한 picked_up · 최초 유저 드랍의 유저가 탈퇴한 obtained · 드랍한 유저가 탈퇴한 dropped는 withdrawn,
 * 시스템 드랍(드랍한 유저가 원래 없음)은 withdrawn이 아니다.
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

describe('이력 API — 탈퇴한 유저의 이벤트', () => {
  const drop = (over: Record<string, unknown>) => ({
    id: 'd1',
    dropper_user_id: null,
    picked_up_by: null,
    dropped_at: '2026-10-10T00:00:00Z',
    picked_up_at: null,
    source: 'user',
    poi: { name: '한강 쉼터' },
    ...over,
  })

  it('이력에 필요한 source 칸을 드랍에서 함께 읽는다', async () => {
    await get()

    expect(state.selected.find((s) => s.table === 'poi_drops')?.columns).toContain('source')
  })

  it('줍은 유저가 탈퇴했으면 picked_up 이벤트를 빠뜨리지 않고 withdrawn으로 싣는다', async () => {
    state.drops = [drop({ dropper_user_id: 'user-1', picked_up_at: '2026-10-11T00:00:00Z', picked_up_by: null })]

    const body = await (await get()).json()

    const pickedUp = body.events.find((e: { type: string }) => e.type === 'picked_up')
    expect(pickedUp).toEqual({
      type: 'picked_up',
      timestamp: '2026-10-11T00:00:00Z',
      user_id: '',
      username: null,
      withdrawn: true,
      poi_name: '한강 쉼터',
    })
  })

  it('최초 유저 드랍의 유저가 탈퇴했으면 obtained와 dropped 모두 withdrawn으로 싣는다', async () => {
    state.drops = [drop({})]

    const body = await (await get()).json()

    const byType = Object.fromEntries(body.events.map((e: { type: string }) => [e.type, e]))
    expect(byType.obtained).toMatchObject({ user_id: '', username: null, withdrawn: true })
    expect(byType.dropped).toMatchObject({ user_id: '', username: null, withdrawn: true })
    expect(body.events).toHaveLength(2)
  })

  it('시스템 드랍은 드랍한 유저가 원래 없으므로 withdrawn이 아니고 obtained도 생략한다', async () => {
    state.drops = [drop({ source: 'system' })]

    const body = await (await get()).json()

    expect(body.events).toEqual([
      { type: 'dropped', timestamp: '2026-10-10T00:00:00Z', user_id: '', username: null, poi_name: '한강 쉼터' },
    ])
  })

  it('살아 있는 유저의 드랍·픽업에는 withdrawn이 붙지 않는다', async () => {
    state.users = [
      { id: 'user-1', username: 'runner', display_name: '러너' },
      { id: 'user-2', username: 'walker', display_name: '워커' },
    ]
    state.drops = [drop({ dropper_user_id: 'user-2', picked_up_by: 'user-1', picked_up_at: '2026-10-11T00:00:00Z' })]

    const body = await (await get()).json()

    expect(body.events).toHaveLength(3)
    for (const ev of body.events) expect(ev).not.toHaveProperty('withdrawn')
    expect(body.events.find((e: { type: string }) => e.type === 'picked_up')).toMatchObject({ user_id: 'user-1', username: '러너' })
    expect(body.events.find((e: { type: string }) => e.type === 'dropped')).toMatchObject({ user_id: 'user-2', username: '워커' })
  })
})
