/**
 * lib/capsule/auto-fill — 동기화 자동 채움 반복 (티켓 20261028_1733 2회)
 *
 * 고정하는 것:
 * - 한 라운드 = `capsule_auto_fill` → 가득 찼으면 `openCapsule({ counted: true })`. 가득 찬 채 남은 캡슐은 잼을 쓰지 않고 맨 앞에서 먼저 열린다.
 * - 지갑이 비어 가득 못 채우면 `wallet_empty`로 멈춘다. 한 번에 여러 캡슐이 차면 열린 순서대로 `opens`에 담긴다.
 * - 열 수 없으면(`CapsuleError`) 오류가 아니라 `blocked`로 멈춘다. 이용 정지는 `suspended`. 예상 밖 실패는 던지지 않는 쪽은 `error`로 돌려주고
 *   그때까지의 진행분을 보존하며, 던지는 쪽은 던진다.
 * - 같은 동기화를 다시 보내면(지갑 0) 아무것도 열지 않고 `wallet_empty`다. 50라운드 상한에서 멈춘다.
 * 공용 DB는 호출하지 않는다 — 가짜 RPC와 가짜 열기만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/capsule/__tests__/auto-fill.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { UserSuspendedError } from '@/lib/suspension/suspension'
import { CapsuleError } from '../capsule'

const USER_ID = '11111111-1111-4111-8111-111111111111'

const openMock = vi.hoisted(() => vi.fn())
vi.mock('../open', () => ({ openCapsule: (...args: unknown[]) => openMock(...args) }))

import { CAPSULE_AUTO_FILL_MAX_ROUNDS, runCapsuleAutoFill, runCapsuleAutoFillOrThrow } from '../auto-fill'

type FillStep = { ok: true; applied: number; full: boolean } | { ok: false; error: string } | { rpcError: string }

/** `capsule_auto_fill`이 차례로 돌려줄 응답. 모자라면 마지막 응답을 되풀이한다 */
function fakeClient(steps: FillStep[]) {
  let i = 0
  const rpc = vi.fn(async (name: string) => {
    if (name !== 'capsule_auto_fill') throw new Error(`예상하지 못한 RPC ${name}`)
    const step = steps[Math.min(i++, steps.length - 1)]
    if ('rpcError' in step) return { data: null, error: { message: step.rpcError } }
    return { data: step, error: null }
  })
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

const opened = (n: number, extra: Record<string, unknown> = {}) => ({
  openId: `open-${n}`,
  items: [],
  next: { required: 145, filled: 0 },
  chapterNo: 1,
  reachedChapters: [],
  chapterCount: n,
  ...extra,
})

beforeEach(() => {
  openMock.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('runCapsuleAutoFill — 반복', () => {
  it('지갑이 비어 가득 못 채우면 열지 않고 wallet_empty로 멈춘다(채운 양은 합산)', async () => {
    const { client, rpc } = fakeClient([{ ok: true, applied: 130, full: false }])

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(result).toEqual({ filledAmount: 130, opens: [], rounds: 1, stopped: 'wallet_empty' })
    expect(rpc).toHaveBeenCalledWith('capsule_auto_fill', { p_user_id: USER_ID })
    expect(openMock).not.toHaveBeenCalled()
  })

  it('한 번에 여러 캡슐이 차면 채움 → 열기를 되풀이하고 열린 순서대로 담는다', async () => {
    const { client, rpc } = fakeClient([
      { ok: true, applied: 145, full: true },
      { ok: true, applied: 145, full: true },
      { ok: true, applied: 145, full: true },
      { ok: true, applied: 60, full: false },
    ])
    openMock
      .mockResolvedValueOnce(opened(1))
      .mockResolvedValueOnce(opened(2))
      .mockResolvedValueOnce(opened(3, { reachedChapters: [2], chapterCount: 0 }))

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(result.stopped).toBe('wallet_empty')
    expect(result.rounds).toBe(4)
    expect(result.filledAmount).toBe(145 * 3 + 60)
    expect(result.opens.map((o) => o.openId)).toEqual(['open-1', 'open-2', 'open-3'])
    expect(result.opens[2].reachedChapters).toEqual([2])
    expect(rpc).toHaveBeenCalledTimes(4)
    expect(openMock).toHaveBeenCalledTimes(3)
    for (const call of openMock.mock.calls) expect(call[2]).toMatchObject({ counted: true })
  })

  it('지난번에 열지 못해 가득 찬 채 남은 캡슐은 잼을 쓰지 않고(applied 0) 맨 앞에서 먼저 열린다', async () => {
    const { client } = fakeClient([
      { ok: true, applied: 0, full: true },
      { ok: true, applied: 0, full: false },
    ])
    openMock.mockResolvedValueOnce(opened(1))

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(result.opens).toHaveLength(1)
    expect(result.filledAmount).toBe(0)
    expect(result.stopped).toBe('wallet_empty')
  })

  it('같은 동기화를 다시 보내면 지갑이 0이라 아무것도 열지 않고 채우지 않는다', async () => {
    const { client } = fakeClient([{ ok: true, applied: 0, full: false }])

    const first = await runCapsuleAutoFill(client, USER_ID)
    const second = await runCapsuleAutoFill(client, USER_ID)

    for (const r of [first, second]) expect(r).toMatchObject({ filledAmount: 0, opens: [], stopped: 'wallet_empty' })
    expect(openMock).not.toHaveBeenCalled()
  })

  it('50라운드에서 멈춘다(max_rounds) — 남은 잼은 지갑에 남는다', async () => {
    const { client, rpc } = fakeClient([{ ok: true, applied: 5, full: true }])
    openMock.mockImplementation(async () => opened(1))

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(CAPSULE_AUTO_FILL_MAX_ROUNDS).toBe(50)
    expect(result.stopped).toBe('max_rounds')
    expect(result.rounds).toBe(50)
    expect(result.opens).toHaveLength(50)
    expect(rpc).toHaveBeenCalledTimes(50)
  })
})

describe('runCapsuleAutoFill — 멈춤과 실패', () => {
  it('열 수 없으면(빈칸 모자람 등) 오류가 아니라 blocked로 멈추고, 그 전에 연 캡슐은 보존한다', async () => {
    const { client } = fakeClient([{ ok: true, applied: 145, full: true }])
    openMock
      .mockResolvedValueOnce(opened(1))
      .mockRejectedValueOnce(new CapsuleError('insufficient_slots', undefined, { freeSlots: 0, neededSlots: 2 }))

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(result.stopped).toBe('blocked')
    expect(result.blockedCode).toBe('insufficient_slots')
    expect(result.opens).toHaveLength(1)
    expect(result.filledAmount).toBe(290)
    expect(result.error).toBeUndefined()
  })

  it('이용 정지는 채움 단계(user_suspended 응답)에서도 열기 단계(UserSuspendedError)에서도 suspended로 멈춘다', async () => {
    const atFill = await runCapsuleAutoFill(fakeClient([{ ok: false, error: 'user_suspended' }]).client, USER_ID)
    expect(atFill).toMatchObject({ stopped: 'suspended', opens: [], filledAmount: 0 })

    openMock.mockRejectedValueOnce(new UserSuspendedError({ reason: '어뷰징', suspendedAt: '2026-10-29T00:00:00Z' }))
    const atOpen = await runCapsuleAutoFill(fakeClient([{ ok: true, applied: 5, full: true }]).client, USER_ID)
    expect(atOpen).toMatchObject({ stopped: 'suspended', filledAmount: 5 })
  })

  it('예상 밖 실패는 던지지 않고 error로 돌려주며 그때까지의 진행분을 보존한다', async () => {
    const { client } = fakeClient([{ ok: true, applied: 145, full: true }])
    const boom = new Error('capsule_open_counted RPC 오류: down')
    openMock.mockResolvedValueOnce(opened(1)).mockRejectedValueOnce(boom)

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(result.stopped).toBe('error')
    expect(result.error).toBe(boom)
    expect(result.opens.map((o) => o.openId)).toEqual(['open-1'])
    expect(result.filledAmount).toBe(290)
  })

  it('채움 RPC 오류·거절·해석할 수 없는 응답도 던지지 않고 error다', async () => {
    for (const steps of [[{ rpcError: 'timeout' }], [{ ok: false, error: 'capsule_changed' }]] as FillStep[][]) {
      const result = await runCapsuleAutoFill(fakeClient(steps).client, USER_ID)
      expect(result.stopped).toBe('error')
      expect(result.error).toBeInstanceOf(Error)
    }
    const garbage = { rpc: vi.fn(async () => ({ data: { ok: true }, error: null })) } as unknown as SupabaseClient
    expect((await runCapsuleAutoFill(garbage, USER_ID)).stopped).toBe('error')
    expect(openMock).not.toHaveBeenCalled()
  })
})

describe('runCapsuleAutoFillOrThrow — 던지는 쪽', () => {
  it('정상 종료·blocked는 던지지 않고 같은 결과를 돌려준다', async () => {
    const ok = await runCapsuleAutoFillOrThrow(fakeClient([{ ok: true, applied: 0, full: false }]).client, USER_ID)
    expect(ok.stopped).toBe('wallet_empty')

    openMock.mockRejectedValueOnce(new CapsuleError('no_tribe'))
    const blocked = await runCapsuleAutoFillOrThrow(fakeClient([{ ok: true, applied: 5, full: true }]).client, USER_ID)
    expect(blocked).toMatchObject({ stopped: 'blocked', blockedCode: 'no_tribe' })
  })

  it('예상 밖 실패는 그 오류를 던진다', async () => {
    openMock.mockRejectedValueOnce(new Error('boom'))
    await expect(runCapsuleAutoFillOrThrow(fakeClient([{ ok: true, applied: 5, full: true }]).client, USER_ID)).rejects.toThrow('boom')
  })
})
