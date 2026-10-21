/**
 * 트라이브 게이트 — 판정 함수와 서버 모듈 (티켓 20261021_1247 1회, 운영 로직 2장)
 *
 * 고정하는 것:
 * - 판정 기준은 `users.tribe_id` 하나다. `hasTribe`는 비어 있지 않은 문자열만 «있음»으로 본다(null·undefined·빈 문자열·숫자·객체는 «없음»).
 * - `getUserTribeId`는 이 유저의 `users` 행에서 `tribe_id` 한 칸만 읽는다. 없거나 행이 없으면 null, 읽지 못하면 던진다.
 * - `assertHasTribe`는 트라이브가 없으면 `TribeRequiredError`를 던지고, 있으면 조용히 끝난다.
 *   조회가 실패하면 «있음»으로 보지 않고 던지되, 그 오류는 `TribeRequiredError`가 아닌 일반 오류다(라우트가 403이 아니라 500으로 다룬다).
 * - 403 판별(`isTribeRequiredBody`·`isTribeRequiredBlock`)은 상태 403과 `code: 'tribe_required'`가 모두 맞을 때만 참이다.
 *
 * 실제 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/tribe/__tests__/gate.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertHasTribe, getUserTribeId, TribeRequiredError } from '../gate'
import {
  hasTribe,
  isTribeRequiredBlock,
  isTribeRequiredBody,
  TRIBE_REQUIRED_CODE,
  TRIBE_SELECT_PATH,
} from '../gate-contract'

const USER_ID = 'user-tribe-gate'
const TRIBE_ID = '3f2b7c1e-0000-4000-8000-000000000001'

interface Recorded {
  table?: string
  select?: string
  eqs: Record<string, unknown>
}

/** users 한 표만 흉내내는 가짜 클라이언트. 질의가 어떻게 걸렸는지 기록한다. */
function makeFake(result: { data: unknown; error: { message: string } | null }): { supabase: SupabaseClient; recorded: Recorded } {
  const recorded: Recorded = { eqs: {} }
  const chain: Record<string, unknown> = {
    select: (columns: string) => {
      recorded.select = columns
      return chain
    },
    eq: (col: string, val: unknown) => {
      recorded.eqs[col] = val
      return chain
    },
    maybeSingle: async () => result,
  }
  const supabase = {
    from: (table: string) => {
      recorded.table = table
      return chain
    },
  } as unknown as SupabaseClient
  return { supabase, recorded }
}

describe('hasTribe — 판정 기준은 tribe_id가 있는가 하나다', () => {
  it('비어 있지 않은 문자열이면 있음이다', () => {
    expect(hasTribe(TRIBE_ID)).toBe(true)
  })

  it.each([null, undefined, '', 0, 1, true, {}, []])('%o는 없음이다', (value) => {
    expect(hasTribe(value)).toBe(false)
  })
})

describe('getUserTribeId', () => {
  it('트라이브가 있으면 id를 돌려주고, 이 유저의 users 행에서 tribe_id 한 칸만 읽는다', async () => {
    const { supabase, recorded } = makeFake({ data: { tribe_id: TRIBE_ID }, error: null })

    await expect(getUserTribeId(supabase, USER_ID)).resolves.toBe(TRIBE_ID)
    expect(recorded.table).toBe('users')
    expect(recorded.select).toBe('tribe_id')
    expect(recorded.eqs).toEqual({ id: USER_ID })
  })

  it('tribe_id가 null이면 null이다', async () => {
    const { supabase } = makeFake({ data: { tribe_id: null }, error: null })

    await expect(getUserTribeId(supabase, USER_ID)).resolves.toBeNull()
  })

  it('users 행이 없어도 null이다(온보딩 전 계정)', async () => {
    const { supabase } = makeFake({ data: null, error: null })

    await expect(getUserTribeId(supabase, USER_ID)).resolves.toBeNull()
  })

  it('읽지 못하면 null로 삼키지 않고 던진다', async () => {
    const { supabase } = makeFake({ data: null, error: { message: 'db down' } })

    await expect(getUserTribeId(supabase, USER_ID)).rejects.toThrow('users.tribe_id 조회 실패: db down')
  })
})

describe('assertHasTribe', () => {
  it('트라이브가 있으면 아무 일도 하지 않는다', async () => {
    const { supabase } = makeFake({ data: { tribe_id: TRIBE_ID }, error: null })

    await expect(assertHasTribe(supabase, USER_ID)).resolves.toBeUndefined()
  })

  it('트라이브가 없으면 TribeRequiredError를 던진다', async () => {
    const { supabase } = makeFake({ data: { tribe_id: null }, error: null })

    await expect(assertHasTribe(supabase, USER_ID)).rejects.toBeInstanceOf(TribeRequiredError)
  })

  it('users 행이 없어도 TribeRequiredError를 던진다', async () => {
    const { supabase } = makeFake({ data: null, error: null })

    await expect(assertHasTribe(supabase, USER_ID)).rejects.toBeInstanceOf(TribeRequiredError)
  })

  it('조회가 실패하면 «있음»으로 보지 않고 던지며, 그 오류는 TribeRequiredError가 아니다', async () => {
    const { supabase } = makeFake({ data: null, error: { message: 'db down' } })

    const error = await assertHasTribe(supabase, USER_ID).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(TribeRequiredError)
  })
})

describe('403 판별', () => {
  const body = { error: 'x', code: TRIBE_REQUIRED_CODE, redirectTo: TRIBE_SELECT_PATH }

  it('상태 403과 code가 모두 맞을 때만 참이다', () => {
    expect(isTribeRequiredBody(403, body)).toBe(true)
    expect(isTribeRequiredBody(409, body)).toBe(false)
    expect(isTribeRequiredBody(403, { code: 'user_suspended' })).toBe(false)
    expect(isTribeRequiredBody(403, null)).toBe(false)
    expect(isTribeRequiredBody(403, 'tribe_required')).toBe(false)
  })

  it('Response에서도 같다. 본문이 JSON이 아니면 거짓이다', async () => {
    const json = (status: number, payload: unknown) => new Response(JSON.stringify(payload), { status })

    await expect(isTribeRequiredBlock(json(403, body))).resolves.toBe(true)
    await expect(isTribeRequiredBlock(json(403, { code: 'user_suspended' }))).resolves.toBe(false)
    await expect(isTribeRequiredBlock(json(500, body))).resolves.toBe(false)
    await expect(isTribeRequiredBlock(new Response('<html>', { status: 403 }))).resolves.toBe(false)
  })

  it('고르기 화면의 주소는 /onboarding이다', () => {
    expect(TRIBE_SELECT_PATH).toBe('/onboarding')
    expect(TRIBE_REQUIRED_CODE).toBe('tribe_required')
  })
})
