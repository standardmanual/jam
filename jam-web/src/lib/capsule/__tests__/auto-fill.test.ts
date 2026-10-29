/**
 * lib/capsule/auto-fill — 동기화 자동 채움 반복 (티켓 20261028_1733 2회, 20261028_1734 2회)
 *
 * 고정하는 것:
 * - 한 라운드 = `capsule_auto_fill` → (`reachedChapters`가 있으면 오름 처리) → 가득 찼으면 «열기 또는 보류». 가득 찬 채 남은 캡슐은 잼을 쓰지 않고 맨 앞에서 먼저 처리된다.
 * - 오름 처리(`processChapterRise`)는 채움 호출 결과에서만 부른다. 열기(`openCapsule`)는 오름 처리를 하지 않으므로 이중 호출이 없다.
 * - 보류가 없으면 열기를 시도하고 `insufficient_slots`면 보류한다. 보류가 있으면 열지 않고 바로 보류한다. 둘째 보류에서 `blockedNow`.
 * - 보류 2개에서는 채움이 소멸(`forfeited`)시키고 `applied 0`으로 돌아와 `wallet_empty`로 멈춘다. 가득 찬 호출이 준 알림 단계는 무시한다.
 * - 지갑이 비어 가득 못 채우면 `wallet_empty`. 열 수 없으면(`CapsuleError`) 오류가 아니라 `blocked`. 이용 정지는 `suspended`. 예상 밖 실패는 던지지 않는 쪽은 `error`로 돌려주고
 *   그때까지의 진행분을 보존하며, 던지는 쪽은 던진다. 같은 동기화를 다시 보내면(지갑 0) 아무것도 하지 않는다. 50라운드 상한에서 멈춘다.
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
const riseMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/chapter/rise', () => ({ processChapterRise: async (...args: unknown[]) => riseMock(...args) }))

import { CAPSULE_AUTO_FILL_MAX_ROUNDS, runCapsuleAutoFill, runCapsuleAutoFillOrThrow } from '../auto-fill'

type FillStep =
  | ({ ok: true; applied: number; full: boolean } & Record<string, unknown>)
  | { ok: false; error: string }
  | { rpcError: string }
type HoldStep = Record<string, unknown>

/** `capsule_auto_fill`이 차례로 돌려줄 응답(모자라면 마지막 응답을 되풀이)과 `capsule_hold_reward`의 응답 */
function fakeClient(steps: FillStep[], holds: HoldStep[] = []) {
  let i = 0
  let h = 0
  const calls: string[] = []
  const rpc = vi.fn(async (name: string) => {
    calls.push(name)
    if (name === 'capsule_hold_reward') {
      const hold = holds[Math.min(h++, holds.length - 1)]
      if (!hold) throw new Error('보류 응답이 준비되지 않았다')
      return { data: hold, error: null }
    }
    if (name !== 'capsule_auto_fill') throw new Error(`예상하지 못한 RPC ${name}`)
    const step = steps[Math.min(i++, steps.length - 1)]
    if ('rpcError' in step) return { data: null, error: { message: step.rpcError } }
    return { data: step, error: null }
  })
  return { client: { rpc } as unknown as SupabaseClient, rpc, calls }
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
  riseMock.mockReset()
  riseMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('runCapsuleAutoFill — 반복', () => {
  it('지갑이 비어 가득 못 채우면 열지 않고 wallet_empty로 멈춘다(채운 양은 합산)', async () => {
    const { client, rpc } = fakeClient([{ ok: true, applied: 130, full: false }])

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(result).toEqual({
      filledAmount: 130,
      opens: [],
      holds: [],
      forfeitedTotal: 0,
      alerts: [],
      blockedNow: false,
      reachedChapters: [],
      rounds: 1,
      stopped: 'wallet_empty',
    })
    expect(rpc).toHaveBeenCalledWith('capsule_auto_fill', { p_user_id: USER_ID })
    expect(openMock).not.toHaveBeenCalled()
  })

  it('한 번에 여러 캡슐이 차면 채움 → 열기를 되풀이하고 열린 순서대로 담는다', async () => {
    const { client, rpc } = fakeClient([
      { ok: true, applied: 145, full: true },
      { ok: true, applied: 145, full: true },
      { ok: true, applied: 145, full: true, chapterNo: 1, reachedChapters: [2], chapterCount: 0 },
      { ok: true, applied: 60, full: false },
    ])
    openMock.mockResolvedValueOnce(opened(1)).mockResolvedValueOnce(opened(2)).mockResolvedValueOnce(opened(3))

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(result.stopped).toBe('wallet_empty')
    expect(result.rounds).toBe(4)
    expect(result.filledAmount).toBe(145 * 3 + 60)
    expect(result.opens.map((o) => o.openId)).toEqual(['open-1', 'open-2', 'open-3'])
    // 닿은 호출의 오름 정보가 열기 응답에 얹힌다(열기 쪽 DB는 더는 세지 않는다)
    expect(result.opens[2]).toMatchObject({ chapterNo: 1, reachedChapters: [2], chapterCount: 0 })
    expect(riseMock).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledTimes(4)
    expect(openMock).toHaveBeenCalledTimes(3)
    for (const call of openMock.mock.calls) expect(call[2]).toMatchObject({ counted: true })
  })

  it('skipRiseBadgeEvaluation은 켰을 때만 오름 처리에 챕터 배지 판정 생략으로 넘어간다 (동기화 끝 판정이 챕터 배지를 이어서 읽는 호출부용)', async () => {
    const steps = [{ ok: true, applied: 145, full: true, reachedChapters: [2] }, { ok: true, applied: 0, full: false }] as FillStep[]
    openMock.mockResolvedValue(opened(1))

    await runCapsuleAutoFill(fakeClient(steps).client, USER_ID, { skipRiseBadgeEvaluation: true })
    expect(riseMock).toHaveBeenLastCalledWith({ userId: USER_ID, reachedChapters: [2] }, { skipBadgeEvaluation: true })

    riseMock.mockClear()
    await runCapsuleAutoFill(fakeClient(steps).client, USER_ID)
    expect(riseMock).toHaveBeenLastCalledWith({ userId: USER_ID, reachedChapters: [2] })
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
  it('열 수 없으면(트라이브 없음 등) 오류가 아니라 blocked로 멈추고, 그 전에 연 캡슐은 보존한다', async () => {
    const { client } = fakeClient([{ ok: true, applied: 145, full: true }])
    openMock
      .mockResolvedValueOnce(opened(1))
      .mockRejectedValueOnce(new CapsuleError('no_tribe'))

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(result.stopped).toBe('blocked')
    expect(result.blockedCode).toBe('no_tribe')
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

const held = (slot: number, pendingCount: number, blockedNow = false) => ({
  ok: true,
  slot,
  pendingCount,
  blockedNow,
  next: { required: 160, filled: 0, chapterNo: 1 },
})

describe('runCapsuleAutoFill — 보류 (티켓 20261028_1734 2회)', () => {
  it('보류가 없고 빈칸이 모자라 못 열면 보류로 옮기고 다음 캡슐을 이어서 채운다 (열기 시도 → insufficient_slots → hold)', async () => {
    const { client, calls } = fakeClient(
      [
        { ok: true, applied: 145, full: true, pendingCount: 0, chapterNo: 3 },
        { ok: true, applied: 0, full: false, pendingCount: 1 },
      ],
      [held(1, 1)]
    )
    openMock.mockRejectedValueOnce(new CapsuleError('insufficient_slots', undefined, { freeSlots: 1, neededSlots: 2 }))

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(calls).toEqual(['capsule_auto_fill', 'capsule_hold_reward', 'capsule_auto_fill'])
    expect(openMock).toHaveBeenCalledTimes(1)
    expect(result.opens).toEqual([])
    expect(result.holds).toEqual([{ slot: 1, pendingCount: 1, blockedNow: false, chapterNo: 3 }])
    expect(result.blockedNow).toBe(false)
    expect(result.stopped).toBe('wallet_empty')
    expect(result.rounds).toBe(2)
    expect(result.filledAmount).toBe(145)
  })

  it('보류가 이미 있으면 가득 차도 열지 않고 바로 보류한다 — 순서를 지킨다. 둘째 보류에서 blockedNow', async () => {
    const { client, calls } = fakeClient(
      [
        { ok: true, applied: 100, full: true, pendingCount: 1, chapterNo: 2 },
        { ok: true, applied: 0, full: false, pendingCount: 2, forfeited: 0 },
      ],
      [held(2, 2, true)]
    )

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(openMock).not.toHaveBeenCalled()
    expect(calls).toEqual(['capsule_auto_fill', 'capsule_hold_reward', 'capsule_auto_fill'])
    expect(result.holds).toEqual([{ slot: 2, pendingCount: 2, blockedNow: true, chapterNo: 2 }])
    expect(result.blockedNow).toBe(true)
    expect(result.stopped).toBe('wallet_empty')
  })

  it('응답에 pendingCount가 없어도 이 루프에서 만든 보류를 세어, 두 번째 가득 참은 열지 않고 보류한다', async () => {
    const { client } = fakeClient(
      [
        { ok: true, applied: 145, full: true },
        { ok: true, applied: 145, full: true },
        { ok: true, applied: 0, full: false },
      ],
      [held(1, 1), held(2, 2, true)]
    )
    openMock.mockRejectedValueOnce(new CapsuleError('insufficient_slots', undefined, { freeSlots: 0, neededSlots: 2 }))

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(openMock).toHaveBeenCalledTimes(1)
    expect(result.holds.map((h) => h.slot)).toEqual([1, 2])
    expect(result.blockedNow).toBe(true)
  })

  it('보류가 2개면 DB가 지갑 잼을 소멸시키고 applied 0으로 돌아오므로 wallet_empty로 멈춘다 (소멸 합계를 모은다)', async () => {
    const { client, calls } = fakeClient([{ ok: true, applied: 0, full: false, pendingCount: 2, forfeited: 66 }])

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(result).toMatchObject({ stopped: 'wallet_empty', forfeitedTotal: 66, filledAmount: 0, rounds: 1, holds: [], opens: [] })
    expect(calls).toEqual(['capsule_auto_fill'])
    expect(openMock).not.toHaveBeenCalled()
  })

  it('가득 찬 호출이 알림 단계를 함께 돌려줘도 무시하고 보류 전환만 따른다', async () => {
    const { client } = fakeClient(
      [
        { ok: true, applied: 120, full: true, pendingCount: 1, alertStage: 90, chapterNo: 1 },
        { ok: true, applied: 5, full: false, pendingCount: 2, alertStage: null },
      ],
      [held(2, 2, true)]
    )

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(result.alerts).toEqual([])
    expect(result.holds).toHaveLength(1)
    expect(result.blockedNow).toBe(true)
    expect(openMock).not.toHaveBeenCalled()
  })

  it('가득 차지 않은 호출의 단계(보류 하나일 때)는 alerts에 모은다', async () => {
    const { client } = fakeClient([{ ok: true, applied: 30, full: false, pendingCount: 1, alertStage: 80 }])
    expect((await runCapsuleAutoFill(client, USER_ID)).alerts).toEqual([80])
  })

  it('알 수 없는 단계 값(70·80·90이 아닌 값)은 버린다', async () => {
    const { client } = fakeClient([{ ok: true, applied: 30, full: false, pendingCount: 1, alertStage: 55 }])
    expect((await runCapsuleAutoFill(client, USER_ID)).alerts).toEqual([])
  })

  it('열기가 빈칸 외 이유로 거절되면(no_tribe) 보류하지 않고 blocked로 멈춘다', async () => {
    const { client, calls } = fakeClient([{ ok: true, applied: 145, full: true, pendingCount: 0 }])
    openMock.mockRejectedValueOnce(new CapsuleError('no_tribe'))

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(result).toMatchObject({ stopped: 'blocked', blockedCode: 'no_tribe', holds: [] })
    expect(calls).not.toContain('capsule_hold_reward')
  })

  it('보류 호출이 정지면 suspended, 보류 가득·가득 아님이면 blocked, 그 밖의 거절·해석 불가는 error다', async () => {
    const full = [{ ok: true, applied: 145, full: true, pendingCount: 1 }] as FillStep[]

    expect((await runCapsuleAutoFill(fakeClient(full, [{ ok: false, error: 'user_suspended' }]).client, USER_ID)).stopped).toBe('suspended')
    expect(await runCapsuleAutoFill(fakeClient(full, [{ ok: false, error: 'pending_full' }]).client, USER_ID)).toMatchObject({
      stopped: 'blocked',
      blockedCode: 'pending_full',
    })
    expect(await runCapsuleAutoFill(fakeClient(full, [{ ok: false, error: 'not_full' }]).client, USER_ID)).toMatchObject({
      stopped: 'blocked',
      blockedCode: 'not_full',
    })
    expect((await runCapsuleAutoFill(fakeClient(full, [{ ok: false, error: 'boom' }]).client, USER_ID)).stopped).toBe('error')
    expect((await runCapsuleAutoFill(fakeClient(full, [{ ok: true }]).client, USER_ID)).stopped).toBe('error')
  })

  it('가득 찬데 보류가 이미 2개로 보이면(동시 실행) 열지도 보류하지도 않고 blocked(pending_full)로 멈춘다', async () => {
    const { client, calls } = fakeClient([{ ok: true, applied: 0, full: true, pendingCount: 2 }])

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(result).toMatchObject({ stopped: 'blocked', blockedCode: 'pending_full' })
    expect(openMock).not.toHaveBeenCalled()
    expect(calls).toEqual(['capsule_auto_fill'])
  })

  it('보류로 옮긴 뒤 예상 밖 실패가 나도 던지지 않고 그때까지의 보류를 보존한다', async () => {
    const { client } = fakeClient(
      [
        { ok: true, applied: 145, full: true, pendingCount: 1, chapterNo: 1 },
        { rpcError: 'timeout' },
      ],
      [held(2, 2, true)]
    )

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(result.stopped).toBe('error')
    expect(result.holds).toHaveLength(1)
    expect(result.blockedNow).toBe(true)
  })
})

describe('runCapsuleAutoFill — 챕터 오름 처리 위치 (이중 호출 없음)', () => {
  it('오름은 채움 호출 결과에서 한 번만 처리하고 열기는 오름 옵션을 받지 않는다', async () => {
    const { client } = fakeClient([
      { ok: true, applied: 145, full: true, chapterNo: 1, reachedChapters: [2], chapterCount: 0 },
      { ok: true, applied: 0, full: false },
    ])
    openMock.mockResolvedValueOnce(opened(1))

    await runCapsuleAutoFill(client, USER_ID)

    expect(riseMock).toHaveBeenCalledTimes(1)
    expect(riseMock).toHaveBeenCalledWith({ userId: USER_ID, reachedChapters: [2] })
    expect(openMock.mock.calls[0][2]).not.toHaveProperty('skipRiseBadgeEvaluation')
  })

  it('보류로 옮기는 캡슐도 100%에 닿은 호출에서 오름이 처리된다', async () => {
    const { client } = fakeClient(
      [
        { ok: true, applied: 145, full: true, pendingCount: 1, chapterNo: 4, reachedChapters: [5] },
        { ok: true, applied: 0, full: false, pendingCount: 2 },
      ],
      [held(2, 2, true)]
    )

    await runCapsuleAutoFill(client, USER_ID)

    expect(riseMock).toHaveBeenCalledTimes(1)
    expect(riseMock).toHaveBeenCalledWith({ userId: USER_ID, reachedChapters: [5] })
  })

  it('처리한 오름은 결과의 reachedChapters에 순서대로 담긴다 — 열기 없이 보류만 생긴 오름도 담긴다(티켓 20261028_1734 3회)', async () => {
    const { client } = fakeClient(
      [
        { ok: true, applied: 145, full: true, pendingCount: 1, chapterNo: 4, reachedChapters: [5] },
        { ok: true, applied: 0, full: false, pendingCount: 2 },
      ],
      [held(2, 2, true)]
    )

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(result.opens).toEqual([])
    expect(result.reachedChapters).toEqual([5])
  })

  it('오름이 없는 호출에서는 오름 처리를 부르지 않는다', async () => {
    await runCapsuleAutoFill(fakeClient([{ ok: true, applied: 5, full: false, reachedChapters: [] }]).client, USER_ID)
    expect(riseMock).not.toHaveBeenCalled()
  })

  it('이미 가득 찬 캡슐을 이어서 여는 호출(applied 0)은 오름 정보를 얹지 않는다 — 센 것은 지난 동기화다', async () => {
    const { client } = fakeClient([
      { ok: true, applied: 0, full: true, pendingCount: 0, chapterNo: 2, reachedChapters: [], chapterCount: 3 },
      { ok: true, applied: 0, full: false },
    ])
    openMock.mockResolvedValueOnce(opened(1, { chapterNo: null, chapterCount: 3 }))

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(result.opens[0]).toMatchObject({ chapterNo: null, reachedChapters: [], chapterCount: 3 })
  })
})
