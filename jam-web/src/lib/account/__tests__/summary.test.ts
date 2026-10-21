/**
 * getAccountSummary — 탈퇴 화면의 «지워지는 것» 수치 (티켓 20261021_1249 3회)
 * DB는 가짜다 — 공용 DB를 부르지 않는다.
 *
 * 고정하는 것: 체크인 배지는 반복 획득 행을 배지 종류로 합쳐 센다(1,000행을 넘겨도 끝까지 읽는다) · 지갑이 없으면 0 ·
 * 인벤토리가 없으면 아이템 0 · 끊긴 Strava 연결은 «연결 중»이 아니다 · 어느 조회가 실패해도 0으로 위장하지 않고 던진다 ·
 * 소프트 삭제된 배지와 없어짐 처리된 아이템은 센 쪽 조건(`deleted_at`·`destroyed_at` IS NULL)으로 거른다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/account/__tests__/summary.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { createServiceClient } from '@/lib/supabase/server'
import { getAccountSummary } from '../summary'

type ServiceClient = ReturnType<typeof createServiceClient>

const USER_ID = '00000000-0000-4000-8000-000000000001'

interface TableSetup {
  /** 단건(`maybeSingle`)과 목록 읽기가 돌려줄 행 */
  rows?: Record<string, unknown>[]
  /** `head: true` 개수 조회가 돌려줄 값 */
  count?: number
  error?: { message: string }
}

interface Call {
  table: string
  filters: [string, unknown][]
  isFilters: [string, unknown][]
}

function makeSupabase(tables: Record<string, TableSetup>) {
  const calls: Call[] = []
  const client = {
    from: (table: string) => {
      const setup = tables[table] ?? {}
      const call: Call = { table, filters: [], isFilters: [] }
      calls.push(call)
      let range: [number, number] | null = null
      const result = () => {
        if (setup.error) return { data: null, count: null, error: setup.error }
        const rows = setup.rows ?? []
        return {
          data: range ? rows.slice(range[0], range[1] + 1) : rows,
          count: setup.count ?? rows.length,
          error: null,
        }
      }
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          call.filters.push([column, value])
          return builder
        },
        is: (column: string, value: unknown) => {
          call.isFilters.push([column, value])
          return builder
        },
        order: () => builder,
        range: (from: number, to: number) => {
          range = [from, to]
          return Promise.resolve(result())
        },
        maybeSingle: async () => {
          const r = result()
          return { data: setup.error ? null : (setup.rows?.[0] ?? null), error: r.error }
        },
        // head 개수 조회는 await builder 로 끝난다
        then: (resolve: (value: unknown) => void) => resolve(result()),
      }
      return builder
    },
  } as unknown as ServiceClient
  return { client, calls }
}

const BASE: Record<string, TableSetup> = {
  user_activity_badges: { count: 12 },
  user_checkin_badge_earns: {
    rows: [
      { id: 'e1', badge_id: 'b1' },
      { id: 'e2', badge_id: 'b1' }, // 같은 배지 반복 획득
      { id: 'e3', badge_id: 'b2' },
    ],
  },
  inventory: { rows: [{ id: 'inv-1' }] },
  inventory_items: { count: 20 },
  jam_wallets: { rows: [{ balance: 340 }] },
  point_wallets: { rows: [{ balance: 1200 }] },
  strava_connections: { rows: [{ disconnected_at: null }] },
}

describe('getAccountSummary', () => {
  it('여섯 수치를 모아 돌려준다 — 체크인 배지는 반복 획득을 한 종류로 센다', async () => {
    const { client } = makeSupabase(BASE)

    expect(await getAccountSummary(client, USER_ID)).toEqual({
      activityBadgeCount: 12,
      checkinBadgeCount: 2,
      itemCount: 20,
      jamBalance: 340,
      pointBalance: 1200,
      stravaConnected: true,
    })
  })

  it('본인 id로만 읽고, 삭제된 배지와 없어짐 처리된 아이템은 조건으로 거른다', async () => {
    const { client, calls } = makeSupabase(BASE)

    await getAccountSummary(client, USER_ID)

    for (const table of ['user_activity_badges', 'user_checkin_badge_earns', 'inventory', 'jam_wallets', 'point_wallets', 'strava_connections']) {
      expect(calls.find((c) => c.table === table)?.filters, table).toContainEqual(['user_id', USER_ID])
    }
    expect(calls.find((c) => c.table === 'user_activity_badges')?.isFilters).toContainEqual(['badges.deleted_at', null])
    expect(calls.find((c) => c.table === 'user_checkin_badge_earns')?.isFilters).toContainEqual(['badges.deleted_at', null])
    const items = calls.find((c) => c.table === 'inventory_items')
    expect(items?.filters).toContainEqual(['inventory_id', 'inv-1'])
    expect(items?.isFilters).toContainEqual(['destroyed_at', null])
  })

  it('지갑 행이 없으면 0이고, 인벤토리가 없으면 아이템을 따로 세지 않고 0이다', async () => {
    const { client, calls } = makeSupabase({ ...BASE, jam_wallets: {}, point_wallets: {}, inventory: {} })

    const summary = await getAccountSummary(client, USER_ID)

    expect(summary.jamBalance).toBe(0)
    expect(summary.pointBalance).toBe(0)
    expect(summary.itemCount).toBe(0)
    expect(calls.some((c) => c.table === 'inventory_items')).toBe(false)
  })

  it('모든 값이 0이어도 0으로 돌려준다', async () => {
    const { client } = makeSupabase({
      user_activity_badges: { count: 0 },
      user_checkin_badge_earns: {},
      inventory: {},
      jam_wallets: {},
      point_wallets: {},
      strava_connections: {},
    })

    expect(await getAccountSummary(client, USER_ID)).toEqual({
      activityBadgeCount: 0,
      checkinBadgeCount: 0,
      itemCount: 0,
      jamBalance: 0,
      pointBalance: 0,
      stravaConnected: false,
    })
  })

  it('Strava 연결이 없거나 끊겼으면 연결 중이 아니다', async () => {
    const none = makeSupabase({ ...BASE, strava_connections: {} })
    expect((await getAccountSummary(none.client, USER_ID)).stravaConnected).toBe(false)

    const disconnected = makeSupabase({
      ...BASE,
      strava_connections: { rows: [{ disconnected_at: '2026-10-10T00:00:00.000Z' }] },
    })
    expect((await getAccountSummary(disconnected.client, USER_ID)).stravaConnected).toBe(false)
  })

  it('체크인 배지 행이 1,000행을 넘어도 끝까지 읽어 종류를 센다', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: `e${i}`, badge_id: `b${i % 1200}` }))
    const { client } = makeSupabase({ ...BASE, user_checkin_badge_earns: { rows } })

    expect((await getAccountSummary(client, USER_ID)).checkinBadgeCount).toBe(1200)
  })

  it.each([
    'user_activity_badges',
    'user_checkin_badge_earns',
    'inventory',
    'inventory_items',
    'jam_wallets',
    'point_wallets',
    'strava_connections',
  ])('%s 조회가 실패하면 0으로 위장하지 않고 던진다', async (table) => {
    const { client } = makeSupabase({ ...BASE, [table]: { error: { message: 'db down' } } })

    await expect(getAccountSummary(client, USER_ID)).rejects.toThrow('db down')
  })
})
