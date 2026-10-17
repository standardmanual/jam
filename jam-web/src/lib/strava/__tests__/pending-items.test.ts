/**
 * strava/pending-items — 보류 조회와 고르기 호출 (티켓 20261017_1425)
 *
 * 고정하는 것:
 * - `countPendingItems`: 이 유저의 pending만 센다. 읽기 실패는 던진다.
 * - `getPendingItems`: 오래된 보류부터, 배지 이름·이미지·등급을 붙이고 빈칸 수와 골라야 할 개수(`min(빈칸, 보류 수)`)를 계산한다.
 *   보류가 없으면 빈 결과다.
 * - `resolvePendingItems`: RPC에 세션 유저와 고른 id를 넘기고, DB 함수의 거절 코드(`no_pending`·`invalid_selection`·`wrong_count`·
 *   `inventory_not_found`)를 값으로 돌려준다. RPC 오류·해석 불가 응답은 던진다.
 *
 * - 클라이언트·서버 경계: 계약 파일(`pending-items-contract.ts`)은 아무것도 가져오지 않고, `'use client'` 모듈은 서버 모듈(`pending-items.ts`)을 가져오지 않는다.
 *
 * 실제 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/pending-items.test.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { countPendingItems, getPendingItems, resolvePendingItems, SyncPendingItemsError } from '../pending-items'

const USER_ID = 'user-1'

interface FakeWorld {
  pendingRows?: { id: string; badge_id: string; rarity: string }[]
  pendingError?: { message: string }
  badges?: { id: string; name: string; image_url: string | null }[]
  badgeError?: { message: string }
  inventory?: { used_slots: number; max_slots: number } | null
  inventoryError?: { message: string }
  count?: number | null
  rpc?: { data: unknown; error: { message: string } | null }
}

interface Calls {
  eqs: Record<string, unknown>[]
  orders: string[]
  rpc: { name: string; args: Record<string, unknown> }[]
}

function makeFake(world: FakeWorld): { supabase: SupabaseClient; calls: Calls } {
  const calls: Calls = { eqs: [], orders: [], rpc: [] }
  const from = (table: string) => {
    const eqs: Record<string, unknown> = {}
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        eqs[col] = val
        return builder
      },
      in: () => builder,
      order: (col: string) => {
        calls.orders.push(col)
        return builder
      },
      maybeSingle: async () => ({ data: world.inventory ?? null, error: world.inventoryError ?? null }),
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        calls.eqs.push({ table, ...eqs })
        let result: unknown
        if (table === 'sync_pending_items' && world.count !== undefined) result = { count: world.count, error: world.pendingError ?? null }
        else if (table === 'sync_pending_items') result = { data: world.pendingRows ?? [], error: world.pendingError ?? null }
        else if (table === 'badges') result = { data: world.badges ?? [], error: world.badgeError ?? null }
        else result = { data: [], error: null }
        return Promise.resolve(result).then(onFulfilled, onRejected)
      },
    }
    return builder
  }
  const rpc = async (name: string, args: Record<string, unknown>) => {
    calls.rpc.push({ name, args })
    return world.rpc ?? { data: null, error: null }
  }
  return { supabase: { from, rpc } as unknown as SupabaseClient, calls }
}

describe('SyncPendingItemsError', () => {
  it('보류 개수를 들고 있다', () => {
    const error = new SyncPendingItemsError(4)
    expect(error).toBeInstanceOf(Error)
    expect(error.pendingCount).toBe(4)
    expect(error.name).toBe('SyncPendingItemsError')
  })
})

describe('countPendingItems', () => {
  it('이 유저의 pending 개수를 돌려준다', async () => {
    const { supabase, calls } = makeFake({ count: 5 })

    await expect(countPendingItems(supabase, USER_ID)).resolves.toBe(5)
    expect(calls.eqs).toEqual([{ table: 'sync_pending_items', user_id: USER_ID, status: 'pending' }])
  })

  it('개수가 비어 있으면(null) 0이다', async () => {
    const { supabase } = makeFake({ count: null })

    await expect(countPendingItems(supabase, USER_ID)).resolves.toBe(0)
  })

  it('읽기 실패는 던진다', async () => {
    const { supabase } = makeFake({ count: null, pendingError: { message: 'db down' } })

    await expect(countPendingItems(supabase, USER_ID)).rejects.toThrow('sync_pending_items 개수 조회 실패: db down')
  })
})

describe('getPendingItems', () => {
  it('보류가 없으면 빈 결과이고 배지·인벤토리를 읽지 않는다', async () => {
    const { supabase, calls } = makeFake({ pendingRows: [] })

    await expect(getPendingItems(supabase, USER_ID)).resolves.toEqual({ pendingCount: 0, freeSlots: 0, chooseCount: 0, items: [] })
    expect(calls.eqs.map((c) => c.table)).toEqual(['sync_pending_items'])
  })

  it('배지 이름·이미지·등급을 붙이고 오래된 보류부터 돌려준다', async () => {
    const { supabase, calls } = makeFake({
      pendingRows: [
        { id: 'p1', badge_id: 'b1', rarity: 'common' },
        { id: 'p2', badge_id: 'b2', rarity: 'rare' },
        { id: 'p3', badge_id: 'b1', rarity: 'common' },
      ],
      badges: [
        { id: 'b1', name: '첫 숨결', image_url: 'https://img/b1.png' },
        { id: 'b2', name: '바람길', image_url: null },
      ],
      inventory: { used_slots: 8, max_slots: 10 },
    })

    const payload = await getPendingItems(supabase, USER_ID)

    expect(payload.items).toEqual([
      { id: 'p1', badgeId: 'b1', name: '첫 숨결', imageUrl: 'https://img/b1.png', rarity: 'common' },
      { id: 'p2', badgeId: 'b2', name: '바람길', imageUrl: null, rarity: 'rare' },
      { id: 'p3', badgeId: 'b1', name: '첫 숨결', imageUrl: 'https://img/b1.png', rarity: 'common' },
    ])
    expect(calls.orders).toEqual(['created_at', 'id'])
    expect(calls.eqs[0]).toEqual({ table: 'sync_pending_items', user_id: USER_ID, status: 'pending' })
  })

  it('골라야 할 개수는 빈칸과 보류 수 중 작은 값이다', async () => {
    const rows = [
      { id: 'p1', badge_id: 'b1', rarity: 'common' },
      { id: 'p2', badge_id: 'b1', rarity: 'common' },
      { id: 'p3', badge_id: 'b1', rarity: 'common' },
    ]
    const badges = [{ id: 'b1', name: '첫 숨결', image_url: null }]

    const fewerFree = await getPendingItems(makeFake({ pendingRows: rows, badges, inventory: { used_slots: 8, max_slots: 10 } }).supabase, USER_ID)
    expect(fewerFree).toMatchObject({ pendingCount: 3, freeSlots: 2, chooseCount: 2 })

    const moreFree = await getPendingItems(makeFake({ pendingRows: rows, badges, inventory: { used_slots: 0, max_slots: 10 } }).supabase, USER_ID)
    expect(moreFree).toMatchObject({ pendingCount: 3, freeSlots: 10, chooseCount: 3 })
  })

  it('빈칸이 0이거나 사용 칸이 한도를 넘어도 골라야 할 개수는 0이다', async () => {
    const rows = [{ id: 'p1', badge_id: 'b1', rarity: 'common' }]
    const badges = [{ id: 'b1', name: '첫 숨결', image_url: null }]

    const full = await getPendingItems(makeFake({ pendingRows: rows, badges, inventory: { used_slots: 10, max_slots: 10 } }).supabase, USER_ID)
    expect(full).toMatchObject({ freeSlots: 0, chooseCount: 0 })

    const over = await getPendingItems(makeFake({ pendingRows: rows, badges, inventory: { used_slots: 12, max_slots: 10 } }).supabase, USER_ID)
    expect(over).toMatchObject({ freeSlots: 0, chooseCount: 0 })
  })

  it('배지 정보가 없는 보류도 목록에 남긴다(이름은 빈 문자열)', async () => {
    const { supabase } = makeFake({
      pendingRows: [{ id: 'p1', badge_id: 'gone', rarity: 'epic' }],
      badges: [],
      inventory: { used_slots: 0, max_slots: 5 },
    })

    const payload = await getPendingItems(supabase, USER_ID)

    expect(payload.items).toEqual([{ id: 'p1', badgeId: 'gone', name: '', imageUrl: null, rarity: 'epic' }])
  })

  it.each([
    ['보류', { pendingError: { message: 'x' } }, 'sync_pending_items 조회 실패'],
    ['배지', { pendingRows: [{ id: 'p1', badge_id: 'b1', rarity: 'common' }], badgeError: { message: 'x' } }, '보류 배지 조회 실패'],
    [
      '인벤토리',
      { pendingRows: [{ id: 'p1', badge_id: 'b1', rarity: 'common' }], inventoryError: { message: 'x' } },
      '인벤토리 조회 실패',
    ],
  ] as const)('%s 읽기 실패는 던진다', async (_name, world, message) => {
    const { supabase } = makeFake(world as FakeWorld)

    await expect(getPendingItems(supabase, USER_ID)).rejects.toThrow(message)
  })
})

describe('resolvePendingItems', () => {
  it('세션 유저와 고른 id로 resolve_sync_pending_items를 부르고 성공 결과를 돌려준다', async () => {
    const { supabase, calls } = makeFake({
      rpc: { data: { ok: true, granted: 2, discarded: 1, itemIds: ['i1', 'i2'] }, error: null },
    })

    const result = await resolvePendingItems(supabase, USER_ID, ['p1', 'p2'])

    expect(result).toEqual({ ok: true, granted: 2, discarded: 1, itemIds: ['i1', 'i2'] })
    expect(calls.rpc).toEqual([{ name: 'resolve_sync_pending_items', args: { p_user_id: USER_ID, p_chosen_ids: ['p1', 'p2'] } }])
  })

  it('빈 배열도 그대로 넘긴다(빈칸이 0일 때 전부 고르지 않음으로 닫는다)', async () => {
    const { supabase, calls } = makeFake({ rpc: { data: { ok: true, granted: 0, discarded: 3, itemIds: [] }, error: null } })

    await expect(resolvePendingItems(supabase, USER_ID, [])).resolves.toEqual({ ok: true, granted: 0, discarded: 3, itemIds: [] })
    expect(calls.rpc[0].args).toEqual({ p_user_id: USER_ID, p_chosen_ids: [] })
  })

  it('wrong_count는 골라야 할 개수(expected)와 함께 돌려준다', async () => {
    const { supabase } = makeFake({ rpc: { data: { ok: false, error: 'wrong_count', expected: 2 }, error: null } })

    await expect(resolvePendingItems(supabase, USER_ID, ['p1'])).resolves.toEqual({ ok: false, error: 'wrong_count', expected: 2 })
  })

  it.each(['no_pending', 'invalid_selection', 'inventory_not_found'] as const)('%s는 값으로 돌려준다', async (code) => {
    const { supabase } = makeFake({ rpc: { data: { ok: false, error: code }, error: null } })

    await expect(resolvePendingItems(supabase, USER_ID, ['p1'])).resolves.toEqual({ ok: false, error: code })
  })

  it('RPC 오류는 던진다', async () => {
    const { supabase } = makeFake({ rpc: { data: null, error: { message: 'permission denied' } } })

    await expect(resolvePendingItems(supabase, USER_ID, ['p1'])).rejects.toThrow('resolve_sync_pending_items RPC 오류: permission denied')
  })

  it.each([
    ['빈 응답', null],
    ['ok가 없는 응답', {}],
  ])('해석할 수 없는 응답(%s)은 던진다', async (_name, data) => {
    const { supabase } = makeFake({ rpc: { data, error: null } })

    await expect(resolvePendingItems(supabase, USER_ID, ['p1'])).rejects.toThrow('응답을 해석할 수 없다')
  })

  it('알 수 없는 오류 코드는 던진다', async () => {
    const { supabase } = makeFake({ rpc: { data: { ok: false, error: 'surprise' }, error: null } })

    await expect(resolvePendingItems(supabase, USER_ID, ['p1'])).rejects.toThrow('알 수 없는 오류 코드: surprise')
  })
})

describe('클라이언트·서버 경계 (소스 검색)', () => {
  const srcRoot = fileURLToPath(new URL('../../../', import.meta.url))

  function listSources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : listSources(full)
      return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [full] : []
    })
  }

  it('계약 파일은 import가 하나도 없다 — 클라이언트 번들에 서버 모듈이 끌려오지 않는다', () => {
    const contract = readFileSync(join(srcRoot, 'lib/strava/pending-items-contract.ts'), 'utf8')
    expect(contract).not.toMatch(/^\s*import\s/m)
    expect(contract).not.toMatch(/\bimport\(/)
  })

  it("'use client' 모듈은 서버 모듈 pending-items(계약 파일 제외)를 정적·동적으로 가져오지 않는다", () => {
    const offenders = listSources(srcRoot).filter((file) => {
      const source = readFileSync(file, 'utf8')
      const isClient = /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/.*\n\s*)*['"]use client['"]/.test(source)
      return isClient && /strava\/pending-items(?!-contract)['"]/.test(source)
    })
    expect(offenders).toEqual([])
  })
})
