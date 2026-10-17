/**
 * GET /api/strava/callback — state 쿠키 대조 · 세션 유저 저장 테스트 (티켓 20261008_1349)
 *
 * 검증 대상:
 *  - 쿠키가 없거나 state와 다르면 `state_mismatch`로 거부하고, Strava 토큰 교환(fetch)·
 *    strava_connections 쓰기·동기화가 한 번도 호출되지 않는다
 *  - 쿠키가 맞아도 로그인 세션이 없으면 `auth_required`로 거부하고 위 세 호출이 없다
 *  - 정상 경로에서 저장한 행의 user_id와 동기화 인자는 URL의 state가 아니라 세션 유저 ID다
 *    (state에 다른 유저의 UUID 모양 값을 넣어도 결과가 같다)
 *  - 모든 응답(Strava error, 누락, 불일치, 미로그인, 토큰 교환 실패, DB 오류, 서버 오류, 성공)이
 *    state 쿠키를 지운다(maxAge 0, 심을 때와 같은 path)
 *  - Strava가 돌려준 error 값은 인코딩해서 리다이렉트 URL에 넣는다
 *  - 거부 로그에 쿠키 값·state·code가 들어가지 않는다
 *  - 연결 규칙(티켓 20261017_1422): 다른 JAM 계정에 이미 연결된 Strava 계정이면 아무것도 저장하지 않고
 *    `/profile?strava=duplicate`로 보내며 기존 행의 user_id가 그대로다 · 같은 계정 재연결은 토큰만 갱신하고
 *    끊김을 지운다 · 다른 계정 연결은 이전 행을 지우고 새 행을 first_sync_pending=true로 만든다
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

const syncMock = vi.hoisted(() => vi.fn<(userId: string) => Promise<void>>())
const fetchMock = vi.hoisted(() => vi.fn())

/** strava_connections의 메모리 안 가짜 — 필터(eq/neq)를 실제로 적용해 «덮어쓰기»를 관찰할 수 있다 */
type Row = Record<string, unknown>
const db = vi.hoisted(() => ({
  rows: [] as Row[],
  writes: [] as { op: string; payload?: Row }[],
  failOn: null as null | 'lookup' | 'insert' | 'update' | 'delete' | 'delete_old',
}))

function matcher(filters: { op: 'eq' | 'neq'; col: string; val: unknown }[]) {
  return (row: Row) => filters.every((f) => (f.op === 'eq' ? row[f.col] === f.val : row[f.col] !== f.val))
}

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
    from: (table: string) => {
      if (table !== 'strava_connections') throw new Error(`예상치 못한 테이블 — ${table}`)
      type Filter = { op: 'eq' | 'neq'; col: string; val: unknown }
      const filterChain = (
        run: (match: (row: Row) => boolean, filters: Filter[]) => { error: unknown; data?: unknown }
      ) => {
        const filters: Filter[] = []
        const chain: Record<string, unknown> = {
          eq: (col: string, val: unknown) => (filters.push({ op: 'eq', col, val }), chain),
          neq: (col: string, val: unknown) => (filters.push({ op: 'neq', col, val }), chain),
          maybeSingle: async () => run(matcher(filters), filters),
          then: (onFulfilled: (v: { error: unknown }) => unknown) =>
            Promise.resolve(run(matcher(filters), filters)).then(onFulfilled),
        }
        return chain
      }
      return {
        select: () =>
          filterChain((match) =>
            db.failOn === 'lookup'
              ? { data: null, error: { message: 'db down' } }
              : { data: db.rows.find(match) ?? null, error: null }
          ),
        insert: async (payload: Row) => {
          db.writes.push({ op: 'insert', payload })
          if (db.failOn === 'insert') return { error: { message: 'db down' } }
          if (db.rows.some((r) => r.strava_athlete_id === payload.strava_athlete_id)) {
            return { error: { code: '23505', message: 'duplicate key' } }
          }
          db.rows.push({ ...payload })
          return { error: null }
        },
        update: (payload: Row) =>
          filterChain((match) => {
            db.writes.push({ op: 'update', payload })
            if (db.failOn === 'update') return { error: { message: 'db down' } }
            db.rows.filter(match).forEach((r) => Object.assign(r, payload))
            return { error: null }
          }),
        delete: () =>
          filterChain((match, filters) => {
            db.writes.push({ op: 'delete' })
            if (db.failOn === 'delete') return { error: { message: 'db down' } }
            // 'delete_old' — 이전 연결 삭제(neq 필터)만 실패하고, 새 행 되돌림(eq만)은 성공한다
            if (db.failOn === 'delete_old' && filters.some((f) => f.op === 'neq')) {
              return { error: { message: 'db down' } }
            }
            db.rows = db.rows.filter((r) => !match(r))
            return { error: null }
          }),
      }
    },
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
  expect(db.writes).toHaveLength(0)
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
    db.rows = []
    db.writes = []
    db.failOn = null
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
    it('쿠키가 없으면 state_mismatch로 거부하고 토큰 교환·저장·동기화를 하지 않는다', async () => {
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

    it('쿠키와 state가 다르면 state_mismatch로 거부하고 토큰 교환·저장·동기화를 하지 않는다', async () => {
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
    it('쿠키가 맞아도 세션이 없으면 auth_required로 거부하고 토큰 교환·저장·동기화를 하지 않는다', async () => {
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
    it('세션 유저 ID로 저장하고 동기화한다 (새 연결은 첫 동기화 대기)', async () => {
      const res = await GET(makeRequest())

      expect(location(res)).toBe(`${BASE_URL}/profile?strava=connected&reveal=1`)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(db.rows).toHaveLength(1)
      expect(db.rows[0]).toMatchObject({
        user_id: SESSION_USER_ID,
        strava_athlete_id: 424242,
        access_token: 'enc:access',
        refresh_token: 'enc:refresh',
        backfill_completed: true,
        last_synced_at: null,
        first_sync_pending: true,
        disconnected_at: null,
        disconnect_reason: null,
      })
      expect(syncMock).toHaveBeenCalledTimes(1)
      expect(syncMock).toHaveBeenCalledWith(SESSION_USER_ID)
      expectStateCookieCleared(res)
    })

    it('state에 다른 유저의 UUID 모양 값을 넣어도 세션 유저로 저장한다', async () => {
      // 공격자가 state에 피해자 UUID를 넣고 쿠키도 같은 값으로 맞춘 경우 — 대조는 통과해도
      // URL의 state는 유저 번호로 쓰이지 않는다
      const res = await GET(makeRequest({ cookie: OTHER_USER_ID, stateParam: OTHER_USER_ID }))

      expect(location(res)).toBe(`${BASE_URL}/profile?strava=connected&reveal=1`)
      expect(db.rows[0]).toMatchObject({ user_id: SESSION_USER_ID })
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
      expect(db.writes).toHaveLength(0)
      expect(syncMock).not.toHaveBeenCalled()
      expectStateCookieCleared(res)
    })

    it('DB 오류', async () => {
      db.failOn = 'insert'

      const res = await GET(makeRequest())

      expect(location(res)).toBe(`${BASE_URL}/profile?strava=error&reason=db_error`)
      expect(syncMock).not.toHaveBeenCalled()
      expectStateCookieCleared(res)
    })

    it('처리 중 예외(server_error)', async () => {
      fetchMock.mockRejectedValue(new Error('network'))

      const res = await GET(makeRequest())

      expect(location(res)).toBe(`${BASE_URL}/profile?strava=error&reason=server_error`)
      expect(db.writes).toHaveLength(0)
      expect(syncMock).not.toHaveBeenCalled()
      expectStateCookieCleared(res)
    })
  })

  describe('연결 규칙 (티켓 20261017_1422)', () => {
    const ATHLETE = 424242
    const OTHER_ATHLETE = 777777

    const connRow = (userId: string, athleteId: number, extra: Row = {}): Row => ({
      user_id: userId,
      strava_athlete_id: athleteId,
      access_token: 'enc:old-access',
      refresh_token: 'enc:old-refresh',
      token_expires_at: '2026-01-01T00:00:00.000Z',
      last_synced_at: '2026-10-01T00:00:00.000Z',
      backfill_completed: true,
      first_sync_pending: false,
      disconnected_at: null,
      disconnect_reason: null,
      ...extra,
    })

    describe('이미 다른 JAM 계정에 연결된 Strava 계정', () => {
      it('저장하지 않고 duplicate 안내로 보내며 기존 행의 user_id와 토큰이 그대로다', async () => {
        db.rows = [connRow(OTHER_USER_ID, ATHLETE)]
        const before = JSON.parse(JSON.stringify(db.rows))

        const res = await GET(makeRequest())

        expect(location(res)).toBe(`${BASE_URL}/profile?strava=duplicate`)
        expect(db.writes).toHaveLength(0)
        expect(db.rows).toEqual(before)
        expect(db.rows[0].user_id).toBe(OTHER_USER_ID)
        expect(syncMock).not.toHaveBeenCalled()
        expectStateCookieCleared(res)
      })

      it('끊김 상태의 다른 계정 연결도 같다', async () => {
        db.rows = [
          connRow(OTHER_USER_ID, ATHLETE, { disconnected_at: '2026-10-10T00:00:00.000Z', disconnect_reason: 'token_revoked' }),
        ]
        const before = JSON.parse(JSON.stringify(db.rows))

        const res = await GET(makeRequest())

        expect(location(res)).toBe(`${BASE_URL}/profile?strava=duplicate`)
        expect(db.rows).toEqual(before)
        expect(db.writes).toHaveLength(0)
      })

      it('이 유저에게 다른 Strava 계정 연결이 있어도 지우지 않는다', async () => {
        db.rows = [connRow(OTHER_USER_ID, ATHLETE), connRow(SESSION_USER_ID, OTHER_ATHLETE)]
        const before = JSON.parse(JSON.stringify(db.rows))

        await GET(makeRequest())

        expect(db.rows).toEqual(before)
        expect(db.writes).toHaveLength(0)
      })

      it('안내 로그에 토큰·code가 들어가지 않는다', async () => {
        db.rows = [connRow(OTHER_USER_ID, ATHLETE)]

        await GET(makeRequest())

        const logged = JSON.stringify([...warnSpy.mock.calls, ...errorSpy.mock.calls])
        expect(logged).not.toContain('access')
        expect(logged).not.toContain('refresh')
        expect(logged).not.toContain(CODE)
      })
    })

    describe('같은 유저가 같은 Strava 계정을 다시 연결', () => {
      it('토큰을 갱신하고 끊김을 지우되 first_sync_pending·last_synced_at은 그대로다', async () => {
        db.rows = [
          connRow(SESSION_USER_ID, ATHLETE, {
            first_sync_pending: true,
            disconnected_at: '2026-10-10T00:00:00.000Z',
            disconnect_reason: 'token_refresh_failed',
          }),
        ]

        const res = await GET(makeRequest())

        expect(location(res)).toBe(`${BASE_URL}/profile?strava=connected&reveal=1`)
        expect(db.rows).toHaveLength(1)
        expect(db.rows[0]).toMatchObject({
          user_id: SESSION_USER_ID,
          strava_athlete_id: ATHLETE,
          access_token: 'enc:access',
          refresh_token: 'enc:refresh',
          disconnected_at: null,
          disconnect_reason: null,
          first_sync_pending: true,
          last_synced_at: '2026-10-01T00:00:00.000Z',
        })
        expect(db.writes.some((w) => w.op === 'insert')).toBe(false)
        expect(syncMock).toHaveBeenCalledWith(SESSION_USER_ID)
      })
    })

    describe('같은 유저가 다른 Strava 계정을 연결', () => {
      it('이전 연결 행을 지우고 새 행을 first_sync_pending=true로 만든다', async () => {
        db.rows = [connRow(SESSION_USER_ID, OTHER_ATHLETE, { first_sync_pending: false })]

        const res = await GET(makeRequest())

        expect(location(res)).toBe(`${BASE_URL}/profile?strava=connected&reveal=1`)
        expect(db.rows).toHaveLength(1)
        expect(db.rows[0]).toMatchObject({
          user_id: SESSION_USER_ID,
          strava_athlete_id: ATHLETE,
          first_sync_pending: true,
          last_synced_at: null,
          disconnected_at: null,
          access_token: 'enc:access',
        })
        expect(db.rows.some((r) => r.strava_athlete_id === OTHER_ATHLETE)).toBe(false)
        expect(syncMock).toHaveBeenCalledWith(SESSION_USER_ID)
      })

      it('끊김 상태의 이전 연결도 교체한다', async () => {
        db.rows = [
          connRow(SESSION_USER_ID, OTHER_ATHLETE, { disconnected_at: '2026-10-10T00:00:00.000Z', disconnect_reason: 'user_disconnected' }),
        ]

        await GET(makeRequest())

        expect(db.rows).toHaveLength(1)
        expect(db.rows[0]).toMatchObject({ strava_athlete_id: ATHLETE, first_sync_pending: true, disconnected_at: null })
      })

      it('다른 JAM 계정의 연결 행은 건드리지 않는다', async () => {
        const others = connRow(OTHER_USER_ID, OTHER_ATHLETE)
        db.rows = [connRow(SESSION_USER_ID, 555555), { ...others }]

        await GET(makeRequest())

        expect(db.rows.find((r) => r.strava_athlete_id === OTHER_ATHLETE)).toEqual(others)
        expect(db.rows.filter((r) => r.user_id === SESSION_USER_ID)).toHaveLength(1)
      })

      it('이전 연결 삭제가 실패하면 방금 넣은 새 행을 되돌려 같은 유저의 행이 둘 남지 않는다', async () => {
        db.rows = [connRow(SESSION_USER_ID, OTHER_ATHLETE)]
        db.failOn = 'delete_old'

        const res = await GET(makeRequest())

        expect(location(res)).toBe(`${BASE_URL}/profile?strava=error&reason=db_error`)
        // 새 행(ATHLETE)은 사라지고 이전 연결만 그대로 남는다
        expect(db.rows).toHaveLength(1)
        expect(db.rows[0].strava_athlete_id).toBe(OTHER_ATHLETE)
        expect(db.rows.filter((r) => r.user_id === SESSION_USER_ID)).toHaveLength(1)
        expect(syncMock).not.toHaveBeenCalled()
      })

      it('같은 Strava 계정을 다시 연결하는 경로에서는 되돌림이 기존 행을 지우지 않는다', async () => {
        db.rows = [connRow(SESSION_USER_ID, ATHLETE, { disconnected_at: '2026-10-10T00:00:00.000Z' })]
        db.failOn = 'delete_old'

        await GET(makeRequest())

        expect(db.rows).toHaveLength(1)
        expect(db.rows[0].strava_athlete_id).toBe(ATHLETE)
      })

      it('새 행 저장이 실패하면 이전 연결을 지우지 않는다', async () => {
        db.rows = [connRow(SESSION_USER_ID, OTHER_ATHLETE)]
        db.failOn = 'insert'

        const res = await GET(makeRequest())

        expect(location(res)).toBe(`${BASE_URL}/profile?strava=error&reason=db_error`)
        expect(db.rows).toHaveLength(1)
        expect(db.rows[0].strava_athlete_id).toBe(OTHER_ATHLETE)
        expect(db.writes.some((w) => w.op === 'delete')).toBe(false)
        expect(syncMock).not.toHaveBeenCalled()
      })
    })

    it('기존 연결 조회가 실패하면 아무것도 쓰지 않고 db_error로 보낸다', async () => {
      db.failOn = 'lookup'

      const res = await GET(makeRequest())

      expect(location(res)).toBe(`${BASE_URL}/profile?strava=error&reason=db_error`)
      expect(db.writes).toHaveLength(0)
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
