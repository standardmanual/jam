import {
  DESTROY_ERROR_LABEL,
  REASSIGN_ERROR_LABEL,
  classifyOwnerless,
  destroyOrphanedItems,
  reassignOrphanedItems,
  summarizeDestroyImpact,
  summarizeReassignImpact,
  toBulkResult,
  type OrphanedItemInfo,
} from '../orphaned-item-actions'

function info(overrides: Partial<OrphanedItemInfo> & Pick<OrphanedItemInfo, 'id'>): OrphanedItemInfo {
  return { badgeId: 'b1', serialLabel: 'A1', inventoryId: null, destroyedAt: null, ...overrides }
}

function infosOf(...items: OrphanedItemInfo[]) {
  return new Map(items.map((i) => [i.id, i]))
}

describe('classifyOwnerless', () => {
  it('소유자 없고 폐기되지 않은 개체만 처리 대상이다', () => {
    const infos = infosOf(
      info({ id: 'ok1' }),
      info({ id: 'owned', serialLabel: 'B2', inventoryId: 'inv1' }),
      info({ id: 'gone', serialLabel: 'C3', destroyedAt: '2026-09-01T00:00:00Z' })
    )

    const { eligible, skipped } = classifyOwnerless(['ok1', 'owned', 'gone', 'missing'], infos)

    expect(eligible).toEqual(['ok1'])
    expect(skipped).toEqual([
      { id: 'owned', label: '#B2', reason: DESTROY_ERROR_LABEL.not_orphaned },
      { id: 'gone', label: '#C3', reason: DESTROY_ERROR_LABEL.already_destroyed },
      { id: 'missing', reason: DESTROY_ERROR_LABEL.item_not_found },
    ])
  })
})

describe('summarizeDestroyImpact', () => {
  it('처리 대상 개체 수와 배지 종류 수를 센다', () => {
    const infos = infosOf(info({ id: 'a', badgeId: 'b1' }), info({ id: 'b', badgeId: 'b1' }), info({ id: 'c', badgeId: 'b2' }))

    expect(summarizeDestroyImpact(['a', 'b', 'c'], infos)).toEqual({ itemCount: 3, badgeKindCount: 2 })
    expect(summarizeDestroyImpact([], infos)).toEqual({ itemCount: 0, badgeKindCount: 0 })
  })
})

describe('summarizeReassignImpact', () => {
  it('빈 칸이 모자라면 모자라는 만큼을 알린다', () => {
    expect(summarizeReassignImpact(5, { max_slots: 10, used_slots: 7 })).toEqual({
      itemCount: 5,
      hasInventory: 1,
      freeSlots: 3,
      shortCount: 2,
    })
  })

  it('빈 칸이 충분하면 모자라는 개수가 0이다', () => {
    expect(summarizeReassignImpact(2, { max_slots: 10, used_slots: 0 })).toMatchObject({ freeSlots: 10, shortCount: 0 })
  })

  it('사용 칸이 최대치를 넘어도 빈 칸은 음수가 되지 않는다', () => {
    expect(summarizeReassignImpact(1, { max_slots: 5, used_slots: 8 })).toMatchObject({ freeSlots: 0, shortCount: 1 })
  })

  it('인벤토리가 없으면 hasInventory가 0이다', () => {
    expect(summarizeReassignImpact(4, null)).toEqual({ itemCount: 4, hasInventory: 0, freeSlots: 0, shortCount: 4 })
  })
})

describe('toBulkResult', () => {
  it('성공은 처리, 실패는 오류 코드를 문구로 바꿔 건너뜀에 담는다', () => {
    const infos = infosOf(info({ id: 'a', serialLabel: 'A1' }), info({ id: 'b', serialLabel: 'A2' }))

    const result = toBulkResult(
      [
        { id: 'a', ok: true },
        { id: 'b', ok: false, error: 'inventory_full' },
        { id: 'zzz', ok: false, error: 'unknown_code' },
      ],
      infos,
      REASSIGN_ERROR_LABEL
    )

    expect(result.processed).toEqual(['a'])
    expect(result.skipped).toEqual([
      { id: 'b', label: '#A2', reason: REASSIGN_ERROR_LABEL.inventory_full },
      { id: 'zzz', label: undefined, reason: 'unknown_code' },
    ])
  })
})

interface RpcCall {
  name: string
  args: Record<string, unknown>
}

/** `supabase.rpc`만 흉내 내는 스텁 — 호출 순서·동시 실행 수를 기록한다 */
function createRpcStub(respond: (call: RpcCall) => { data: unknown; error: unknown }) {
  const calls: RpcCall[] = []
  let running = 0
  let maxRunning = 0
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      const call = { name, args }
      calls.push(call)
      running += 1
      maxRunning = Math.max(maxRunning, running)
      await Promise.resolve()
      running -= 1
      return respond(call)
    },
  }
  return { client: client as unknown as Parameters<typeof destroyOrphanedItems>[0], calls, maxRunning: () => maxRunning }
}

describe('destroyOrphanedItems', () => {
  it('개체마다 폐기 RPC를 한 번씩 부르고 결과를 개체별로 돌려준다', async () => {
    const stub = createRpcStub((call) =>
      call.args.p_item_id === 'bad'
        ? { data: { ok: false, error: 'not_orphaned' }, error: null }
        : { data: { ok: true }, error: null }
    )

    const outcomes = await destroyOrphanedItems(stub.client, ['a', 'bad', 'c'], 'admin1')

    expect(stub.calls.map((c) => c.name)).toEqual([
      'admin_destroy_orphaned_item',
      'admin_destroy_orphaned_item',
      'admin_destroy_orphaned_item',
    ])
    expect(stub.calls[0].args).toEqual({ p_item_id: 'a', p_admin_id: 'admin1' })
    expect(outcomes).toEqual([
      { id: 'a', ok: true, error: undefined },
      { id: 'bad', ok: false, error: 'not_orphaned' },
      { id: 'c', ok: true, error: undefined },
    ])
  })

  it('RPC 자체가 실패하면 destroy_failed로 보고하고 나머지는 계속 처리한다', async () => {
    const stub = createRpcStub((call) =>
      call.args.p_item_id === 'a' ? { data: null, error: { message: 'boom' } } : { data: { ok: true }, error: null }
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const outcomes = await destroyOrphanedItems(stub.client, ['a', 'b'], 'admin1')

    errorSpy.mockRestore()
    expect(outcomes.map((o) => [o.id, o.ok, o.error])).toEqual([
      ['a', false, 'destroy_failed'],
      ['b', true, undefined],
    ])
  })

  it('동시에 10건까지만 병렬로 부른다', async () => {
    const stub = createRpcStub(() => ({ data: { ok: true }, error: null }))

    await destroyOrphanedItems(stub.client, Array.from({ length: 35 }, (_, i) => `id${i}`), 'admin1')

    expect(stub.calls).toHaveLength(35)
    expect(stub.maxRunning()).toBe(10)
  })
})

describe('reassignOrphanedItems', () => {
  it('차례로 부르고 대상 유저를 매번 넘긴다 — 인벤토리가 꽉 차면 그 뒤 개체부터 실패한다', async () => {
    let filled = 0
    const stub = createRpcStub(() => {
      filled += 1
      return filled <= 2 ? { data: { ok: true }, error: null } : { data: { ok: false, error: 'inventory_full' }, error: null }
    })

    const outcomes = await reassignOrphanedItems(stub.client, ['a', 'b', 'c'], 'admin1', 'user1')

    expect(stub.maxRunning()).toBe(1)
    expect(stub.calls.map((c) => c.args)).toEqual([
      { p_item_id: 'a', p_admin_id: 'admin1', p_target_user_id: 'user1' },
      { p_item_id: 'b', p_admin_id: 'admin1', p_target_user_id: 'user1' },
      { p_item_id: 'c', p_admin_id: 'admin1', p_target_user_id: 'user1' },
    ])
    expect(outcomes.map((o) => [o.id, o.ok, o.error])).toEqual([
      ['a', true, undefined],
      ['b', true, undefined],
      ['c', false, 'inventory_full'],
    ])
  })
})
