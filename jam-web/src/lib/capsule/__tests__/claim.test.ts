/**
 * lib/capsule/claim — 보류 보상 받기 (티켓 20261028_1734 2회)
 *
 * 고정하는 것:
 * - 이용 정지는 보류를 읽기 전에 막는다. 보류가 없으면 RPC·추첨 없이 빈 결과(`pendingBefore: 0`).
 * - 보류를 오래된 순서(`reached_at`, `slot`)로 읽어 하나씩 받는다. 받을 때마다 추첨(`rollCapsuleItems`, 열기와 같은 추첨)하고 `capsule_claim_pending`을 부른다.
 * - 빈칸이 모자라(`insufficient_slots`) 거절되면 거기서 멈추고(`freeSlots`·`neededSlots`) 뒤 보류는 건드리지 않는다. 일부만 받은 뒤 멈추면 받은 것과 남은 수를 돌려준다.
 * - 퀘스트 전 보류(챕터 없음)는 `preQuest`로 추첨한다. 다른 요청이 먼저 받은 보류(`pending_not_found`)는 건너뛴다.
 * - 받은 것이 없을 때의 실패는 던지고, 받은 것이 있는 뒤의 실패는 `stopped: 'error'`로 돌려준다. 받은 뒤 남은 칸 알림을 한 번 검사한다.
 * 공용 DB는 호출하지 않는다 — 가짜 클라이언트·가짜 추첨만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/capsule/__tests__/claim.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { UserSuspendedError } from '@/lib/suspension/suspension'
import { CapsuleError } from '../capsule'

const USER_ID = '11111111-1111-4111-8111-111111111111'

const order = vi.hoisted(() => ({ calls: [] as string[] }))
const assertNotSuspendedMock = vi.hoisted(() => vi.fn())
const rollMock = vi.hoisted(() => vi.fn())
const recordMock = vi.hoisted(() => vi.fn())
const slotAlertMock = vi.hoisted(() => vi.fn())
const logMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/suspension/suspension', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/suspension/suspension')>()
  return {
    ...actual,
    assertNotSuspended: async (...args: unknown[]) => {
      order.calls.push('assertNotSuspended')
      return assertNotSuspendedMock(...args)
    },
  }
})
vi.mock('../policy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../policy')>()
  return { ...actual, getCapsulePolicy: async () => actual.DEFAULT_CAPSULE_POLICY }
})
vi.mock('../open', () => ({
  CAPSULE_ISSUE_ROUTE: 'capsule',
  rollCapsuleItems: async (...args: unknown[]) => {
    order.calls.push('roll')
    return rollMock(...args)
  },
  toRpcItems: () => [{ badge_id: 'badge-1' }],
  recordOpenedItems: async (...args: unknown[]) => {
    order.calls.push('record')
    return recordMock(...args)
  },
}))
vi.mock('@/lib/inventory/slotAlert', () => ({ notifyInventorySlotsLow: (...args: unknown[]) => slotAlertMock(...args) }))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: (...args: unknown[]) => logMock(...args) }))

import { claimPendingCapsules } from '../claim'

interface PendingFixture {
  id: string
  slot: number
  chapter_no: number | null
  fill_amount: number
  reached_at: string
}

const P1: PendingFixture = { id: 'pending-1', slot: 1, chapter_no: 2, fill_amount: 145, reached_at: '2026-10-29T01:00:00Z' }
const P2: PendingFixture = { id: 'pending-2', slot: 2, chapter_no: 2, fill_amount: 145, reached_at: '2026-10-29T02:00:00Z' }

type RpcStep = { data: unknown; error: unknown }

/** 보류 조회(정렬 인자를 기록)와 `capsule_claim_pending` RPC가 차례로 돌려줄 응답 */
function fakeClient(pendings: PendingFixture[], steps: RpcStep[], readError?: string) {
  const orders: Array<[string, unknown]> = []
  let i = 0
  const rpc = vi.fn(async (name: string) => {
    order.calls.push(`rpc:${name}`)
    if (name !== 'capsule_claim_pending') throw new Error(`예상하지 못한 RPC ${name}`)
    return steps[Math.min(i++, steps.length - 1)]
  })
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.order = (column: string, opts: unknown) => {
    orders.push([column, opts])
    return q
  }
  q.then = (resolve: (r: unknown) => unknown) =>
    resolve(readError ? { data: null, error: { message: readError } } : { data: pendings, error: null })
  const client = {
    rpc,
    from: (table: string) => {
      if (table !== 'capsule_pending_rewards') throw new Error(`예상하지 못한 테이블 ${table}`)
      return q
    },
  } as unknown as SupabaseClient
  return { client, rpc, orders }
}

const claimed = (openId: string, pendingCount: number): RpcStep => ({
  data: { ok: true, openId, itemIds: ['inv-1'], items: [{ inventoryItemId: 'inv-1', serialNumber: 3 }], pendingCount },
  error: null,
})
const rejected = (error: string, extra: Record<string, unknown> = {}): RpcStep => ({ data: { ok: false, error, ...extra }, error: null })

beforeEach(() => {
  order.calls = []
  assertNotSuspendedMock.mockReset()
  assertNotSuspendedMock.mockResolvedValue(undefined)
  rollMock.mockReset()
  rollMock.mockResolvedValue({ data: { tribes: [] }, rolled: { items: [{ badge: { id: 'badge-1' } }] } })
  recordMock.mockReset()
  recordMock.mockResolvedValue([{ locked: false, inventoryItemId: 'inv-1', badgeId: 'badge-1', name: '이름', imageUrl: null, rarity: 'common', serialNumber: 3 }])
  slotAlertMock.mockReset()
  slotAlertMock.mockResolvedValue(undefined)
  logMock.mockReset()
  logMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('claimPendingCapsules', () => {
  it('보류를 오래된 순서(reached_at, slot)로 읽어 하나씩 받고 남은 수를 돌려준다', async () => {
    const { client, rpc, orders } = fakeClient([P1, P2], [claimed('open-1', 1), claimed('open-2', 0)])

    const result = await claimPendingCapsules(client, USER_ID)

    expect(orders).toEqual([
      ['reached_at', { ascending: true }],
      ['slot', { ascending: true }],
    ])
    expect(rpc.mock.calls.map(([, args]) => (args as { p_pending_id: string }).p_pending_id)).toEqual(['pending-1', 'pending-2'])
    expect(rpc).toHaveBeenCalledWith('capsule_claim_pending', { p_user_id: USER_ID, p_pending_id: 'pending-1', p_items: [{ badge_id: 'badge-1' }] })
    expect(result).toMatchObject({ pendingBefore: 2, remainingPending: 0, stopped: 'none' })
    expect(result.claimed.map((c) => [c.pendingId, c.openId, c.chapterNo])).toEqual([
      ['pending-1', 'open-1', 2],
      ['pending-2', 'open-2', 2],
    ])
    expect(result.claimed[0].items).toHaveLength(1)
  })

  it('이용 정지는 보류를 읽기 전에 던지고, 추첨도 RPC도 하지 않는다', async () => {
    assertNotSuspendedMock.mockRejectedValueOnce(new UserSuspendedError({ reason: '어뷰징', suspendedAt: '2026-10-29T00:00:00Z' }))
    const { client, rpc } = fakeClient([P1], [claimed('open-1', 0)])

    await expect(claimPendingCapsules(client, USER_ID)).rejects.toBeInstanceOf(UserSuspendedError)

    expect(rpc).not.toHaveBeenCalled()
    expect(rollMock).not.toHaveBeenCalled()
  })

  it('보류가 없으면 추첨·RPC 없이 빈 결과(pendingBefore 0)를 돌려준다', async () => {
    const { client, rpc } = fakeClient([], [])

    const result = await claimPendingCapsules(client, USER_ID)

    expect(result).toEqual({ pendingBefore: 0, claimed: [], remainingPending: 0, stopped: 'none' })
    expect(rpc).not.toHaveBeenCalled()
    expect(rollMock).not.toHaveBeenCalled()
    expect(slotAlertMock).not.toHaveBeenCalled()
  })

  it('빈칸이 모자라면 거기서 멈추고 못 받은 보류는 남는다 — 받은 것이 없으면 claimed가 비고 free·needed를 싣는다', async () => {
    const { client, rpc } = fakeClient([P1, P2], [rejected('insufficient_slots', { free: 1, needed: 2 })])

    const result = await claimPendingCapsules(client, USER_ID)

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ pendingBefore: 2, claimed: [], remainingPending: 2, stopped: 'insufficient_slots', freeSlots: 1, neededSlots: 2 })
    expect(recordMock).not.toHaveBeenCalled()
    expect(slotAlertMock).not.toHaveBeenCalled()
  })

  it('일부만 받는다 — 첫 보류를 받고 둘째에서 빈칸이 모자라면 멈춰 받은 것과 남은 수를 돌려준다', async () => {
    const { client, rpc } = fakeClient([P1, P2], [claimed('open-1', 1), rejected('insufficient_slots', { free: 0, needed: 2 })])

    const result = await claimPendingCapsules(client, USER_ID)

    expect(rpc).toHaveBeenCalledTimes(2)
    expect(result.claimed.map((c) => c.pendingId)).toEqual(['pending-1'])
    expect(result).toMatchObject({ remainingPending: 1, stopped: 'insufficient_slots', freeSlots: 0, neededSlots: 2 })
    // 받은 뒤 남은 칸 알림은 한 번
    expect(slotAlertMock).toHaveBeenCalledTimes(1)
    expect(slotAlertMock).toHaveBeenCalledWith(USER_ID, client)
  })

  it('보류마다 추첨한다 — 받기 확정 뒤에 후속 처리를 하고, 퀘스트 전 보류(챕터 없음)는 preQuest로 추첨한다', async () => {
    const preQuest: PendingFixture = { ...P1, id: 'pending-pq', chapter_no: null }
    const { client } = fakeClient([preQuest, P2], [claimed('open-1', 1), claimed('open-2', 0)])

    await claimPendingCapsules(client, USER_ID)

    expect(rollMock).toHaveBeenCalledTimes(2)
    expect(rollMock.mock.calls[0][2]).toMatchObject({ preQuest: true })
    expect(rollMock.mock.calls[1][2]).toMatchObject({ preQuest: false })
    expect(order.calls).toEqual([
      'assertNotSuspended',
      'roll',
      'rpc:capsule_claim_pending',
      'record',
      'roll',
      'rpc:capsule_claim_pending',
      'record',
    ])
    expect(logMock).toHaveBeenCalledWith('drop', 'drop_attempt', USER_ID, expect.objectContaining({ path: 'capsule', outcome: 'claimed_pending', openId: 'open-1' }))
  })

  it('다른 요청이 먼저 받은 보류(pending_not_found)는 건너뛰고 다음 보류를 받는다', async () => {
    const { client } = fakeClient([P1, P2], [rejected('pending_not_found'), claimed('open-2', 0)])

    const result = await claimPendingCapsules(client, USER_ID)

    expect(result.claimed.map((c) => c.pendingId)).toEqual(['pending-2'])
    expect(result).toMatchObject({ remainingPending: 0, stopped: 'none' })
  })

  it('받은 것이 없을 때의 거절·RPC 오류·해석 불가는 던진다 (정지는 CapsuleError user_suspended)', async () => {
    const suspended = fakeClient([P1], [rejected('user_suspended')])
    const e1 = await claimPendingCapsules(suspended.client, USER_ID).catch((e: unknown) => e)
    expect(e1).toBeInstanceOf(CapsuleError)
    expect((e1 as CapsuleError).code).toBe('user_suspended')

    const invalid = fakeClient([P1], [rejected('invalid_items')])
    expect(((await claimPendingCapsules(invalid.client, USER_ID).catch((e: unknown) => e)) as CapsuleError).code).toBe('invalid_items')

    await expect(claimPendingCapsules(fakeClient([P1], [rejected('weird')]).client, USER_ID)).rejects.toThrow('알 수 없는 거절 코드')
    await expect(claimPendingCapsules(fakeClient([P1], [{ data: null, error: { message: 'down' } }]).client, USER_ID)).rejects.toThrow('capsule_claim_pending RPC 오류: down')
    await expect(claimPendingCapsules(fakeClient([P1], [{ data: { ok: true }, error: null }]).client, USER_ID)).rejects.toThrow('해석할 수 없는')
  })

  it('보류를 읽지 못하면 던진다', async () => {
    await expect(claimPendingCapsules(fakeClient([], [], 'boom').client, USER_ID)).rejects.toThrow('capsule_pending_rewards 조회 실패: boom')
  })

  it('이미 받은 것이 있는 뒤의 예상 밖 실패는 던지지 않고 error로 돌려주며 받은 것을 보존한다', async () => {
    const { client } = fakeClient([P1, P2], [claimed('open-1', 1), { data: null, error: { message: 'down' } }])

    const result = await claimPendingCapsules(client, USER_ID)

    expect(result.stopped).toBe('error')
    expect(result.error).toBeInstanceOf(Error)
    expect(result.claimed.map((c) => c.pendingId)).toEqual(['pending-1'])
    expect(result.remainingPending).toBe(1)
    expect(slotAlertMock).toHaveBeenCalledTimes(1)
  })

  it('추첨이 실패하면(no_tribe) 받은 것이 없을 때 던지고 RPC를 부르지 않는다', async () => {
    rollMock.mockRejectedValueOnce(new CapsuleError('no_tribe'))
    const { client, rpc } = fakeClient([P1], [claimed('open-1', 0)])

    await expect(claimPendingCapsules(client, USER_ID)).rejects.toBeInstanceOf(CapsuleError)
    expect(rpc).not.toHaveBeenCalled()
  })
})
