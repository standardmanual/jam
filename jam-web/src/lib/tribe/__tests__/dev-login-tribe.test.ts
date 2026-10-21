/**
 * 개발 로그인 계정의 트라이브 지정 (티켓 20261021_1247 1회, 사용자 결정 2)
 *
 * 고정하는 것
 *  - 계정의 tribe_id가 비어 있을 때만 활성 트라이브(is_active, sort_order 첫 번째) 하나를 지정한다.
 *  - 이미 트라이브가 있으면 아무것도 쓰지 않는다(트라이브 조회도 하지 않는다).
 *  - 활성 트라이브가 없으면 지정 없이 `no_active_tribe`로 계속한다(쓰지 않는다).
 *  - 읽기·쓰기 실패나 users 행 없음은 `skipped`로 돌려주고 던지지 않는다(로그인을 막지 않는다).
 *  - 쓰기는 이 계정의 행에만, `tribe_id IS NULL` 조건과 함께 건다(읽은 뒤 쓰기 전에 채워졌다면 덮어쓰지 않는다).
 *
 * 실제 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/tribe/__tests__/dev-login-tribe.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureDevLoginTribe } from '../dev-login-tribe'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const FIRST_TRIBE = 'tribe-first'

interface Scenario {
  user?: { data: { tribe_id: string | null } | null; error: { message: string } | null }
  tribes?: { data: { id: string }[] | null; error: { message: string } | null }
  update?: { error: { message: string } | null }
  throwOnUserRead?: boolean
}

interface Recorded {
  reads: string[]
  tribeQueries: { eqs: Record<string, unknown>; order?: { col: string; ascending: boolean }; limit?: number }[]
  updates: { payload: unknown; eqs: Record<string, unknown>; isNulls: string[] }[]
}

function makeFake(scenario: Scenario): { supabase: SupabaseClient; recorded: Recorded } {
  const recorded: Recorded = { reads: [], tribeQueries: [], updates: [] }
  const from = (table: string) => {
    if (table === 'users') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              recorded.reads.push('users')
              if (scenario.throwOnUserRead) throw new Error('network down')
              return scenario.user ?? { data: { tribe_id: null }, error: null }
            },
          }),
        }),
        update: (payload: unknown) => {
          const entry = { payload, eqs: {} as Record<string, unknown>, isNulls: [] as string[] }
          recorded.updates.push(entry)
          const chain: Record<string, unknown> = {
            eq: (col: string, val: unknown) => {
              entry.eqs[col] = val
              return chain
            },
            is: async (col: string, val: unknown) => {
              if (val === null) entry.isNulls.push(col)
              return scenario.update ?? { error: null }
            },
          }
          return chain
        },
      }
    }
    if (table === 'tribes') {
      return {
        select: () => {
          recorded.reads.push('tribes')
          const query = { eqs: {} as Record<string, unknown>, order: undefined as { col: string; ascending: boolean } | undefined, limit: undefined as number | undefined }
          recorded.tribeQueries.push(query)
          const chain: Record<string, unknown> = {
            eq: (col: string, val: unknown) => {
              query.eqs[col] = val
              return chain
            },
            order: (col: string, opts: { ascending: boolean }) => {
              query.order = { col, ascending: opts.ascending }
              return chain
            },
            limit: async (n: number) => {
              query.limit = n
              return scenario.tribes ?? { data: [{ id: FIRST_TRIBE }], error: null }
            },
          }
          return chain
        },
      }
    }
    throw new Error(`makeFake: 예상치 못한 테이블 — ${table}`)
  }
  return { supabase: { from } as unknown as SupabaseClient, recorded }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

describe('ensureDevLoginTribe', () => {
  it('트라이브가 비어 있으면 활성 트라이브 하나를 지정한다', async () => {
    const { supabase, recorded } = makeFake({})

    await expect(ensureDevLoginTribe(supabase, USER_ID)).resolves.toBe('assigned')

    expect(recorded.updates).toEqual([{ payload: { tribe_id: FIRST_TRIBE }, eqs: { id: USER_ID }, isNulls: ['tribe_id'] }])
  })

  it('활성 트라이브 가운데 sort_order가 가장 앞선 하나를 고른다(is_active, 오름차순, 1개)', async () => {
    const { supabase, recorded } = makeFake({})

    await ensureDevLoginTribe(supabase, USER_ID)

    expect(recorded.tribeQueries).toEqual([{ eqs: { is_active: true }, order: { col: 'sort_order', ascending: true }, limit: 1 }])
  })

  it('이미 트라이브가 있으면 아무것도 쓰지 않고 트라이브도 조회하지 않는다', async () => {
    const { supabase, recorded } = makeFake({ user: { data: { tribe_id: 'tribe-existing' }, error: null } })

    await expect(ensureDevLoginTribe(supabase, USER_ID)).resolves.toBe('kept')

    expect(recorded.updates).toEqual([])
    expect(recorded.reads).toEqual(['users'])
  })

  it('활성 트라이브가 없으면 지정 없이 계속한다(쓰지 않는다)', async () => {
    const { supabase, recorded } = makeFake({ tribes: { data: [], error: null } })

    await expect(ensureDevLoginTribe(supabase, USER_ID)).resolves.toBe('no_active_tribe')

    expect(recorded.updates).toEqual([])
  })

  it('활성 트라이브 조회 결과가 null이어도 지정 없이 계속한다', async () => {
    const { supabase, recorded } = makeFake({ tribes: { data: null, error: null } })

    await expect(ensureDevLoginTribe(supabase, USER_ID)).resolves.toBe('no_active_tribe')
    expect(recorded.updates).toEqual([])
  })

  it('users 행이 없으면 지정하지 않고 skipped다', async () => {
    const { supabase, recorded } = makeFake({ user: { data: null, error: null } })

    await expect(ensureDevLoginTribe(supabase, USER_ID)).resolves.toBe('skipped')

    expect(recorded.updates).toEqual([])
  })

  it('계정 조회가 실패하면 던지지 않고 skipped다', async () => {
    const { supabase, recorded } = makeFake({ user: { data: null, error: { message: 'db down' } } })

    await expect(ensureDevLoginTribe(supabase, USER_ID)).resolves.toBe('skipped')

    expect(recorded.updates).toEqual([])
  })

  it('트라이브 조회가 실패하면 던지지 않고 skipped다', async () => {
    const { supabase, recorded } = makeFake({ tribes: { data: null, error: { message: 'db down' } } })

    await expect(ensureDevLoginTribe(supabase, USER_ID)).resolves.toBe('skipped')

    expect(recorded.updates).toEqual([])
  })

  it('쓰기가 실패하면 던지지 않고 skipped다', async () => {
    const { supabase } = makeFake({ update: { error: { message: 'db down' } } })

    await expect(ensureDevLoginTribe(supabase, USER_ID)).resolves.toBe('skipped')
  })

  it('예상치 못한 예외가 나도 로그인을 막지 않도록 던지지 않는다', async () => {
    const { supabase } = makeFake({ throwOnUserRead: true })

    await expect(ensureDevLoginTribe(supabase, USER_ID)).resolves.toBe('skipped')
  })

  it('tribe_id가 빈 문자열이면 비어 있는 것으로 보고 지정한다', async () => {
    const { supabase } = makeFake({ user: { data: { tribe_id: '' }, error: null } })

    await expect(ensureDevLoginTribe(supabase, USER_ID)).resolves.toBe('assigned')
  })
})
