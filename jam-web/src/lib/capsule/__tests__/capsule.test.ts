/**
 * lib/capsule/capsule — 캡슐 상태 조회 (티켓 20261018_0052 1회, 채우기는 20261028_1742 1회에서 걷음)
 *
 * 고정하는 것:
 * - 상태: `capsule_get_or_create`와 `jam_wallets` 잔액, 인벤토리 빈칸으로 `CapsuleStatus`를 만든다. 못 여는 까닭은 다 채우지 못함(`not_full`)이 먼저이고
 *   다 채웠어도 빈칸이 나올 수 있는 최대 개수(2)보다 적으면 `no_free_slots`(지금 빈칸·필요한 빈칸 포함)다. 지갑 행이 없으면 잔액 0, 인벤토리 행이 없으면 빈칸 0이다.
 *   RPC·조회 오류와 해석할 수 없는 응답은 던진다.
 * 공용 DB와 실제 RPC는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/capsule/__tests__/capsule.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const calls = vi.hoisted(() => ({ order: [] as string[], reads: [] as string[] }))
const assertNotSuspendedMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))
vi.mock('@/lib/suspension/suspension', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/suspension/suspension')>()
  return {
    ...actual,
    assertNotSuspended: async (...args: unknown[]) => {
      calls.order.push('assertNotSuspended')
      return assertNotSuspendedMock(...args)
    },
  }
})

import { getCapsuleStatus } from '../capsule'

const USER_ID = '11111111-1111-4111-8111-111111111111'

interface FakeOptions {
  rpc?: Record<string, { data: unknown; error: unknown }>
  wallet?: { data: unknown; error: unknown }
  /** 인벤토리 행. 생략하면 50칸 중 10칸 사용(빈칸 40) */
  inventory?: { data: unknown; error: unknown }
  /** `capsule_pending_rewards` 그 유저 행들. 생략하면 보류 없음 */
  pending?: { data: unknown; error: unknown }
  /** 진행 중인 이용 정지 행. 생략하면 정지 아님 */
  suspension?: { data: unknown; error: unknown }
  /** `users.tribe_id`. 생략하면 트라이브 있음 */
  tribe?: { data: unknown; error: unknown }
}

/** `capsule_policy` 행 — 기본값(개수 1 + 1이라 필요한 빈칸 2) */
const POLICY_ROW = {
  guaranteed_count: 1,
  bonus_count: 1,
  bonus_probability: 0.2,
  other_tribe_probability: 0.2,
  rarity_common: 70,
  rarity_rare: 22,
  rarity_epic: 6,
  rarity_mystic: 2,
  pity_epic_threshold: 15,
  pre_quest_fill_amount: 5,
  pre_quest_unlock_required: 5,
}

function fakeClient(options: FakeOptions): { client: SupabaseClient; rpc: ReturnType<typeof vi.fn> } {
  const read = (table: string) => calls.reads.push(table)
  const rpc = vi.fn(async (name: string) => {
    calls.order.push(`rpc:${name}`)
    return options.rpc?.[name] ?? { data: null, error: { message: `unexpected rpc ${name}` } }
  })
  const client = {
    rpc,
    from: (table: string) => {
      read(table)
      if (table === 'capsule_policy') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: POLICY_ROW, error: null }) }) }) }
      }
      if (table === 'inventory') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => options.inventory ?? { data: { used_slots: 10, max_slots: 50 }, error: null } }),
          }),
        }
      }
      if (table === 'capsule_pending_rewards') {
        return { select: () => ({ eq: async () => options.pending ?? { data: [], error: null } }) }
      }
      if (table === 'user_suspensions') {
        return { select: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => options.suspension ?? { data: null, error: null } }) }) }) }
      }
      if (table === 'users') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => options.tribe ?? { data: { tribe_id: 't1' }, error: null } }) }) }
      }
      expect(table).toBe('jam_wallets')
      return { select: () => ({ eq: () => ({ maybeSingle: async () => options.wallet ?? { data: null, error: null } }) }) }
    },
  } as unknown as SupabaseClient
  return { client, rpc }
}

beforeEach(() => {
  calls.order = []
  calls.reads = []
  assertNotSuspendedMock.mockReset()
  assertNotSuspendedMock.mockResolvedValue(undefined)
})

describe('getCapsuleStatus', () => {
  it('덜 찬 캡슐은 남은 양과 못 여는 까닭(not_full)을 싣는다', async () => {
    const { client, rpc } = fakeClient({
      rpc: { capsule_get_or_create: { data: { user_id: USER_ID, required: 110, filled: 30, chapter_no: 3 }, error: null } },
      wallet: { data: { balance: 45 }, error: null },
    })

    expect(await getCapsuleStatus(client, USER_ID)).toEqual({
      required: 110,
      filled: 30,
      remaining: 80,
      balance: 45,
      openable: false,
      notOpenableReason: 'not_full',
      freeSlots: 40,
      neededSlots: 2,
      pendingCount: 0,
      jamBlocked: false,
      alertStage: 0,
      claim: { available: false, blockedReason: null, freeSlots: 40, neededSlots: 2 },
      notice: 'none',
    })
    expect(rpc).toHaveBeenCalledWith('capsule_get_or_create', { p_user_id: USER_ID })
  })

  it('가득 찬 캡슐은 빈칸이 충분하면 열 수 있고 까닭이 없다', async () => {
    const { client } = fakeClient({
      rpc: { capsule_get_or_create: { data: { required: 5, filled: 5 }, error: null } },
      wallet: { data: { balance: 0 }, error: null },
    })

    expect(await getCapsuleStatus(client, USER_ID)).toEqual({
      required: 5,
      filled: 5,
      remaining: 0,
      balance: 0,
      openable: true,
      notOpenableReason: null,
      freeSlots: 40,
      neededSlots: 2,
      pendingCount: 0,
      jamBlocked: false,
      alertStage: 0,
      claim: { available: false, blockedReason: null, freeSlots: 40, neededSlots: 2 },
      notice: 'full_waiting',
    })
  })

  it('빈칸이 필요한 빈칸(2)과 같으면 열 수 있고, 하나 적으면 no_free_slots와 두 수치를 싣는다', async () => {
    const full = { capsule_get_or_create: { data: { required: 90, filled: 90 }, error: null } }

    const exact = await getCapsuleStatus(fakeClient({ rpc: full, inventory: { data: { used_slots: 48, max_slots: 50 }, error: null } }).client, USER_ID)
    expect(exact).toMatchObject({ openable: true, notOpenableReason: null, freeSlots: 2, neededSlots: 2 })

    const short = await getCapsuleStatus(fakeClient({ rpc: full, inventory: { data: { used_slots: 49, max_slots: 50 }, error: null } }).client, USER_ID)
    expect(short).toMatchObject({ openable: false, notOpenableReason: 'no_free_slots', freeSlots: 1, neededSlots: 2 })
  })

  it('다 채우지 못했으면 빈칸이 모자라도 까닭은 not_full이 먼저다', async () => {
    const status = await getCapsuleStatus(
      fakeClient({
        rpc: { capsule_get_or_create: { data: { required: 90, filled: 10 }, error: null } },
        inventory: { data: { used_slots: 50, max_slots: 50 }, error: null },
      }).client,
      USER_ID
    )

    expect(status).toMatchObject({ openable: false, notOpenableReason: 'not_full', freeSlots: 0, neededSlots: 2 })
  })

  it('인벤토리 행이 없으면 빈칸 0이고, 사용 칸이 최대보다 커도 0 미만으로 내려가지 않는다', async () => {
    const full = { capsule_get_or_create: { data: { required: 90, filled: 90 }, error: null } }

    const none = await getCapsuleStatus(fakeClient({ rpc: full, inventory: { data: null, error: null } }).client, USER_ID)
    expect(none).toMatchObject({ notOpenableReason: 'no_free_slots', freeSlots: 0 })

    const over = await getCapsuleStatus(fakeClient({ rpc: full, inventory: { data: { used_slots: 55, max_slots: 50 }, error: null } }).client, USER_ID)
    expect(over.freeSlots).toBe(0)
  })

  it('인벤토리 조회 오류는 던진다', async () => {
    await expect(
      getCapsuleStatus(
        fakeClient({
          rpc: { capsule_get_or_create: { data: { required: 90, filled: 90 }, error: null } },
          inventory: { data: null, error: { message: 'down' } },
        }).client,
        USER_ID
      )
    ).rejects.toThrow('inventory 조회 실패')
  })

  it('지갑 행이 없으면 잔액 0이다', async () => {
    const { client } = fakeClient({ rpc: { capsule_get_or_create: { data: { required: 90, filled: 0 }, error: null } } })

    expect((await getCapsuleStatus(client, USER_ID)).balance).toBe(0)
  })

  it('RPC 오류·해석할 수 없는 응답·지갑 조회 오류는 던진다', async () => {
    await expect(
      getCapsuleStatus(fakeClient({ rpc: { capsule_get_or_create: { data: null, error: { message: 'boom' } } } }).client, USER_ID)
    ).rejects.toThrow('capsule_get_or_create RPC 오류')
    await expect(
      getCapsuleStatus(fakeClient({ rpc: { capsule_get_or_create: { data: null, error: null } } }).client, USER_ID)
    ).rejects.toThrow('해석할 수 없는 응답')
    await expect(
      getCapsuleStatus(
        fakeClient({
          rpc: { capsule_get_or_create: { data: { required: 90, filled: 0 }, error: null } },
          wallet: { data: null, error: { message: 'down' } },
        }).client,
        USER_ID
      )
    ).rejects.toThrow('jam_wallets 조회 실패')
  })
})

describe('getCapsuleStatus — 보류·안내 값 (티켓 20261028_1739 1회)', () => {
  const capsuleRow = (over: Record<string, unknown> = {}) => ({
    capsule_get_or_create: { data: { required: 100, filled: 40, chapter_no: 3, alert_stage: 0, ...over }, error: null },
  })
  const rows = (n: number) => ({ data: Array.from({ length: n }, (_, i) => ({ id: `p${i}` })), error: null })
  const status = (opts: FakeOptions) => getCapsuleStatus(fakeClient(opts).client, USER_ID)

  it('보류가 없으면 pendingCount 0, 받을 수 없고 까닭도 없으며 안내는 none이다', async () => {
    expect(await status({ rpc: capsuleRow() })).toMatchObject({
      pendingCount: 0,
      jamBlocked: false,
      alertStage: 0,
      claim: { available: false, blockedReason: null, freeSlots: 40, neededSlots: 2 },
      notice: 'none',
    })
  })

  it('보류 1개와 단계 0이면 pending이고 빈칸이 충분하면 받을 수 있다', async () => {
    expect(await status({ rpc: capsuleRow(), pending: rows(1) })).toMatchObject({
      pendingCount: 1,
      jamBlocked: false,
      alertStage: 0,
      claim: { available: true, blockedReason: null, freeSlots: 40, neededSlots: 2 },
      notice: 'pending',
    })
  })

  it.each([70, 80, 90] as const)('보류 1개와 저장된 단계 %i면 pending_nearly_full이고 단계를 그대로 싣는다', async (stage) => {
    expect(await status({ rpc: capsuleRow({ alert_stage: stage }), pending: rows(1) })).toMatchObject({
      pendingCount: 1,
      alertStage: stage,
      notice: 'pending_nearly_full',
    })
  })

  it('저장된 단계가 70·80·90이 아니면 0으로 본다', async () => {
    expect(await status({ rpc: capsuleRow({ alert_stage: 75 }), pending: rows(1) })).toMatchObject({ alertStage: 0, notice: 'pending' })
  })

  it('보류가 2개면 jamBlocked이고 저장된 단계가 있어도 alertStage는 0, 안내는 jam_blocked다', async () => {
    expect(await status({ rpc: capsuleRow({ alert_stage: 90 }), pending: rows(2) })).toMatchObject({
      pendingCount: 2,
      jamBlocked: true,
      alertStage: 0,
      claim: { available: true, blockedReason: null },
      notice: 'jam_blocked',
    })
  })

  it('보류가 없으면 저장된 단계가 남아 있어도 alertStage는 0이다', async () => {
    expect(await status({ rpc: capsuleRow({ alert_stage: 80 }) })).toMatchObject({ pendingCount: 0, alertStage: 0, notice: 'none' })
  })

  it('보류가 2개를 넘어도 2로 접는다', async () => {
    expect(await status({ rpc: capsuleRow(), pending: rows(3) })).toMatchObject({ pendingCount: 2, jamBlocked: true })
  })

  it('보류는 없는데 채움이 필요량 이상이면 full_waiting이고, 덜 찼으면 none이다', async () => {
    expect(await status({ rpc: capsuleRow({ required: 100, filled: 100 }) })).toMatchObject({ pendingCount: 0, notice: 'full_waiting' })
    expect(await status({ rpc: capsuleRow({ required: 100, filled: 99 }) })).toMatchObject({ notice: 'none' })
  })

  it('보류가 있으면 가득 차 있어도 안내는 보류 쪽이다(full_waiting이 아니다)', async () => {
    expect(await status({ rpc: capsuleRow({ required: 100, filled: 100 }), pending: rows(1) })).toMatchObject({ notice: 'pending' })
  })

  it('빈칸이 필요한 수보다 적으면 받을 수 없고 까닭은 no_slots다(빈칸 수와 필요한 수를 함께 싣는다)', async () => {
    expect(await status({ rpc: capsuleRow(), pending: rows(1), inventory: { data: { used_slots: 49, max_slots: 50 }, error: null } })).toMatchObject({
      claim: { available: false, blockedReason: 'no_slots', freeSlots: 1, neededSlots: 2 },
      notice: 'pending',
    })
    // 빈칸이 필요한 수와 같으면 받을 수 있다
    expect(await status({ rpc: capsuleRow(), pending: rows(1), inventory: { data: { used_slots: 48, max_slots: 50 }, error: null } })).toMatchObject({
      claim: { available: true, blockedReason: null, freeSlots: 2, neededSlots: 2 },
    })
  })

  it('소속 트라이브가 없으면 받을 수 없고 까닭은 no_tribe다(빈칸 모자람보다 먼저)', async () => {
    expect(
      await status({
        rpc: capsuleRow(),
        pending: rows(1),
        tribe: { data: { tribe_id: null }, error: null },
        inventory: { data: { used_slots: 50, max_slots: 50 }, error: null },
      })
    ).toMatchObject({ claim: { available: false, blockedReason: 'no_tribe' } })
  })

  it('이용 정지 중이면 받을 수 없고 까닭은 suspended이며 안내는 none이다(홈은 정지 배너가 알린다)', async () => {
    const out = await status({
      rpc: capsuleRow({ alert_stage: 80 }),
      pending: rows(2),
      suspension: { data: { id: 's1', reason: 'x', suspended_at: '2026-10-01T00:00:00Z' }, error: null },
      tribe: { data: { tribe_id: null }, error: null },
    })
    expect(out).toMatchObject({ pendingCount: 2, jamBlocked: true, claim: { available: false, blockedReason: 'suspended' }, notice: 'none' })
  })

  it('이용 정지 중이어도 보류가 없으면 까닭 없이 받을 수 없다고만 알린다', async () => {
    const out = await status({
      rpc: capsuleRow({ required: 100, filled: 100 }),
      suspension: { data: { id: 's1', reason: 'x', suspended_at: '2026-10-01T00:00:00Z' }, error: null },
    })
    expect(out).toMatchObject({ claim: { available: false, blockedReason: null }, notice: 'none' })
  })

  it('읽기 횟수를 고정한다: 캡슐 RPC 1회와 테이블 읽기 5개, 트라이브는 보류가 있고 정지가 아닐 때만 읽는다', async () => {
    const base = ['jam_wallets', 'capsule_policy', 'inventory', 'capsule_pending_rewards', 'user_suspensions']

    const none = fakeClient({ rpc: capsuleRow() })
    await getCapsuleStatus(none.client, USER_ID)
    expect([...calls.reads].sort()).toEqual([...base].sort())
    expect(none.rpc).toHaveBeenCalledTimes(1)

    calls.reads = []
    await getCapsuleStatus(fakeClient({ rpc: capsuleRow(), pending: rows(1) }).client, USER_ID)
    expect([...calls.reads].sort()).toEqual([...base, 'users'].sort())

    calls.reads = []
    await getCapsuleStatus(
      fakeClient({
        rpc: capsuleRow(),
        pending: rows(1),
        suspension: { data: { id: 's1', reason: 'x', suspended_at: '2026-10-01T00:00:00Z' }, error: null },
      }).client,
      USER_ID
    )
    expect([...calls.reads].sort()).toEqual([...base].sort())
  })

  it('보류·정지·트라이브를 읽지 못하면 «보류 없음»으로 내려가지 않고 던진다', async () => {
    await expect(status({ rpc: capsuleRow(), pending: { data: null, error: { message: 'down' } } })).rejects.toThrow('capsule_pending_rewards 조회 실패')
    await expect(status({ rpc: capsuleRow(), suspension: { data: null, error: { message: 'down' } } })).rejects.toThrow('user_suspensions 조회 실패')
    await expect(status({ rpc: capsuleRow(), pending: rows(1), tribe: { data: null, error: { message: 'down' } } })).rejects.toThrow('users 조회 실패')
  })
})
