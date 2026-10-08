/**
 * GET /api/strava/callback — state 쿠키 대조 · 세션 유저 저장 테스트 (티켓 20261008_1349)
 *
 * 검증 대상:
 *  - 쿠키가 없거나 state와 다르면 `state_mismatch`로 거부하고, Strava 토큰 교환(fetch)·
 *    strava_connections upsert·동기화가 한 번도 호출되지 않는다
 *  - 쿠키가 맞아도 로그인 세션이 없으면 `auth_required`로 거부하고 위 세 호출이 없다
 *  - 정상 경로에서 upsert의 user_id와 동기화 인자는 URL의 state가 아니라 세션 유저 ID다
 *    (state에 다른 유저의 UUID 모양 값을 넣어도 결과가 같다)
 *  - 모든 응답(Strava error, 누락, 불일치, 미로그인, 토큰 교환 실패, DB 오류, 서버 오류, 성공)이
 *    state 쿠키를 지운다(maxAge 0, 심을 때와 같은 path)
 *  - Strava가 돌려준 error 값은 인코딩해서 리다이렉트 URL에 넣는다
 *  - 거부 로그에 쿠키 값·state·code가 들어가지 않는다
 *
 * 실행: cd jam-web && npx vitest run src/app/api/strava/callback/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const SESSION_USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '99999999-9999-4999-8999-999999999999'
const COOKIE_NAME = 'strava_oauth_state'
const STATE = 'valid-state-value-0123456789abcdefghijklmnopq'
const CODE = 'strava-auth-code-secret'
const BASE_URL = 'https://jam.test'

const state = vi.hoisted(() => ({ authenticated: true }))

const upsertMock = vi.hoisted(() =>
  vi.fn<(payload: Record<string, unknown>, options: Record<string, unknown>) => Promise<{ error: unknown }>>()
)
const syncMock = vi.hoisted(() => vi.fn<(userId: string) => Promise<void>>())
const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        state.authenticated
          ? { data: { user: { id: SESSION_USER_ID } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
  }),
  createServiceClient: () => ({
    from: () => ({ upsert: upsertMock }),
  }),
}))
vi.mock('@/lib/utils', () => ({
  encrypt: async (text: string) => `enc:${text}`,
}))
vi.mock('@/lib/strava/sync', () => ({
  syncStravaActivities: (userId: string) => syncMock(userId),
}))

import { GET } from '../route'

interface RequestOptions {
  cookie?: string | null
  stateParam?: string | null
  code?: string | null
  error?: string
}

function makeRequest({ cookie = STATE, stateParam = STATE, code = CODE, error }: RequestOptions = {}) {
  const url = new URL(`${BASE_URL}/api/strava/callback`)
  if (code !== null) url.searchParams.set('code', code)
  if (stateParam !== null) url.searchParams.set('state', stateParam)
  if (error !== undefined) url.searchParams.set('error', error)
  const headers: Record<string, string> = {}
  if (cookie !== null) headers.cookie = `${COOKIE_NAME}=${cookie}`
  return new NextRequest(url, { headers })
}

function location(res: Response): string {
  return res.headers.get('location') ?? ''
}

function expectStateCookieCleared(res: Response) {
  const cleared = (res as import('next/server').NextResponse).cookies.get(COOKIE_NAME)
  expect(cleared).toMatchObject({ name: COOKIE_NAME, value: '', maxAge: 0, path: '/api/strava' })
}

function expectNothingExecuted() {
  expect(fetchMock).not.toHaveBeenCalled()
  expect(upsertMock).not.toHaveBeenCalled()
  expect(syncMock).not.toHaveBeenCalled()
}

const tokenResponse = () => ({
  ok: true,
  json: async () => ({
    access_token: 'access',
    refresh_token: 'refresh',
    expires_at: 1_800_000_000,
    athlete: { id: 424242 },
  }),
  text: async () => '',
})

describe('GET /api/strava/callback', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    state.authenticated = true
    upsertMock.mockReset().mockResolvedValue({ error: null })
    syncMock.mockReset().mockResolvedValue(undefined)
    fetchMock.mockReset().mockResolvedValue(tokenResponse())
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', BASE_URL)
    vi.stubEnv('STRAVA_CLIENT_ID', 'client-123')
    vi.stubEnv('STRAVA_CLIENT_SECRET', 'secret-xyz')
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  describe('state 쿠키 대조', () => {
    it('쿠키가 없으면 state_mismatch로 거부하고 토큰 교환·upsert·동기화를 하지 않는다', async () => {
      const res = await GET(makeRequest({ cookie: null }))

      expect(location(res)).toBe(`${BASE_URL}/profile?strava=error&reason=state_mismatch`)
      expectNothingExecuted()
      expectStateCookieCleared(res)
    })

    it('쿠키 값이 비어 있으면 state_mismatch로 거부한다', async () => {
      const res = await GET(makeRequest({ cookie: '' }))

      expect(location(res)).toBe(`${BASE_URL}/profile?strava=error&reason=state_mismatch`)
      expectNothingExecuted()
      expectStateCookieCleared(res)
    })

    it('쿠키와 state가 다르면 state_mismatch로 거부하고 토큰 교환·upsert·동기화를 하지 않는다', async () => {
      const res = await GET(makeRequest({ cookie: STATE, stateParam: OTHER_USER_ID }))

      expect(location(res)).toBe(`${BASE_URL}/profile?strava=error&reason=state_mismatch`)
      expectNothingExecuted()
      expectStateCookieCleared(res)
    })

    it('한쪽이 다른 쪽의 접두사여도(길이만 다른 경우) 거부한다', async () => {
      const shorter = STATE.slice(0, STATE.length - 1)

      const cookieLonger = await GET(makeRequest({ cookie: STATE, stateParam: shorter }))
      const stateLonger = await GET(makeRequest({ cookie: shorter, stateParam: STATE }))

      expect(location(cookieLonger)).toContain('reason=state_mismatch')
      expect(location(stateLonger)).toContain('reason=state_mismatch')
      expectNothingExecuted()
    })

    it('거부 로그에 쿠키 값·state·code가 들어가지 않는다', async () => {
      await GET(makeRequest({ cookie: 'cookie-secret-aaaa', stateParam: 'state-secret-bbbb' }))

      const logged = JSON.stringify([...warnSpy.mock.calls, ...errorSpy.mock.calls])
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(logged).not.toContain('cookie-secret-aaaa')
      expect(logged).not.toContain('state-secret-bbbb')
      expect(logged).not.toContain(CODE)
    })
  })

  describe('로그인 세션', () => {
    it('쿠키가 맞아도 세션이 없으면 auth_required로 거부하고 토큰 교환·upsert·동기화를 하지 않는다', async () => {
      state.authenticated = false

      const res = await GET(makeRequest())

      expect(location(res)).toBe(`${BASE_URL}/profile?strava=error&reason=auth_required`)
      expectNothingExecuted()
      expectStateCookieCleared(res)
    })

    it('세션 거부 로그에도 쿠키 값·state·code가 들어가지 않는다', async () => {
      state.authenticated = false

      await GET(makeRequest())

      const logged = JSON.stringify([...warnSpy.mock.calls, ...errorSpy.mock.calls])
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(logged).not.toContain(STATE)
      expect(logged).not.toContain(CODE)
    })
  })

  describe('정상 경로', () => {
    it('세션 유저 ID로 저장하고 동기화한다', async () => {
      const res = await GET(makeRequest())

      expect(location(res)).toBe(`${BASE_URL}/profile?strava=connected&reveal=1`)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(upsertMock).toHaveBeenCalledTimes(1)
      const [payload, options] = upsertMock.mock.calls[0]
      expect(payload).toMatchObject({
        user_id: SESSION_USER_ID,
        strava_athlete_id: 424242,
        access_token: 'enc:access',
        refresh_token: 'enc:refresh',
        backfill_completed: true,
        last_synced_at: null,
      })
      expect(options).toEqual({ onConflict: 'strava_athlete_id' })
      expect(syncMock).toHaveBeenCalledTimes(1)
      expect(syncMock).toHaveBeenCalledWith(SESSION_USER_ID)
      expectStateCookieCleared(res)
    })

    it('state에 다른 유저의 UUID 모양 값을 넣어도 세션 유저로 저장한다', async () => {
      // 공격자가 state에 피해자 UUID를 넣고 쿠키도 같은 값으로 맞춘 경우 — 대조는 통과해도
      // URL의 state는 유저 번호로 쓰이지 않는다
      const res = await GET(makeRequest({ cookie: OTHER_USER_ID, stateParam: OTHER_USER_ID }))

      expect(location(res)).toBe(`${BASE_URL}/profile?strava=connected&reveal=1`)
      expect(upsertMock.mock.calls[0][0]).toMatchObject({ user_id: SESSION_USER_ID })
      expect(syncMock).toHaveBeenCalledWith(SESSION_USER_ID)
      expect(syncMock).not.toHaveBeenCalledWith(OTHER_USER_ID)
      expectStateCookieCleared(res)
    })

    it('동기화가 실패해도 연동은 성공으로 돌려보내고 쿠키를 지운다', async () => {
      syncMock.mockRejectedValue(new Error('sync failed'))

      const res = await GET(makeRequest())

      expect(location(res)).toBe(`${BASE_URL}/profile?strava=connected&reveal=1`)
      expectStateCookieCleared(res)
    })
  })

  describe('모든 응답에서 state 쿠키를 지운다', () => {
    it('Strava error 파라미터', async () => {
      const res = await GET(makeRequest({ error: 'access_denied', code: null }))

      expect(location(res)).toBe(`${BASE_URL}/profile?strava=error&reason=access_denied`)
      expectNothingExecuted()
      expectStateCookieCleared(res)
    })

    it('code 누락', async () => {
      const res = await GET(makeRequest({ code: null }))

      expect(location(res)).toBe(`${BASE_URL}/profile?strava=error&reason=missing_params`)
      expectNothingExecuted()
      expectStateCookieCleared(res)
    })

    it('state 누락', async () => {
      const res = await GET(makeRequest({ stateParam: null }))

      expect(location(res)).toBe(`${BASE_URL}/profile?strava=error&reason=missing_params`)
      expectNothingExecuted()
      expectStateCookieCleared(res)
    })

    it('토큰 교환 실패', async () => {
      fetchMock.mockResolvedValue({ ok: false, text: async () => 'bad code' })

      const res = await GET(makeRequest())

      expect(location(res)).toBe(`${BASE_URL}/profile?strava=error&reason=token_exchange`)
      expect(upsertMock).not.toHaveBeenCalled()
      expect(syncMock).not.toHaveBeenCalled()
      expectStateCookieCleared(res)
    })

    it('DB 오류', async () => {
      upsertMock.mockResolvedValue({ error: { message: 'db down' } })

      const res = await GET(makeRequest())

      expect(location(res)).toBe(`${BASE_URL}/profile?strava=error&reason=db_error`)
      expect(syncMock).not.toHaveBeenCalled()
      expectStateCookieCleared(res)
    })

    it('처리 중 예외(server_error)', async () => {
      fetchMock.mockRejectedValue(new Error('network'))

      const res = await GET(makeRequest())

      expect(location(res)).toBe(`${BASE_URL}/profile?strava=error&reason=server_error`)
      expect(upsertMock).not.toHaveBeenCalled()
      expect(syncMock).not.toHaveBeenCalled()
      expectStateCookieCleared(res)
    })
  })

  describe('Strava error 값 인코딩', () => {
    it('쿼리 구분 문자가 들어 있어도 reason 한 값으로 인코딩해서 붙인다', async () => {
      const res = await GET(makeRequest({ error: 'a&strava=connected#x', code: null }))

      const redirected = new URL(location(res))
      expect(location(res)).toContain('reason=a%26strava%3Dconnected%23x')
      expect(redirected.searchParams.get('strava')).toBe('error')
      expect(redirected.searchParams.get('reason')).toBe('a&strava=connected#x')
      expectNothingExecuted()
    })
  })
})
