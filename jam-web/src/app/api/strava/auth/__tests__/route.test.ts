/**
 * GET /api/strava/auth — OAuth state 발급 테스트 (티켓 20261008_1349)
 *
 * 검증 대상:
 *  - 비로그인은 401이고 state 쿠키를 심지 않는다
 *  - 인가 URL의 state는 유저 UUID가 아니고(URL 어디에도 유저 UUID가 없다), 응답이 심는 쿠키 값과 같다
 *  - 쿠키 속성: httpOnly · sameSite=lax · path=/api/strava · maxAge=600 (secure는 production에서만)
 *  - 호출할 때마다 state 값이 다르다
 *  - 트라이브를 고르지 않은 유저는 Strava로 보내지 않고 403 `tribe_required`로 거절한다(state 쿠키도 심지 않는다) ·
 *    트라이브를 읽지 못하면 «있음»으로 보지 않고 500으로 거절한다 · 세션 유저의 트라이브만 확인한다 (티켓 20261021_1247)
 *
 * 실행: cd jam-web && npx vitest run src/app/api/strava/auth/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { d } from '@/lib/i18n'
import { TRIBE_REQUIRED_CODE } from '@/lib/tribe/gate-contract'

const USER_ID = '6f1c0f44-2f7a-4f6e-9a3d-0c1f4f1f9a11'
const COOKIE_NAME = 'strava_oauth_state'

const state = vi.hoisted(() => ({
  authenticated: true,
  tribe: 'has' as 'has' | 'none' | 'fail',
  checkedUserIds: [] as string[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        state.authenticated
          ? { data: { user: { id: USER_ID } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
  }),
  createServiceClient: () => ({}),
}))
// 트라이브 판정 자체는 lib/tribe/__tests__/gate.test.ts가 맡는다 — 여기서는 라우트가 그 결과를 응답으로 바꾸는 부분만 본다
vi.mock('@/lib/tribe/gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tribe/gate')>()
  return {
    ...actual,
    assertHasTribe: async (_client: unknown, userId: string) => {
      state.checkedUserIds.push(userId)
      if (state.tribe === 'none') throw new actual.TribeRequiredError()
      if (state.tribe === 'fail') throw new Error('users.tribe_id 조회 실패: db down')
    },
  }
})

import { GET } from '../route'

function readState(res: Response): { stateParam: string | null; location: string } {
  const location = res.headers.get('location') ?? ''
  return { stateParam: new URL(location).searchParams.get('state'), location }
}

describe('GET /api/strava/auth', () => {
  beforeEach(() => {
    state.authenticated = true
    state.tribe = 'has'
    state.checkedUserIds = []
    vi.stubEnv('STRAVA_CLIENT_ID', 'client-123')
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://jam.test')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('비로그인이면 401을 돌려주고 state 쿠키를 심지 않는다', async () => {
    state.authenticated = false

    const res = await GET()

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: d.common.authRequired })
    expect(res.cookies.get(COOKIE_NAME)).toBeUndefined()
  })

  it('인가 URL의 state는 유저 UUID가 아니고 쿠키 값과 같다', async () => {
    const res = await GET()

    const { stateParam, location } = readState(res)
    const cookie = res.cookies.get(COOKIE_NAME)

    expect(location.startsWith('https://www.strava.com/oauth/authorize?')).toBe(true)
    expect(stateParam).toBeTruthy()
    expect(stateParam).not.toBe(USER_ID)
    // 유저 UUID는 인가 URL 어디에도 들어가지 않는다
    expect(location).not.toContain(USER_ID)
    // 256비트 무작위 값 — base64url 43자
    expect(stateParam).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(cookie?.value).toBe(stateParam)
  })

  it('쿠키 속성은 httpOnly · sameSite=lax · path=/api/strava · maxAge=600이다', async () => {
    const res = await GET()

    const cookie = res.cookies.get(COOKIE_NAME)
    expect(cookie).toMatchObject({
      name: COOKIE_NAME,
      httpOnly: true,
      sameSite: 'lax',
      path: '/api/strava',
      maxAge: 600,
    })
    // 테스트 환경(NODE_ENV=test)에서는 secure를 켜지 않는다
    expect(cookie?.secure).not.toBe(true)
  })

  it('production에서는 쿠키에 secure가 붙는다', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const res = await GET()

    expect(res.cookies.get(COOKIE_NAME)?.secure).toBe(true)
  })

  it('호출할 때마다 state 값이 다르다', async () => {
    const first = readState(await GET()).stateParam
    const second = readState(await GET()).stateParam

    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(first).not.toBe(second)
  })

  describe('트라이브 게이트 (티켓 20261021_1247)', () => {
    it('트라이브가 없으면 Strava로 보내지 않고 403 tribe_required로 거절하며 state 쿠키를 심지 않는다', async () => {
      state.tribe = 'none'

      const res = await GET()

      expect(res.status).toBe(403)
      expect(res.headers.get('location')).toBeNull()
      expect(await res.json()).toEqual({
        error: d.tribeGate.connectBlocked,
        code: TRIBE_REQUIRED_CODE,
        redirectTo: '/onboarding',
      })
      expect(res.cookies.get(COOKIE_NAME)).toBeUndefined()
    })

    it('트라이브를 읽지 못하면 «있음»으로 보지 않고 500으로 거절한다(403 tribe_required가 아니다)', async () => {
      state.tribe = 'fail'
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const res = await GET()

      expect(res.status).toBe(500)
      expect(res.headers.get('location')).toBeNull()
      expect(await res.json()).toEqual({ error: d.auth.errorGeneric })
      expect(res.cookies.get(COOKIE_NAME)).toBeUndefined()
      errorSpy.mockRestore()
    })

    it('트라이브가 있으면 기존 동작 그대로 Strava 인가 URL로 보내고, 확인한 유저는 세션 유저뿐이다', async () => {
      const res = await GET()

      expect(res.status).toBeGreaterThanOrEqual(300)
      expect(res.status).toBeLessThan(400)
      expect(res.headers.get('location')).toContain('https://www.strava.com/oauth/authorize?')
      expect(state.checkedUserIds).toEqual([USER_ID])
    })

    it('비로그인은 트라이브를 확인하기 전에 401이다', async () => {
      state.authenticated = false

      const res = await GET()

      expect(res.status).toBe(401)
      expect(state.checkedUserIds).toEqual([])
    })
  })
})
