/**
 * lib/capsule/auto-fill — 동기화 자동 채움 반복 (티켓 20261028_1733 2회, 20261105_0103 T3, 20261105_1437 R1)
 *
 * 고정하는 것:
 * - 한 라운드 = `capsule_auto_fill` → (`reachedChapters`가 있으면 오름 처리) → 가득 찼으면 열기. 가득 찬 채 남은 캡슐은 잼을 쓰지 않고 맨 앞에서 먼저 처리된다.
 * - 오름 처리(`processChapterRise`)는 채움 호출 결과에서만 부른다. 열기(`openCapsule`)는 오름 처리를 하지 않으므로 이중 호출이 없다.
 * - 열기가 대기 보상 저장(`held`)을 돌려주면 `inventory_blocked`로 멈춘다(`inventoryBlocked: true`). 지갑 잼은 그대로이고 그때까지 열린 캡슐은 `opens`에 합쳐 담긴다.
 *   채움 응답이 `pendingCount > 0`이면(이미 대기 보상이 있다) 열기를 시도하지 않고 같은 이유로 멈춘다. `capsule_hold_reward`는 부르지 않고, `holds`·`forfeitedTotal`·`alerts`·`blockedNow`는 항상 비어 있다(소비처가 T5까지 읽는다).
 * - 지갑이 비어 가득 못 채우면 `wallet_empty`. 열 수 없으면(`CapsuleError`) 오류가 아니라 `blocked`. 이용 정지는 `suspended`. 예상 밖 실패는 던지지 않는 쪽은 `error`로 돌려주고
 *   그때까지의 진행분을 보존하며, 던지는 쪽은 던진다. 같은 동기화를 다시 보내면(지갑 0) 아무것도 하지 않는다. 50라운드 상한에서 멈춘다.
 * - 재진입 방지(티켓 20261028_1735 2회): 같은 프로세스에서 한 유저의 자동 채움이 돌고 있으면 안쪽 호출은 아무 일도 하지 않고 `busy`(진행 분 없음)로 돌아온다. 끝나면(예외·실패 포함) 풀리고, 다른 유저는 막지 않는다.
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

/** `capsule_auto_fill`이 차례로 돌려줄 응답(모자라면 마지막 응답을 되풀이). 다른 RPC(`capsule_hold_reward` 포함)는 예상 밖이라 던진다 */
function fakeClient(steps: FillStep[]) {
  let i = 0
  const calls: string[] = []
  const rpc = vi.fn(async (name: string) => {
    calls.push(name)
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
      inventoryBlocked: false,
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
    for (const call of openMock.mock.calls) expect(call[2]).not.toHaveProperty('counted')
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

describe('runCapsuleAutoFill — 빈칸이 모자라면 먼저 추첨해 저장하고 멈춘다 (티켓 20261105_1437 R1)', () => {
  const held = () => ({ held: true as const, drawnCount: 2, next: { required: 145, filled: 0 } })

  it('N개째 캡슐이 대기 보상으로 저장되면(held) inventory_blocked로 멈춘다 — 그때까지 연 캡슐은 합쳐서 남는다', async () => {
    const { client, calls } = fakeClient([{ ok: true, applied: 145, full: true }])
    openMock.mockResolvedValueOnce(opened(1)).mockResolvedValueOnce(opened(2)).mockResolvedValueOnce(held())

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(result.stopped).toBe('inventory_blocked')
    expect(result.inventoryBlocked).toBe(true)
    expect(result.blockedCode).toBe('insufficient_slots')
    expect(result.opens.map((o) => o.openId)).toEqual(['open-1', 'open-2'])
    expect(result.rounds).toBe(3)
    // 새 캡슐을 채우거나 열지 않는다. 보관 함수·소멸·알림 단계도 없다
    expect(calls).toEqual(['capsule_auto_fill', 'capsule_auto_fill', 'capsule_auto_fill'])
    expect(openMock).toHaveBeenCalledTimes(3)
    expect(result.holds).toEqual([])
    expect(result.forfeitedTotal).toBe(0)
    expect(result.alerts).toEqual([])
    expect(result.blockedNow).toBe(false)
    expect(result.error).toBeUndefined()
  })

  it('저장 뒤 지갑 잼은 그대로다 — 저장한 라운드 뒤에 채움 RPC를 더 부르지 않는다 (opens에 held는 들어가지 않는다)', async () => {
    const { client, rpc } = fakeClient([{ ok: true, applied: 145, full: true, balance: 2640 }])
    openMock.mockResolvedValueOnce(held())

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(result).toMatchObject({ stopped: 'inventory_blocked', inventoryBlocked: true, filledAmount: 145, opens: [], rounds: 1 })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('이미 대기 보상이 있으면(pendingCount > 0) 열기를 시도하지 않고 같은 이유로 멈춘다', async () => {
    const { client, rpc } = fakeClient([{ ok: true, applied: 0, full: false, pendingCount: 1 }])

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(result).toMatchObject({ stopped: 'inventory_blocked', inventoryBlocked: true, blockedCode: 'insufficient_slots', filledAmount: 0, opens: [], rounds: 1 })
    expect(openMock).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('대기 보상이 있으면 가득 찬 캡슐이 보여도 열지 않는다 (pendingCount가 먼저)', async () => {
    const { client } = fakeClient([{ ok: true, applied: 0, full: true, pendingCount: 2 }])

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(result.stopped).toBe('inventory_blocked')
    expect(openMock).not.toHaveBeenCalled()
  })

  it('대기 보상이 비워진 뒤 다음 동기화는 평소처럼 열고 이어서 채운다', async () => {
    const retry = fakeClient([
      { ok: true, applied: 0, full: true, pendingCount: 0 },
      { ok: true, applied: 40, full: false, pendingCount: 0 },
    ])
    openMock.mockResolvedValueOnce(opened(1))
    const result = await runCapsuleAutoFill(retry.client, USER_ID)

    expect(result).toMatchObject({ stopped: 'wallet_empty', inventoryBlocked: false, filledAmount: 40 })
    expect(result.opens).toHaveLength(1)
  })

  it('열 수 있는 동안은 inventoryBlocked가 false다', async () => {
    const { client } = fakeClient([{ ok: true, applied: 145, full: true }, { ok: true, applied: 0, full: false }])
    openMock.mockResolvedValueOnce(opened(1))
    expect((await runCapsuleAutoFill(client, USER_ID)).inventoryBlocked).toBe(false)
  })

  it('DB가 고정값 키(pendingCount 0·forfeited·alertStage)를 돌려줘도 소멸·단계 알림이 생기지 않는다', async () => {
    const { client } = fakeClient([{ ok: true, applied: 30, full: false, pendingCount: 0, forfeited: 0, alertStage: null }])
    const result = await runCapsuleAutoFill(client, USER_ID)
    expect(result).toMatchObject({ stopped: 'wallet_empty', forfeitedTotal: 0, alerts: [], holds: [], blockedNow: false })
  })

  it('경쟁으로 열기가 insufficient_slots로 거절되면 blocked로 멈추고 캡슐은 가득 찬 채 남는다 (다음 동기화가 다시 시도한다)', async () => {
    const { client } = fakeClient([{ ok: true, applied: 145, full: true }])
    openMock.mockRejectedValueOnce(new CapsuleError('insufficient_slots', { freeSlots: 0, neededSlots: 2 }))

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(result).toMatchObject({ stopped: 'blocked', blockedCode: 'insufficient_slots', inventoryBlocked: false })
  })

  it('열기가 빈칸 외 이유로 거절되면(no_tribe) inventory_blocked가 아니라 blocked로 멈춘다', async () => {
    const { client } = fakeClient([{ ok: true, applied: 145, full: true }])
    openMock.mockRejectedValueOnce(new CapsuleError('no_tribe'))

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(result).toMatchObject({ stopped: 'blocked', blockedCode: 'no_tribe', inventoryBlocked: false })
  })

  it('OrThrow도 inventory_blocked는 던지지 않고 같은 결과를 돌려준다', async () => {
    openMock.mockResolvedValueOnce(held())
    const result = await runCapsuleAutoFillOrThrow(fakeClient([{ ok: true, applied: 5, full: true }]).client, USER_ID)
    expect(result).toMatchObject({ stopped: 'inventory_blocked', inventoryBlocked: true })
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

  it('인벤토리에 막혀 열리지 못하는 캡슐도 100%에 닿은 호출에서 오름이 처리된다', async () => {
    const { client } = fakeClient([{ ok: true, applied: 145, full: true, chapterNo: 4, reachedChapters: [5] }])
    openMock.mockRejectedValueOnce(new CapsuleError('insufficient_slots'))

    await runCapsuleAutoFill(client, USER_ID)

    expect(riseMock).toHaveBeenCalledTimes(1)
    expect(riseMock).toHaveBeenCalledWith({ userId: USER_ID, reachedChapters: [5] })
  })

  it('처리한 오름은 결과의 reachedChapters에 순서대로 담긴다 — 열기가 막힌 채 오른 오름도 담긴다', async () => {
    const { client } = fakeClient([{ ok: true, applied: 145, full: true, chapterNo: 4, reachedChapters: [5] }])
    openMock.mockRejectedValueOnce(new CapsuleError('insufficient_slots'))

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
      { ok: true, applied: 0, full: true, chapterNo: 2, reachedChapters: [], chapterCount: 3 },
      { ok: true, applied: 0, full: false },
    ])
    openMock.mockResolvedValueOnce(opened(1, { chapterNo: null, chapterCount: 3 }))

    const result = await runCapsuleAutoFill(client, USER_ID)

    expect(result.opens[0]).toMatchObject({ chapterNo: null, reachedChapters: [], chapterCount: 3 })
  })
})

describe('runCapsuleAutoFill — 재진입 방지 (티켓 20261028_1735 2회)', () => {
  const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222'
  const BUSY_RESULT = {
    filledAmount: 0,
    opens: [],
    holds: [],
    forfeitedTotal: 0,
    alerts: [],
    blockedNow: false,
    inventoryBlocked: false,
    reachedChapters: [],
    rounds: 0,
    stopped: 'busy',
  }

  it('바깥이 도는 동안 같은 유저의 안쪽 호출은 아무 일도 하지 않고 busy로 건너뛴다 (RPC·열기·오름 처리 없음, 소식 재료도 없음)', async () => {
    const outer = fakeClient([
      { ok: true, applied: 145, full: true },
      { ok: true, applied: 0, full: false },
    ])
    const inner = fakeClient([{ ok: true, applied: 50, full: false }])
    let innerResult: Awaited<ReturnType<typeof runCapsuleAutoFill>> | undefined
    // 캡슐 보상이 컬렉션을 완성해 서비스 활동 잼이 지급되고, 그 지급이 자동 채움을 다시 부르는 순간을 흉내낸다
    openMock.mockImplementationOnce(async () => {
      innerResult = await runCapsuleAutoFill(inner.client, USER_ID)
      return opened(1)
    })

    const result = await runCapsuleAutoFill(outer.client, USER_ID)

    expect(innerResult).toEqual(BUSY_RESULT)
    expect(inner.rpc).not.toHaveBeenCalled()
    // 바깥은 영향을 받지 않고 라운드마다 지갑을 다시 읽어 이어서 채운다
    expect(result.stopped).toBe('wallet_empty')
    expect(result.opens.map((o) => o.openId)).toEqual(['open-1'])
    expect(outer.rpc).toHaveBeenCalledTimes(2)
    expect(riseMock).not.toHaveBeenCalled()
  })

  it('끝나면 풀려서 다시 돌 수 있다', async () => {
    const first = fakeClient([{ ok: true, applied: 10, full: false }])
    const second = fakeClient([{ ok: true, applied: 20, full: false }])

    expect((await runCapsuleAutoFill(first.client, USER_ID)).stopped).toBe('wallet_empty')
    const again = await runCapsuleAutoFill(second.client, USER_ID)

    expect(again.stopped).toBe('wallet_empty')
    expect(again.filledAmount).toBe(20)
    expect(second.rpc).toHaveBeenCalledTimes(1)
  })

  it('예상 밖 실패(error)로 끝나도 풀린다', async () => {
    const failing = fakeClient([{ rpcError: '채움 장애' }])
    const healthy = fakeClient([{ ok: true, applied: 5, full: false }])

    expect((await runCapsuleAutoFill(failing.client, USER_ID)).stopped).toBe('error')
    expect((await runCapsuleAutoFill(healthy.client, USER_ID)).stopped).toBe('wallet_empty')
  })

  it('멈춤(blocked·suspended)으로 일찍 끝나도 풀린다', async () => {
    const blocked = fakeClient([{ ok: true, applied: 145, full: true }])
    openMock.mockRejectedValueOnce(new CapsuleError('no_tribe'))
    expect((await runCapsuleAutoFill(blocked.client, USER_ID)).stopped).toBe('blocked')

    const suspended = fakeClient([{ ok: false, error: 'user_suspended' }])
    expect((await runCapsuleAutoFill(suspended.client, USER_ID)).stopped).toBe('suspended')

    const healthy = fakeClient([{ ok: true, applied: 5, full: false }])
    expect((await runCapsuleAutoFill(healthy.client, USER_ID)).stopped).toBe('wallet_empty')
  })

  it('다른 유저의 자동 채움은 막지 않는다', async () => {
    const outer = fakeClient([{ ok: true, applied: 145, full: true }, { ok: true, applied: 0, full: false }])
    const other = fakeClient([{ ok: true, applied: 30, full: false }])
    let otherResult: Awaited<ReturnType<typeof runCapsuleAutoFill>> | undefined
    openMock.mockImplementationOnce(async () => {
      otherResult = await runCapsuleAutoFill(other.client, OTHER_USER_ID)
      return opened(1)
    })

    await runCapsuleAutoFill(outer.client, USER_ID)

    expect(otherResult?.stopped).toBe('wallet_empty')
    expect(otherResult?.filledAmount).toBe(30)
  })

  it('던지는 쪽(OrThrow)도 안쪽 busy는 오류가 아니라 던지지 않는다', async () => {
    const outer = fakeClient([{ ok: true, applied: 145, full: true }, { ok: true, applied: 0, full: false }])
    let innerResult: Awaited<ReturnType<typeof runCapsuleAutoFillOrThrow>> | undefined
    openMock.mockImplementationOnce(async () => {
      innerResult = await runCapsuleAutoFillOrThrow(fakeClient([{ ok: true, applied: 1, full: false }]).client, USER_ID)
      return opened(1)
    })

    await runCapsuleAutoFill(outer.client, USER_ID)

    expect(innerResult?.stopped).toBe('busy')
  })
})
