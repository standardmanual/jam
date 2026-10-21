/**
 * `pickLockedOpenTarget`·`readLockedOpenTarget` — ③ 버튼이 보낼 잠긴 개체 (티켓 20261021_1248 2회)
 *
 * 고정하는 것:
 * - 열기까지 남은 잼이 가장 적은 잠긴 개체를 고른다. 동점이면 먼저 얻은 개체다.
 * - 필요량이 없는 개체는 후보가 아니다. 후보가 없으면 null이다.
 * - 내 인벤토리의 잠긴 개체만, 사라지거나 드랍된 것은 빼고 읽는다(조건이 질의에 걸린다).
 * - 읽지 못하면 «없다(null)»로 접지 않고 던진다.
 * 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/onboarding-quest/__tests__/locked-target.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { pickLockedOpenTarget, readLockedOpenTarget, type LockedItemCandidate } from '../locked-target'

const USER_ID = 'user-locked-target-test'

const item = (over: Partial<LockedItemCandidate> & { id: string }): LockedItemCandidate => ({
  unlock_required: 5,
  unlock_filled: 0,
  obtained_at: '2026-10-21T00:00:00Z',
  ...over,
})

describe('pickLockedOpenTarget', () => {
  it('후보가 없으면 null', () => {
    expect(pickLockedOpenTarget([])).toBeNull()
  })

  it('필요량이 없는 개체는 후보가 아니다', () => {
    expect(pickLockedOpenTarget([item({ id: 'a', unlock_required: null })])).toBeNull()
  })

  it('열기까지 남은 잼이 가장 적은 개체를 고른다', () => {
    const picked = pickLockedOpenTarget([
      item({ id: 'a', unlock_required: 10 }),
      item({ id: 'b', unlock_required: 5 }),
      item({ id: 'c', unlock_required: 20 }),
    ])
    expect(picked).toEqual({ itemId: 'b', required: 5, filled: 0 })
  })

  it('이미 채운 양을 뺀 남은 양으로 비교한다', () => {
    const picked = pickLockedOpenTarget([
      item({ id: 'a', unlock_required: 5, unlock_filled: 0 }),
      item({ id: 'b', unlock_required: 20, unlock_filled: 18 }),
    ])
    expect(picked).toEqual({ itemId: 'b', required: 20, filled: 18 })
  })

  it('남은 양이 같으면 먼저 얻은 개체다', () => {
    const picked = pickLockedOpenTarget([
      item({ id: 'later', obtained_at: '2026-10-21T02:00:00Z' }),
      item({ id: 'earlier', obtained_at: '2026-10-21T01:00:00Z' }),
    ])
    expect(picked?.itemId).toBe('earlier')
  })

  it('채운 양이 비어 있으면 0으로 본다', () => {
    expect(pickLockedOpenTarget([item({ id: 'a', unlock_filled: null })])).toEqual({ itemId: 'a', required: 5, filled: 0 })
  })
})

interface FakeSpec {
  inventory?: { data?: unknown; error?: { message: string } }
  items?: { rows?: unknown[]; error?: { message: string } }
}

interface ItemQuery {
  eq: Array<[string, unknown]>
  is: Array<[string, unknown]>
  not: Array<[string, string, unknown]>
}

function makeFake(spec: FakeSpec) {
  const itemQuery: ItemQuery = { eq: [], is: [], not: [] }
  const inventoryEq: Array<[string, unknown]> = []
  const from = (table: string) => {
    const chain: Record<string, unknown> = {}
    chain.select = () => chain
    chain.eq = (column: string, value: unknown) => {
      if (table === 'inventory') inventoryEq.push([column, value])
      else itemQuery.eq.push([column, value])
      return chain
    }
    chain.is = (column: string, value: unknown) => {
      itemQuery.is.push([column, value])
      return chain
    }
    chain.not = (column: string, op: string, value: unknown) => {
      itemQuery.not.push([column, op, value])
      return chain
    }
    chain.limit = () => chain
    chain.maybeSingle = () =>
      Promise.resolve(spec.inventory?.error ? { data: null, error: spec.inventory.error } : { data: spec.inventory?.data ?? null, error: null })
    chain.then = (resolve: (r: { data: unknown[] | null; error: { message: string } | null }) => unknown) =>
      resolve(spec.items?.error ? { data: null, error: spec.items.error } : { data: spec.items?.rows ?? [], error: null })
    return chain
  }
  return { supabase: { from } as unknown as SupabaseClient, itemQuery, inventoryEq }
}

describe('readLockedOpenTarget', () => {
  it('내 인벤토리의 잠긴 개체만, 사라지거나 드랍된 것을 빼고 읽는다', async () => {
    const { supabase, itemQuery, inventoryEq } = makeFake({
      inventory: { data: { id: 'inv-1' } },
      items: { rows: [item({ id: 'a' })] },
    })

    const target = await readLockedOpenTarget(supabase, USER_ID)

    expect(target).toEqual({ itemId: 'a', required: 5, filled: 0 })
    expect(inventoryEq).toEqual([['user_id', USER_ID]])
    expect(itemQuery.eq).toEqual([
      ['inventory_id', 'inv-1'],
      ['locked', true],
    ])
    expect(itemQuery.is).toEqual([
      ['destroyed_at', null],
      ['dropped_at', null],
    ])
    expect(itemQuery.not).toEqual([['unlock_required', 'is', null]])
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
