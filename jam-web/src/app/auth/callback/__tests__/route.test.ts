/**
 * GET /auth/callback — 로그인 직후 이동 판정 (티켓 20261021_1247 1회, 사용자 결정 1)
 *
 * 고정하는 것
 *  - 판정 기준은 `users.tribe_id` 하나다. 트라이브를 고르지 않았으면 `/onboarding`, 골랐으면 `/`로 보낸다.
 *  - 온보딩 완료 시각(`onboarding_completed_at`)은 판정에 쓰지 않는다 — 읽지도 않는다(select에 없다). 공용 DB의 «완료 시각은 있는데 트라이브가 없는» 계정은
 *    `(main)` 레이아웃 게이트와 같은 쪽(`/onboarding`)으로 간다.
 *  - 처음 가입한 유저(users 행이 없었음)에게만 `/onboarding?new_signup=1`이 붙는다.
 *  - 코드가 없거나 세션 교환·유저 조회가 실패하면 `/login?error=auth_failed`다.
 *
 * 실행: cd jam-web && npx vitest run src/app/auth/callback/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const ORIGIN = 'https://jam.test'
const USER_ID = '11111111-1111-4111-8111-111111111111'

const state = vi.hoisted(() => ({
  exchangeError: null as null | { message: string },
  user: { id: '11111111-1111-4111-8111-111111111111', email: 'runner@example.com', user_metadata: {} } as null | {
    id: string
    email: string
    user_metadata: Record<string, unknown>
  },
  existing: null as null | Record<string, unknown>,
  selects: [] as string[],
  upserts: [] as unknown[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: async () => ({ error: state.exchangeError }),
      getUser: async () => ({ data: { user: state.user } }),
    },
  }),
  createServiceClient: () => ({
    from: () => ({
      select: (columns: string) => {
        state.selects.push(columns)
        return { eq: () => ({ maybeSingle: async () => ({ data: state.existing, error: null }) }) }
      },
      upsert: async (payload: unknown) => {
        state.upserts.push(payload)
        return { error: null }
      },
    }),
  }),
}))

import { GET } from '../route'

function request(code: string | null = 'auth-code'): NextRequest {
  const url = new URL(`${ORIGIN}/auth/callback`)
  if (code !== null) url.searchParams.set('code', code)
  return new NextRequest(url)
}

const location = (res: Response) => res.headers.get('location') ?? ''

beforeEach(() => {
  state.exchangeError = null
  state.user = { id: USER_ID, email: 'runner@example.com', user_metadata: {} }
  state.existing = null
  state.selects = []
  state.upserts = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /auth/callback — 트라이브 기준 이동', () => {
  it('트라이브가 없으면 /onboarding으로 보낸다', async () => {
    state.existing = { avatar_url: null, username: 'runner', tribe_id: null }

    expect(location(await GET(request()))).toBe(`${ORIGIN}/onboarding`)
  })

  it('트라이브가 있으면 홈으로 보낸다', async () => {
    state.existing = { avatar_url: null, username: 'runner', tribe_id: 'tribe-1' }

    expect(location(await GET(request()))).toBe(`${ORIGIN}/`)
  })

  it('온보딩 완료 시각이 있어도 트라이브가 없으면 /onboarding으로 보낸다(공용 DB의 7개 계정 유형)', async () => {
    state.existing = { avatar_url: null, username: 'runner', tribe_id: null, onboarding_completed_at: '2026-09-20T00:00:00.000Z' }

    expect(location(await GET(request()))).toBe(`${ORIGIN}/onboarding`)
  })

  it('완료 시각이 없어도 트라이브가 있으면 홈으로 보낸다', async () => {
    state.existing = { avatar_url: null, username: 'runner', tribe_id: 'tribe-1', onboarding_completed_at: null }

    expect(location(await GET(request()))).toBe(`${ORIGIN}/`)
  })

  it('tribe_id가 빈 문자열이면 트라이브가 없는 것이다', async () => {
    state.existing = { avatar_url: null, username: 'runner', tribe_id: '' }

    expect(location(await GET(request()))).toBe(`${ORIGIN}/onboarding`)
  })

  it('users 행이 없던 신규 가입은 /onboarding?new_signup=1이다', async () => {
    state.existing = null

    expect(location(await GET(request()))).toBe(`${ORIGIN}/onboarding?new_signup=1`)
  })

  it('판정을 위해 읽는 칸에 tribe_id가 있고 onboarding_completed_at은 없다', async () => {
    state.existing = { avatar_url: null, username: 'runner', tribe_id: null }

    await GET(request())

    expect(state.selects).toHaveLength(1)
    expect(state.selects[0].split(',').map((c) => c.trim())).toContain('tribe_id')
    expect(state.selects[0]).not.toContain('onboarding_completed_at')
  })
})

describe('GET /auth/callback — 실패', () => {
  it('코드가 없으면 로그인 오류로 보낸다', async () => {
    expect(location(await GET(request(null)))).toBe(`${ORIGIN}/login?error=auth_failed`)
  })

  it('세션 교환이 실패하면 로그인 오류로 보낸다', async () => {
    state.exchangeError = { message: 'bad code' }

    expect(location(await GET(request()))).toBe(`${ORIGIN}/login?error=auth_failed`)
  })

  it('유저를 읽지 못하면 로그인 오류로 보낸다', async () => {
    state.user = null

    expect(location(await GET(request()))).toBe(`${ORIGIN}/login?error=auth_failed`)
  })
})
