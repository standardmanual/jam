/**
 * `toLockedOpenTarget`·`readLockedOpenTarget`·`readPointBalance` — ② 버튼이 보낼 잠긴 개체 (티켓 20261021_1248 2회, 포인트 기준 20261028_1738 1회)
 *
 * 고정하는 것:
 * - 열기까지 드는 포인트(`unlock_points_required`)가 가장 적은 개체를 DB가 정렬해 한 건만 읽는다: 포인트 오름차순, 비어 있는 값은 뒤,
 *   동점이면 `obtained_at`, 그래도 같으면 `id`. 정렬은 DB의 일이라 질의에 걸린 정렬 조건과 `limit(1)`을 고정한다.
 * - 맨 앞 개체의 필요 포인트가 비어 있으면(모든 개체가 비어 있음) «개체를 모른다»(null)다. 0은 «포인트 없이 열 수 있다»라 개체다.
 * - 내 인벤토리의 잠긴 개체만, 사라지거나 드랍된 것은 빼고 읽는다(조건이 질의에 걸린다).
 * - 읽지 못하면 «없다(null)»로 접지 않고 던진다.
 * - 가진 포인트는 지갑 행이 없으면 0이고, 읽지 못하면 던진다.
 * 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/onboarding-quest/__tests__/locked-target.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readLockedOpenTarget, readPointBalance, toLockedOpenTarget } from '../locked-target'

const USER_ID = 'user-locked-target-test'

describe('toLockedOpenTarget', () => {
  it('행이 없으면 null', () => {
    expect(toLockedOpenTarget(undefined)).toBeNull()
    expect(toLockedOpenTarget(null)).toBeNull()
  })

  it('필요 포인트가 비어 있는 개체는 개체를 모르는 것과 같다', () => {
    expect(toLockedOpenTarget({ id: 'a', unlock_points_required: null })).toBeNull()
  })

  it('필요 포인트가 있으면 id와 함께 싣는다', () => {
    expect(toLockedOpenTarget({ id: 'a', unlock_points_required: 30 })).toEqual({ itemId: 'a', pointsRequired: 30 })
  })

  it('필요 포인트 0은 «포인트 없이 열 수 있다»는 값이라 개체로 싣는다', () => {
    expect(toLockedOpenTarget({ id: 'a', unlock_points_required: 0 })).toEqual({ itemId: 'a', pointsRequired: 0 })
  })
})

interface FakeSpec {
  inventory?: { data?: unknown; error?: { message: string } }
  items?: { rows?: unknown[]; error?: { message: string } }
  wallet?: { data?: unknown; error?: { message: string } }
}

interface ItemQuery {
  select: string[]
  eq: Array<[string, unknown]>
  is: Array<[string, unknown]>
  order: Array<[string, { ascending?: boolean; nullsFirst?: boolean } | undefined]>
  limit: number | null
}

function makeFake(spec: FakeSpec) {
  const itemQuery: ItemQuery = { select: [], eq: [], is: [], order: [], limit: null }
  const inventoryEq: Array<[string, unknown]> = []
  const walletEq: Array<[string, unknown]> = []
  const from = (table: string) => {
    const chain: Record<string, unknown> = {}
    chain.select = (columns: string) => {
      if (table === 'inventory_items') itemQuery.select.push(columns)
      return chain
    }
    chain.eq = (column: string, value: unknown) => {
      if (table === 'inventory') inventoryEq.push([column, value])
      else if (table === 'point_wallets') walletEq.push([column, value])
      else itemQuery.eq.push([column, value])
      return chain
    }
    chain.is = (column: string, value: unknown) => {
      itemQuery.is.push([column, value])
      return chain
    }
    chain.order = (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => {
      itemQuery.order.push([column, options])
      return chain
    }
    chain.limit = (n: number) => {
      itemQuery.limit = n
      return chain
    }
    chain.maybeSingle = () => {
      if (table === 'point_wallets') {
        return Promise.resolve(spec.wallet?.error ? { data: null, error: spec.wallet.error } : { data: spec.wallet?.data ?? null, error: null })
      }
      return Promise.resolve(spec.inventory?.error ? { data: null, error: spec.inventory.error } : { data: spec.inventory?.data ?? null, error: null })
    }
    chain.then = (resolve: (r: { data: unknown[] | null; error: { message: string } | null }) => unknown) =>
      resolve(spec.items?.error ? { data: null, error: spec.items.error } : { data: spec.items?.rows ?? [], error: null })
    return chain
  }
  return { supabase: { from } as unknown as SupabaseClient, itemQuery, inventoryEq, walletEq }
}

describe('readLockedOpenTarget', () => {
  it('내 인벤토리의 잠긴 개체만, 사라지거나 드랍된 것을 빼고 읽는다', async () => {
    const { supabase, itemQuery, inventoryEq } = makeFake({
      inventory: { data: { id: 'inv-1' } },
      items: { rows: [{ id: 'a', unlock_points_required: 30 }] },
    })

    const target = await readLockedOpenTarget(supabase, USER_ID)

    expect(target).toEqual({ itemId: 'a', pointsRequired: 30 })
    expect(inventoryEq).toEqual([['user_id', USER_ID]])
    expect(itemQuery.select).toEqual(['id, unlock_points_required'])
    expect(itemQuery.eq).toEqual([
      ['inventory_id', 'inv-1'],
      ['locked', true],
    ])
    expect(itemQuery.is).toEqual([
      ['destroyed_at', null],
      ['dropped_at', null],
    ])
  })

  it('DB에서 포인트 오름차순(비어 있는 값은 뒤), 먼저 얻은 순, id 순으로 정렬해 한 건만 읽는다', async () => {
    const { supabase, itemQuery } = makeFake({
      inventory: { data: { id: 'inv-1' } },
      items: { rows: [{ id: 'a', unlock_points_required: 0 }] },
    })

    await readLockedOpenTarget(supabase, USER_ID)

    expect(itemQuery.order).toEqual([
      ['unlock_points_required', { ascending: true, nullsFirst: false }],
      ['obtained_at', { ascending: true }],
      ['id', { ascending: true }],
    ])
    expect(itemQuery.limit).toBe(1)
  })

  it('필요 포인트 0인 개체가 맨 앞이면 포인트 없이 열 수 있는 개체로 돌려준다', async () => {
    const { supabase } = makeFake({ inventory: { data: { id: 'inv-1' } }, items: { rows: [{ id: 'free', unlock_points_required: 0 }] } })
    expect(await readLockedOpenTarget(supabase, USER_ID)).toEqual({ itemId: 'free', pointsRequired: 0 })
  })

  it('맨 앞 개체의 필요 포인트가 비어 있으면(전부 비어 있음) 개체를 모르는 것으로 접는다', async () => {
    const { supabase } = makeFake({ inventory: { data: { id: 'inv-1' } }, items: { rows: [{ id: 'a', unlock_points_required: null }] } })
    expect(await readLockedOpenTarget(supabase, USER_ID)).toBeNull()
  })

  it('인벤토리 행이 없으면 개체를 읽지 않고 null이다', async () => {
    const { supabase, itemQuery } = makeFake({ inventory: { data: null } })
    expect(await readLockedOpenTarget(supabase, USER_ID)).toBeNull()
    expect(itemQuery.eq).toEqual([])
  })

  it('잠긴 개체가 없으면 null이다', async () => {
    const { supabase } = makeFake({ inventory: { data: { id: 'inv-1' } }, items: { rows: [] } })
    expect(await readLockedOpenTarget(supabase, USER_ID)).toBeNull()
  })

  it('인벤토리를 읽지 못하면 던진다', async () => {
    const { supabase } = makeFake({ inventory: { error: { message: 'boom' } } })
    await expect(readLockedOpenTarget(supabase, USER_ID)).rejects.toThrow('잠긴 개체 읽기 실패 (inventory): boom')
  })

  it('개체를 읽지 못하면 «없다»로 접지 않고 던진다', async () => {
    const { supabase } = makeFake({ inventory: { data: { id: 'inv-1' } }, items: { error: { message: 'down' } } })
    await expect(readLockedOpenTarget(supabase, USER_ID)).rejects.toThrow('잠긴 개체 읽기 실패 (inventory_items): down')
  })
})

describe('readPointBalance', () => {
  it('지갑의 잔액을 돌려준다', async () => {
    const { supabase, walletEq } = makeFake({ wallet: { data: { balance: 42 } } })
    expect(await readPointBalance(supabase, USER_ID)).toBe(42)
    expect(walletEq).toEqual([['user_id', USER_ID]])
  })

  it('지갑 행이 없으면 0이다', async () => {
    const { supabase } = makeFake({ wallet: { data: null } })
    expect(await readPointBalance(supabase, USER_ID)).toBe(0)
  })

  it('읽지 못하면 0으로 접지 않고 던진다', async () => {
    const { supabase } = makeFake({ wallet: { error: { message: 'down' } } })
    await expect(readPointBalance(supabase, USER_ID)).rejects.toThrow('가진 포인트 읽기 실패 (point_wallets): down')
  })
})
