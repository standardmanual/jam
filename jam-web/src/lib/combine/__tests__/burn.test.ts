/**
 * 재료 소각 단계 `burnMaterials()` (티켓 20261022_2119 2회)
 *
 * 믹스(`combineRecipeAttempt`)에서 뽑아낸 단계다. 믹스 쪽 동작은 `combine-engine.test.ts`가 그대로 고정하고, 이 시험은 단계 자체를 본다.
 *  - 정상: 개체를 소프트 삭제하고(`destroyed_at` 세움·`inventory_id` 비움, 내 인벤토리·아직 파괴되지 않은 개체만), 개수만큼 칸을 반환하고,
 *    개체마다 Consume 이벤트를 남긴다. 로컬 `inventory.used_slots`는 RPC가 돌려준 값으로 갱신된다
 *  - 소각 오류·행 수 불일치(동시 시도)는 `{ ok: false }`이고 칸 반환·Consume 이벤트로 이어 가지 않는다
 *  - 칸 반환·Consume 이벤트의 실패는 로그만 남기고 `{ ok: true }`다(소각은 이미 확정됐다)
 *
 * 실행: cd jam-web && npx vitest run src/lib/combine/__tests__/burn.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { createServiceClient } from '@/lib/supabase/server'
import { burnMaterials, type InventorySlotState } from '../burn'

type ServiceClient = ReturnType<typeof createServiceClient>

const USER = 'user-1'
const ITEM_IDS = ['item-1', 'item-2', 'item-3']

interface Stub {
  /** 소각 UPDATE가 돌려줄 값 */
  destroyResult: { data: { id: string }[] | null; error: { message: string } | null }
  /** `release_inventory_slots` RPC 응답 */
  releaseResult: { data: unknown; error: { message: string } | null }
  /** Consume 이벤트 insert 오류 */
  consumeError: { message: string } | null
  calls: string[]
  update: { payload: unknown; eq: Record<string, unknown>; in: Record<string, unknown>; isNull: string[] } | null
  releaseArgs: Record<string, unknown> | null
  consumeRows: unknown
}

let stub: Stub

function makeClient(): ServiceClient {
  const client = {
    from: (table: string) => {
      const state = { op: 'select' as 'select' | 'update' | 'insert', payload: undefined as unknown, eq: {} as Record<string, unknown>, in: {} as Record<string, unknown>, isNull: [] as string[] }
      const builder: Record<string, unknown> = {
        update: (payload: unknown) => {
          state.op = 'update'
          state.payload = payload
          return builder
        },
        insert: async (payload: unknown) => {
          stub.calls.push(`insert:${table}`)
          stub.consumeRows = payload
          return { data: null, error: stub.consumeError }
        },
        select: () => {
          // 소각 UPDATE는 `.select('id')`까지 이어 붙인 뒤 await 된다
          return builder
        },
        eq: (column: string, value: unknown) => {
          state.eq[column] = value
          return builder
        },
        in: (column: string, values: unknown) => {
          state.in[column] = values
          return builder
        },
        is: (column: string) => {
          state.isNull.push(column)
          return builder
        },
        maybeSingle: async () => {
          stub.calls.push(`select:${table}`)
          return { data: { username: '테스터' }, error: null }
        },
        then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
          if (state.op === 'update' && table === 'inventory_items') {
            stub.calls.push('update:inventory_items')
            stub.update = { payload: state.payload, eq: state.eq, in: state.in, isNull: state.isNull }
            return Promise.resolve(stub.destroyResult).then(onFulfilled, onRejected)
          }
          return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected)
        },
      }
      return builder
    },
    rpc: async (fnName: string, args: Record<string, unknown>) => {
      stub.calls.push(`rpc:${fnName}`)
      if (fnName === 'release_inventory_slots') stub.releaseArgs = args
      return stub.releaseResult
    },
  }
  return client as unknown as ServiceClient
}

function inventory(): InventorySlotState {
  return { id: 'inv-1', used_slots: 8, max_slots: 10 }
}

beforeEach(() => {
  stub = {
    destroyResult: { data: ITEM_IDS.map((id) => ({ id })), error: null },
    releaseResult: { data: { ok: true, usedSlots: 5 }, error: null },
    consumeError: null,
    calls: [],
    update: null,
    releaseArgs: null,
    consumeRows: null,
  }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('정상 소각', () => {
  it('내 인벤토리의 아직 파괴되지 않은 개체를 소프트 삭제하고 칸을 반환하고 Consume 이벤트를 남긴다', async () => {
    const inv = inventory()
    const result = await burnMaterials(makeClient(), { userId: USER, inventory: inv, itemIds: ITEM_IDS, logPrefix: '[시험]' })

    expect(result).toEqual({ ok: true, destroyedCount: 3 })
    // 소프트 삭제 — destroyed_at을 세우고 inventory_id를 비운다
    const payload = stub.update?.payload as { destroyed_at: string; inventory_id: null }
    expect(typeof payload.destroyed_at).toBe('string')
    expect(Number.isNaN(Date.parse(payload.destroyed_at))).toBe(false)
    expect(payload.inventory_id).toBeNull()
    // 대상: 요청한 개체 전부, 내 인벤토리, 아직 파괴되지 않은 것만
    expect(stub.update?.in).toEqual({ id: ITEM_IDS })
    expect(stub.update?.eq).toEqual({ inventory_id: 'inv-1' })
    expect(stub.update?.isNull).toEqual(['destroyed_at'])
    // 칸 반환 — 소각한 개수만큼, 로컬 사본도 RPC 값으로 갱신
    expect(stub.releaseArgs).toEqual({ p_inventory_id: 'inv-1', p_count: 3 })
    expect(inv.used_slots).toBe(5)
    // Consume 이벤트 — 개체마다 하나, 행위자 유저명 스냅샷
    expect(stub.consumeRows).toEqual(
      ITEM_IDS.map((id) => ({ inventory_item_id: id, event_type: 'Consume', actor_user_id: USER, actor_username: '테스터' }))
    )
  })

  it('순서는 소각 → 칸 반환 → 유저명 읽기 → Consume 이벤트다', async () => {
    await burnMaterials(makeClient(), { userId: USER, inventory: inventory(), itemIds: ITEM_IDS, logPrefix: '[시험]' })

    expect(stub.calls).toEqual([
      'update:inventory_items',
      'rpc:release_inventory_slots',
      'select:users',
      'insert:custody_events',
    ])
  })
})

describe('소각 실패 — 이어 가지 않는다', () => {
  it('소각 UPDATE가 오류를 내면 { ok: false }이고 칸 반환·Consume 이벤트를 하지 않는다', async () => {
    stub.destroyResult = { data: null, error: { message: 'db down' } }
    const inv = inventory()

    const result = await burnMaterials(makeClient(), { userId: USER, inventory: inv, itemIds: ITEM_IDS, logPrefix: '[시험]' })

    expect(result).toEqual({ ok: false })
    expect(stub.calls).toEqual(['update:inventory_items'])
    expect(inv.used_slots).toBe(8)
  })

  it('소각된 행 수가 요청한 개수와 다르면(동시 시도) { ok: false }이고 칸 반환·Consume 이벤트를 하지 않는다', async () => {
    stub.destroyResult = { data: [{ id: 'item-1' }], error: null }

    const result = await burnMaterials(makeClient(), { userId: USER, inventory: inventory(), itemIds: ITEM_IDS, logPrefix: '[시험]' })

    expect(result).toEqual({ ok: false })
    expect(stub.calls).toEqual(['update:inventory_items'])
  })

  it('소각된 행이 하나도 없어도(응답이 null이어도) { ok: false }다', async () => {
    stub.destroyResult = { data: null, error: null }

    const result = await burnMaterials(makeClient(), { userId: USER, inventory: inventory(), itemIds: ITEM_IDS, logPrefix: '[시험]' })

    expect(result).toEqual({ ok: false })
  })

  it('실패 로그는 호출부가 넘긴 머리말로 시작한다', async () => {
    stub.destroyResult = { data: null, error: { message: 'db down' } }

    await burnMaterials(makeClient(), { userId: USER, inventory: inventory(), itemIds: ITEM_IDS, logPrefix: '[tierUp]' })

    expect(console.error).toHaveBeenCalledWith('[tierUp] 아이템 소각 오류:', { message: 'db down' })
  })
})

describe('소각 이후 단계의 실패 — 소각은 확정이라 { ok: true }로 이어 간다', () => {
  it('칸 반환 RPC가 오류를 내면 로그만 남기고 로컬 칸 수는 그대로다', async () => {
    stub.releaseResult = { data: null, error: { message: 'rpc down' } }
    const inv = inventory()

    const result = await burnMaterials(makeClient(), { userId: USER, inventory: inv, itemIds: ITEM_IDS, logPrefix: '[시험]' })

    expect(result).toEqual({ ok: true, destroyedCount: 3 })
    expect(inv.used_slots).toBe(8)
    expect(stub.calls).toContain('insert:custody_events')
    expect(console.error).toHaveBeenCalledWith('[시험] release_inventory_slots RPC 오류:', { message: 'rpc down' })
  })

  it('칸 반환이 ok: false로 돌아오면 로그만 남기고 이어 간다', async () => {
    stub.releaseResult = { data: { ok: false, reason: 'inventory_not_found' }, error: null }
    const inv = inventory()

    const result = await burnMaterials(makeClient(), { userId: USER, inventory: inv, itemIds: ITEM_IDS, logPrefix: '[시험]' })

    expect(result).toEqual({ ok: true, destroyedCount: 3 })
    expect(inv.used_slots).toBe(8)
    expect(console.error).toHaveBeenCalledWith('[시험] release_inventory_slots 실패:', 'inventory_not_found')
  })

  it('Consume 이벤트 기록이 실패해도 { ok: true }다', async () => {
    stub.consumeError = { message: 'insert failed' }

    const result = await burnMaterials(makeClient(), { userId: USER, inventory: inventory(), itemIds: ITEM_IDS, logPrefix: '[시험]' })

    expect(result).toEqual({ ok: true, destroyedCount: 3 })
    expect(console.error).toHaveBeenCalledWith('[시험] Consume 이벤트 기록 오류:', { message: 'insert failed' })
  })
})
