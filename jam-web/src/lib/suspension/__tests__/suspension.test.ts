/**
 * 이용 정지 검사 — 서버 모듈 (티켓 20261017_1426)
 *
 * 고정하는 것:
 * - `getActiveSuspension`은 이 유저의 진행 중(`lifted_at IS NULL`) 정지만 읽는다. 없으면 null.
 * - `assertNotSuspended`는 진행 중 정지가 있으면 까닭을 담은 `UserSuspendedError`를 던지고, 없으면 조용히 끝난다.
 * - 조회가 실패하면 «정지 아님»으로 보지 않고 던진다(`UserSuspendedError`가 아닌 일반 오류).
 * - `getSuspensionPeriods`는 이 유저의 모든 정지를 구간으로 바꾼다. 읽지 못하면 던진다.
 * - `getSuspendedUserIds`는 주어진 유저 가운데 진행 중(`lifted_at IS NULL`) 정지인 id만 모은다(미션 순위 제외, 티켓 20261019_1311).
 *   유저가 많으면 나누어 묻고, 읽지 못하면 던진다.
 *
 * 실제 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/suspension/__tests__/suspension.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertNotSuspended, getActiveSuspension, getSuspendedUserIds, getSuspensionPeriods, UserSuspendedError } from '../suspension'

const USER_ID = 'user-suspension'

interface Recorded {
  table?: string
  eqs: Record<string, unknown>
  isNulls: string[]
}

/** user_suspensions 한 표만 흉내내는 가짜 클라이언트. 질의가 어떻게 걸렸는지 기록한다. */
function makeFake(result: { data: unknown; error: { message: string } | null }): { supabase: SupabaseClient; recorded: Recorded } {
  const recorded: Recorded = { eqs: {}, isNulls: [] }
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      recorded.eqs[col] = val
      return chain
    },
    is: (col: string, val: unknown) => {
      if (val === null) recorded.isNulls.push(col)
      return chain
    },
    maybeSingle: async () => result,
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  }
  const supabase = {
    from: (table: string) => {
      recorded.table = table
      return chain
    },
  } as unknown as SupabaseClient
  return { supabase, recorded }
}

describe('getActiveSuspension', () => {
  it('진행 중인 정지가 있으면 id·까닭·건 시각을 돌려주고, 이 유저의 lifted_at IS NULL 행만 읽는다', async () => {
    const { supabase, recorded } = makeFake({
      data: { id: 'sus-1', reason: '반복적인 부정 기록', suspended_at: '2026-10-10T00:00:00.000Z' },
      error: null,
    })

    const active = await getActiveSuspension(supabase, USER_ID)

    expect(active).toEqual({ id: 'sus-1', reason: '반복적인 부정 기록', suspendedAt: '2026-10-10T00:00:00.000Z' })
    expect(recorded.table).toBe('user_suspensions')
    expect(recorded.eqs).toEqual({ user_id: USER_ID })
    expect(recorded.isNulls).toEqual(['lifted_at'])
  })

  it('진행 중인 정지가 없으면 null이다', async () => {
    const { supabase } = makeFake({ data: null, error: null })
    await expect(getActiveSuspension(supabase, USER_ID)).resolves.toBeNull()
  })

  it('조회가 실패하면 던진다', async () => {
    const { supabase } = makeFake({ data: null, error: { message: 'db down' } })
    await expect(getActiveSuspension(supabase, USER_ID)).rejects.toThrow('user_suspensions 조회 실패')
  })
})

describe('assertNotSuspended', () => {
  it('정지 중이면 까닭을 담은 UserSuspendedError를 던진다', async () => {
    const { supabase } = makeFake({
      data: { id: 'sus-1', reason: '운영 정책 위반', suspended_at: '2026-10-10T00:00:00.000Z' },
      error: null,
    })

    const run = assertNotSuspended(supabase, USER_ID)

    await expect(run).rejects.toBeInstanceOf(UserSuspendedError)
    await expect(run).rejects.toMatchObject({ reason: '운영 정책 위반', suspendedAt: '2026-10-10T00:00:00.000Z' })
  })

  it('정지 중이 아니면 아무 일도 하지 않는다', async () => {
    const { supabase } = makeFake({ data: null, error: null })
    await expect(assertNotSuspended(supabase, USER_ID)).resolves.toBeUndefined()
  })

  it('조회가 실패하면 «정지 아님»으로 보지 않고 일반 오류를 던진다', async () => {
    const { supabase } = makeFake({ data: null, error: { message: 'db down' } })

    const run = assertNotSuspended(supabase, USER_ID)

    await expect(run).rejects.toThrow('user_suspensions 조회 실패')
    await expect(run).rejects.not.toBeInstanceOf(UserSuspendedError)
  })
})

describe('getSuspensionPeriods', () => {
  it('끝난 정지와 진행 중인 정지를 모두 구간으로 바꾼다', async () => {
    const { supabase, recorded } = makeFake({
      data: [
        { suspended_at: '2026-09-01T00:00:00.000Z', lifted_at: '2026-09-03T00:00:00.000Z' },
        { suspended_at: '2026-10-10T00:00:00.000Z', lifted_at: null },
      ],
      error: null,
    })

    const periods = await getSuspensionPeriods(supabase, USER_ID)

    expect(periods).toEqual([
      { suspendedAt: '2026-09-01T00:00:00.000Z', liftedAt: '2026-09-03T00:00:00.000Z' },
      { suspendedAt: '2026-10-10T00:00:00.000Z', liftedAt: null },
    ])
    expect(recorded.eqs).toEqual({ user_id: USER_ID })
  })

  it('정지 이력이 없으면 빈 배열이다', async () => {
    const { supabase } = makeFake({ data: [], error: null })
    await expect(getSuspensionPeriods(supabase, USER_ID)).resolves.toEqual([])
  })

  it('조회가 실패하면 빈 배열로 넘기지 않고 던진다', async () => {
    const { supabase } = makeFake({ data: null, error: { message: 'db down' } })
    await expect(getSuspensionPeriods(supabase, USER_ID)).rejects.toThrow('user_suspensions 구간 조회 실패')
  })
})

describe('getSuspendedUserIds', () => {
  /** `in()`으로 받은 id 가운데 `rows`에 있는 것만 돌려주는 가짜 클라이언트. 질의를 기록한다. */
  function makeInFake(rows: string[], error: { message: string } | null = null) {
    const calls: { table: string; ids: string[]; isNulls: string[] }[] = []
    const supabase = {
      from: (table: string) => {
        const call = { table, ids: [] as string[], isNulls: [] as string[] }
        calls.push(call)
        const chain: Record<string, unknown> = {
          select: () => chain,
          in: (_col: string, ids: string[]) => {
            call.ids = ids
            return chain
          },
          is: (col: string, val: unknown) => {
            if (val === null) call.isNulls.push(col)
            return chain
          },
          then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
            Promise.resolve({
              data: error ? null : call.ids.filter((id) => rows.includes(id)).map((user_id) => ({ user_id })),
              error,
            }).then(onFulfilled, onRejected),
        }
        return chain
      },
    } as unknown as SupabaseClient
    return { supabase, calls }
  }

  it('진행 중인(lifted_at IS NULL) 정지 유저의 id만 모은다', async () => {
    const { supabase, calls } = makeInFake(['u2'])

    const ids = await getSuspendedUserIds(supabase, ['u1', 'u2', 'u3'])

    expect([...ids]).toEqual(['u2'])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ table: 'user_suspensions', ids: ['u1', 'u2', 'u3'], isNulls: ['lifted_at'] })
  })

  it('유저가 없으면 묻지 않고 빈 집합이다', async () => {
    const { supabase, calls } = makeInFake(['u2'])
    expect((await getSuspendedUserIds(supabase, [])).size).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it('유저가 많으면 100명씩 나누어 묻고 중복 id는 한 번만 묻는다', async () => {
    const users = Array.from({ length: 250 }, (_, i) => `u${i}`)
    const { supabase, calls } = makeInFake(['u5', 'u120', 'u249'])

    const ids = await getSuspendedUserIds(supabase, [...users, 'u0'])

    expect(calls.map((c) => c.ids.length)).toEqual([100, 100, 50])
    expect([...ids].sort()).toEqual(['u120', 'u249', 'u5'])
  })

  it('조회가 실패하면 «정지 없음»으로 넘기지 않고 던진다', async () => {
    const { supabase } = makeInFake([], { message: 'db down' })
    await expect(getSuspendedUserIds(supabase, ['u1'])).rejects.toThrow('user_suspensions 목록 조회 실패')
  })
})
