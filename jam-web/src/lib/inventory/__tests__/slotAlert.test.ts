/**
 * 남은 칸 알림 (티켓 20261018_0056, 운영 로직 6.4절)
 *
 * `inventory_slot_alert_step`(마이그레이션 237)이 알릴지 정하고, 이 모듈이 알림 행을 만든다. 여기서는 DB 함수의 응답을 해석하는 일과
 * 알림 생성이 본 흐름을 깨지 않는 일을 본다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/inventory/__tests__/slotAlert.test.ts
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createNotificationMock = vi.hoisted(() => vi.fn(async () => null))
vi.mock('@/lib/notifications', () => ({ createNotification: createNotificationMock }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: vi.fn() }))

import { notifyInventorySlotsLow, parseSlotAlertStep } from '../slotAlert'

interface FakeOptions {
  rpc?: { data: unknown; error: unknown } | (() => never)
  maxSlots?: number | null
  inventoryError?: unknown
}

function fakeClient(options: FakeOptions) {
  const rpcCalls: { name: string; args: unknown }[] = []
  const client = {
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args })
      if (typeof options.rpc === 'function') return options.rpc()
      return options.rpc ?? { data: null, error: null }
    },
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({
          data: table === 'inventory' && options.maxSlots != null ? { max_slots: options.maxSlots } : null,
          error: options.inventoryError ?? null,
        }),
      }
      return builder
    },
  } as unknown as SupabaseClient
  return { client, rpcCalls }
}

beforeEach(() => {
  createNotificationMock.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('parseSlotAlertStep', () => {
  it('ok이고 notify이고 단계가 3 또는 1일 때만 단계를 돌려준다', () => {
    expect(parseSlotAlertStep({ ok: true, notify: true, stage: 3, free: 3 })).toBe(3)
    expect(parseSlotAlertStep({ ok: true, notify: true, stage: 1, free: 0 })).toBe(1)
  })

  it('알릴 필요가 없거나 실패이거나 모양이 다르면 null이다', () => {
    expect(parseSlotAlertStep({ ok: true, notify: false, stage: 3, free: 3 })).toBeNull()
    expect(parseSlotAlertStep({ ok: true, notify: true, stage: 0 })).toBeNull()
    expect(parseSlotAlertStep({ ok: true, notify: true, stage: 2 })).toBeNull()
    expect(parseSlotAlertStep({ ok: false, error: 'inventory_not_found' })).toBeNull()
    expect(parseSlotAlertStep(null)).toBeNull()
    expect(parseSlotAlertStep('x')).toBeNull()
  })
})

describe('notifyInventorySlotsLow', () => {
  it('notify이면 단계와 최대 칸 수를 담아 inventory_slots_low 알림을 한 번 만든다', async () => {
    const { client, rpcCalls } = fakeClient({ rpc: { data: { ok: true, notify: true, stage: 3, free: 3 }, error: null }, maxSlots: 50 })
    await notifyInventorySlotsLow('user-1', client)
    expect(rpcCalls).toEqual([{ name: 'inventory_slot_alert_step', args: { p_user_id: 'user-1' } }])
    expect(createNotificationMock).toHaveBeenCalledTimes(1)
    expect(createNotificationMock).toHaveBeenCalledWith({
      userId: 'user-1',
      type: 'inventory_slots_low',
      payload: { remaining_slots: 3, max_slots: 50 },
    })
  })

  it('1개 단계도 같은 모양으로 만든다', async () => {
    const { client } = fakeClient({ rpc: { data: { ok: true, notify: true, stage: 1, free: 1 }, error: null }, maxSlots: 50 })
    await notifyInventorySlotsLow('user-1', client)
    expect(createNotificationMock).toHaveBeenCalledWith(expect.objectContaining({ payload: { remaining_slots: 1, max_slots: 50 } }))
  })

  it('notify가 false이면 알림을 만들지 않고 인벤토리도 다시 읽지 않는다', async () => {
    const { client } = fakeClient({ rpc: { data: { ok: true, notify: false, stage: 3, free: 3 }, error: null }, maxSlots: 50 })
    await notifyInventorySlotsLow('user-1', client)
    expect(createNotificationMock).not.toHaveBeenCalled()
  })

  it('RPC가 오류를 돌려주면 알림 없이 로그만 남기고 던지지 않는다', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'boom' } } })
    await expect(notifyInventorySlotsLow('user-1', client)).resolves.toBeUndefined()
    expect(createNotificationMock).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })

  it('RPC가 예외를 던져도 본 흐름으로 번지지 않는다', async () => {
    const { client } = fakeClient({
      rpc: () => {
        throw new Error('네트워크')
      },
    })
    await expect(notifyInventorySlotsLow('user-1', client)).resolves.toBeUndefined()
    expect(createNotificationMock).not.toHaveBeenCalled()
  })

  it('알림 생성이 예외를 던져도 본 흐름으로 번지지 않는다', async () => {
    createNotificationMock.mockRejectedValueOnce(new Error('알림 실패'))
    const { client } = fakeClient({ rpc: { data: { ok: true, notify: true, stage: 1, free: 0 }, error: null }, maxSlots: 50 })
    await expect(notifyInventorySlotsLow('user-1', client)).resolves.toBeUndefined()
  })
})
