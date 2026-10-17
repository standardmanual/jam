/**
 * lib/inventory/lockedItem — 잠긴 개체 거부 코드·판정 (티켓 20261018_0051)
 *
 * 고정하는 것: 코드 값은 `locked_item_not_allowed` · 마이그레이션 231 트리거 오류 메시지 둘(`locked_item_cannot_be_slotted`,
 * `locked_item_cannot_be_dropped`)을 같은 거부로 알아본다 · `findLockedItemIds`는 locked = true인 id만 돌려주고 읽기 실패는 던진다.
 * 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/inventory/__tests__/lockedItem.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { findLockedItemIds, isLockedItemTriggerError, LOCKED_ITEM_NOT_ALLOWED_CODE } from '../lockedItem'

function fakeClient(result: { data: unknown; error: { message: string } | null }) {
  const calls: { table: string; inIds?: unknown; eq?: [string, unknown] }[] = []
  const client = {
    from: (table: string) => {
      const call: (typeof calls)[number] = { table }
      calls.push(call)
      const builder: Record<string, unknown> = {
        select: () => builder,
        in: (_col: string, ids: unknown) => {
          call.inIds = ids
          return builder
        },
        eq: (col: string, val: unknown) => {
          call.eq = [col, val]
          return builder
        },
        then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(onFulfilled, onRejected),
      }
      return builder
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

describe('LOCKED_ITEM_NOT_ALLOWED_CODE', () => {
  it('장착·믹스·드랍이 같은 코드를 쓴다', () => {
    expect(LOCKED_ITEM_NOT_ALLOWED_CODE).toBe('locked_item_not_allowed')
  })
})

describe('isLockedItemTriggerError', () => {
  it.each(['locked_item_cannot_be_slotted', 'locked_item_cannot_be_dropped'])('트리거 오류 %s를 알아본다', (message) => {
    expect(isLockedItemTriggerError({ message })).toBe(true)
    expect(isLockedItemTriggerError({ message: `ERROR: ${message} (P0001)` })).toBe(true)
  })

  it('다른 오류·빈 값은 아니다', () => {
    expect(isLockedItemTriggerError({ message: 'slot_insert_failed' })).toBe(false)
    expect(isLockedItemTriggerError({ message: null })).toBe(false)
    expect(isLockedItemTriggerError({})).toBe(false)
    expect(isLockedItemTriggerError(null)).toBe(false)
    expect(isLockedItemTriggerError(undefined)).toBe(false)
  })
})

describe('findLockedItemIds', () => {
  it('locked = true인 개체 id만 돌려준다', async () => {
    const { client, calls } = fakeClient({ data: [{ id: 'item-2' }], error: null })

    await expect(findLockedItemIds(client, ['item-1', 'item-2'])).resolves.toEqual(['item-2'])
    expect(calls).toEqual([{ table: 'inventory_items', inIds: ['item-1', 'item-2'], eq: ['locked', true] }])
  })

  it('잠긴 개체가 없으면 빈 배열이다', async () => {
    const { client } = fakeClient({ data: [], error: null })
    await expect(findLockedItemIds(client, ['item-1'])).resolves.toEqual([])
  })

  it('id가 없으면 조회하지 않는다', async () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    await expect(findLockedItemIds(client, [])).resolves.toEqual([])
    expect(calls).toEqual([])
  })

  it('읽기 실패는 던진다 — 잠긴 개체를 열린 것으로 보고 통과시키지 않는다', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'db down' } })
    await expect(findLockedItemIds(client, ['item-1'])).rejects.toThrow('잠긴 개체 조회 실패: db down')
  })
})
