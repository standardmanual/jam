/**
 * lib/capsule/capsule — 캡슐 상태 조회와 채우기 (티켓 20261018_0052 1회)
 *
 * 고정하는 것:
 * - 상태: `capsule_get_or_create`와 `jam_wallets` 잔액, 인벤토리 빈칸으로 `CapsuleStatus`를 만든다. 못 여는 까닭은 다 채우지 못함(`not_full`)이 먼저이고
 *   다 채웠어도 빈칸이 나올 수 있는 최대 개수(2)보다 적으면 `no_free_slots`(지금 빈칸·필요한 빈칸 포함)다. 지갑 행이 없으면 잔액 0, 인벤토리 행이 없으면 빈칸 0이다.
 *   RPC·조회 오류와 해석할 수 없는 응답은 던진다. 채우기 응답은 빈칸을 읽지 못해도 채우기를 실패로 돌려주지 않는다.
 * - 채우기: 이용 정지 확인(`assertNotSuspended`)이 RPC보다 먼저다. 정지 중이면 RPC를 부르지 않는다. 정지 여부를 읽지 못해도 RPC를 부르지 않는다.
 * - DB 함수의 거절 코드(`already_full`·`exceeds_remaining`·`invalid_amount`·`insufficient_jam`·`capsule_changed`·`user_suspended`)를 `CapsuleError`로 바꾼다.
 *   알 수 없는 코드와 RPC 오류는 일반 오류다.
 * 공용 DB와 실제 RPC는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/capsule/__tests__/capsule.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { UserSuspendedError } from '@/lib/suspension/suspension'

const calls = vi.hoisted(() => ({ order: [] as string[] }))
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

import { CapsuleError, fillCapsule, getCapsuleStatus } from '../capsule'

const USER_ID = '11111111-1111-4111-8111-111111111111'

interface FakeOptions {
  rpc?: Record<string, { data: unknown; error: unknown }>
  wallet?: { data: unknown; error: unknown }
  /** 인벤토리 행. 생략하면 50칸 중 10칸 사용(빈칸 40) */
  inventory?: { data: unknown; error: unknown }
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
  const rpc = vi.fn(async (name: string) => {
    calls.order.push(`rpc:${name}`)
    return options.rpc?.[name] ?? { data: null, error: { message: `unexpected rpc ${name}` } }
  })
  const client = {
    rpc,
    from: (table: string) => {
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
      expect(table).toBe('jam_wallets')
      return { select: () => ({ eq: () => ({ maybeSingle: async () => options.wallet ?? { data: null, error: null } }) }) }
    },
  } as unknown as SupabaseClient
  return { client, rpc }
}

beforeEach(() => {
  calls.order = []
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

describe('fillCapsule', () => {
  const okResult = { ok: true, applied: 30, required: 110, filled: 60, remaining: 50, balance: 12 }

  it('이용 정지 확인이 RPC보다 먼저고, 성공하면 채운 양과 캡슐 상태를 돌려준다', async () => {
    const { client, rpc } = fakeClient({ rpc: { capsule_fill: { data: okResult, error: null } } })

    expect(await fillCapsule(client, USER_ID, 30)).toEqual({
      applied: 30,
      required: 110,
      filled: 60,
      remaining: 50,
      balance: 12,
      openable: false,
      notOpenableReason: 'not_full',
      freeSlots: 40,
      neededSlots: 2,
    })
    expect(calls.order).toEqual(['assertNotSuspended', 'rpc:capsule_fill'])
    expect(rpc).toHaveBeenCalledWith('capsule_fill', { p_user_id: USER_ID, p_amount: 30 })
  })

  it('양을 생략하면 null을 넘긴다(기본값은 DB가 남은 양으로 정한다)', async () => {
    const { client, rpc } = fakeClient({ rpc: { capsule_fill: { data: okResult, error: null } } })

    await fillCapsule(client, USER_ID)

    expect(rpc).toHaveBeenCalledWith('capsule_fill', { p_user_id: USER_ID, p_amount: null })
  })

  it('다 채우면 열 수 있다고 알린다', async () => {
    const { client } = fakeClient({
      rpc: { capsule_fill: { data: { ok: true, applied: 5, required: 5, filled: 5, remaining: 0, balance: 0 }, error: null } },
    })

    const payload = await fillCapsule(client, USER_ID)

    expect(payload.openable).toBe(true)
    expect(payload.notOpenableReason).toBeNull()
  })

  it('다 채웠어도 빈칸이 모자라면 열 수 없다고 알린다', async () => {
    const { client } = fakeClient({
      rpc: { capsule_fill: { data: { ok: true, applied: 5, required: 5, filled: 5, remaining: 0, balance: 0 }, error: null } },
      inventory: { data: { used_slots: 49, max_slots: 50 }, error: null },
    })

    expect(await fillCapsule(client, USER_ID)).toMatchObject({ openable: false, notOpenableReason: 'no_free_slots', freeSlots: 1, neededSlots: 2 })
  })

  it('채운 뒤 빈칸을 읽지 못해도 채우기는 성공으로 돌려주고, 빈칸 없이 다 채웠는지만 본다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeClient({
      rpc: { capsule_fill: { data: { ok: true, applied: 5, required: 5, filled: 5, remaining: 0, balance: 0 }, error: null } },
      inventory: { data: null, error: { message: 'down' } },
    })

    const payload = await fillCapsule(client, USER_ID)

    expect(payload).toEqual({ applied: 5, required: 5, filled: 5, remaining: 0, balance: 0, openable: true, notOpenableReason: null })
  })

  it('이용 정지 중이면 RPC를 부르지 않고 UserSuspendedError를 던진다', async () => {
    assertNotSuspendedMock.mockRejectedValue(new UserSuspendedError({ reason: '어뷰징', suspendedAt: '2026-10-18T00:00:00Z' }))
    const { client, rpc } = fakeClient({ rpc: { capsule_fill: { data: okResult, error: null } } })

    await expect(fillCapsule(client, USER_ID, 10)).rejects.toBeInstanceOf(UserSuspendedError)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('정지 여부를 읽지 못하면 RPC를 부르지 않고 그 오류를 던진다', async () => {
    assertNotSuspendedMock.mockRejectedValue(new Error('user_suspensions 조회 실패: down'))
    const { client, rpc } = fakeClient({ rpc: { capsule_fill: { data: okResult, error: null } } })

    await expect(fillCapsule(client, USER_ID)).rejects.toThrow('user_suspensions 조회 실패')
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each(['user_suspended', 'already_full', 'invalid_amount', 'insufficient_jam', 'capsule_changed'] as const)('DB 거절 %s를 CapsuleError로 바꾼다', async (code) => {
    const { client } = fakeClient({ rpc: { capsule_fill: { data: { ok: false, error: code }, error: null } } })

    const error = await fillCapsule(client, USER_ID, 10).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(CapsuleError)
    expect((error as CapsuleError).code).toBe(code)
    expect((error as CapsuleError).remaining).toBeUndefined()
  })

  it('exceeds_remaining은 남은 양을 함께 싣는다', async () => {
    const { client } = fakeClient({ rpc: { capsule_fill: { data: { ok: false, error: 'exceeds_remaining', remaining: 40 }, error: null } } })

    const error = (await fillCapsule(client, USER_ID, 999).catch((e: unknown) => e)) as CapsuleError

    expect(error.code).toBe('exceeds_remaining')
    expect(error.remaining).toBe(40)
  })

  it('RPC 오류·알 수 없는 거절 코드·해석할 수 없는 응답은 일반 오류다', async () => {
    const rpcError = fakeClient({ rpc: { capsule_fill: { data: null, error: { message: 'boom' } } } }).client
    const unknownCode = fakeClient({ rpc: { capsule_fill: { data: { ok: false, error: 'mystery' }, error: null } } }).client
    const malformed = fakeClient({ rpc: { capsule_fill: { data: { ok: true }, error: null } } }).client

    const errors = await Promise.all([rpcError, unknownCode, malformed].map((c) => fillCapsule(c, USER_ID).catch((e: unknown) => e)))

    for (const error of errors) {
      expect(error).toBeInstanceOf(Error)
      expect(error).not.toBeInstanceOf(CapsuleError)
    }
  })
})
