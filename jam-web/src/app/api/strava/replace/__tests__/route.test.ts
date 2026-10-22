/**
 * POST /api/strava/replace — «그래도 연결하기» 테스트 (티켓 20261021_1249 4회, 운영 로직 3.2절)
 *
 * 검증 대상
 *  - 비로그인은 401(next: restart)이고 아무것도 읽거나 쓰지 않는다
 *  - 제안 쿠키가 없거나 변조되었거나 만료되었거나 로그인한 유저의 것이 아니면 400(next: restart)이고 기존 계정을 읽지도 지우지도 않는다
 *  - 기존 계정이 그사이 어드민(is_admin·화이트리스트)이 되었거나 이용 정지 중이거나 유저 행이 없으면 403(next: blocked)이고 지우지 않는다
 *  - 기존 계정 조회·판정을 읽지 못하면 «지워도 된다»로 보지 않고 500(next: retry)
 *  - 성공 순서: 기존 계정 삭제(Strava 앱 해제 건너뛰기) → 새 연결 저장(first_sync_pending) → 이 유저의 이전 연결 정리 → 첫 동기화 → 200, 쿠키 지움
 *  - 삭제 실패는 500(retry)이고 저장하지 않으며 쿠키를 지우지 않아 다시 누를 수 있다
 *  - 삭제는 됐는데 저장이 실패하면 고정 문구(afterDeleteFailed)와 next: restart, 쿠키를 지운다
 *  - 기존 계정이 이미 없거나(not_found, 연결 행 없음) 이 유저 자신이면 지우지 않고 저장만 한다. 로그인한 유저 자신은 절대 지우지 않는다
 *  - 동기화가 실패해도 연결은 성공이다
 *  - 응답과 로그 어디에도 토큰·쿠키 값·DB 오류 원문이 없다
 *
 * 실제 Strava·공용 DB·계정 삭제는 부르지 않는다 — 가짜 클라이언트와 가짜 deleteAccount만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/strava/replace/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { d } from '@/lib/i18n'

const SESSION_USER_ID = '11111111-1111-4111-8111-111111111111'
const OWNER_ID = '99999999-9999-4999-8999-999999999999'
const OTHER_USER_ID = '55555555-5555-4555-8555-555555555555'
const ATHLETE = 424242
const OTHER_ATHLETE = 777777
const COOKIE_NAME = 'strava_replace_offer'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  authenticated: true,
  owner: null as null | { id: string; email: string | null; is_admin: boolean },
  ownerError: false,
  ownerSuspended: false,
  /** 쓰기 실패를 일으킨다 */
  failOn: null as null | 'lookup' | 'insert' | 'delete_old',
  encryptFails: false,
  order: [] as string[],
  ownerReads: [] as string[],
}))
const db = vi.hoisted(() => ({ rows: [] as Row[] }))
const deleteAccountMock = vi.hoisted(() => vi.fn())
const syncMock = vi.hoisted(() => vi.fn<(userId: string) => Promise<void>>())

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
      if (table === 'users' || table === 'user_suspensions') {
        const chain: Record<string, unknown> = {
          eq: (_col: string, val: unknown) => (state.ownerReads.push(`${table}:${String(val)}`), chain),
          is: () => chain,
          maybeSingle: async () =>
            table === 'users'
              ? { data: state.owner, error: state.ownerError ? { message: 'db down' } : null }
              : { data: state.ownerSuspended ? { id: 's1', reason: 'abuse', suspended_at: '2026-10-01T00:00:00.000Z' } : null, error: null },
        }
        return { select: () => chain }
      }
      if (table !== 'strava_connections') throw new Error(`예상치 못한 테이블 — ${table}`)

      type Filter = { op: 'eq' | 'neq'; col: string; val: unknown }
      const match = (filters: Filter[]) => (row: Row) =>
        filters.every((f) => (f.op === 'eq' ? row[f.col] === f.val : row[f.col] !== f.val))
      const filterChain = (run: (m: (row: Row) => boolean, filters: Filter[]) => { error: unknown; data?: unknown }) => {
        const filters: Filter[] = []
        const chain: Record<string, unknown> = {
          eq: (col: string, val: unknown) => (filters.push({ op: 'eq', col, val }), chain),
          neq: (col: string, val: unknown) => (filters.push({ op: 'neq', col, val }), chain),
          maybeSingle: async () => run(match(filters), filters),
          then: (onFulfilled: (v: { error: unknown }) => unknown) => Promise.resolve(run(match(filters), filters)).then(onFulfilled),
        }
        return chain
      }
      return {
        select: () =>
          filterChain((m) =>
            state.failOn === 'lookup'
              ? { data: null, error: { message: 'relation "strava_connections" does not exist' } }
              : { data: db.rows.find(m) ?? null, error: null }
          ),
        insert: async (payload: Row) => {
          state.order.push('save:insert')
          if (state.failOn === 'insert') return { error: { message: 'duplicate key value violates unique constraint' } }
          db.rows.push({ ...payload })
          return { error: null }
        },
        update: (payload: Row) =>
          filterChain((m) => {
            state.order.push('save:update')
            db.rows.filter(m).forEach((r) => Object.assign(r, payload))
            return { error: null }
          }),
        delete: () =>
          filterChain((m, filters) => {
            const isOld = filters.some((f) => f.op === 'neq')
            state.order.push(isOld ? 'save:delete_old' : 'save:rollback')
            if (isOld && state.failOn === 'delete_old') return { error: { message: 'db down' } }
            db.rows = db.rows.filter((r) => !m(r))
            return { error: null }
          }),
      }
    },
  }),
}))
vi.mock('@/lib/utils', () => ({
  encrypt: async (text: string) => {
    if (state.encryptFails) throw new Error('암호화 실패')
    return `enc:${text}`
  },
  decrypt: async (text: string) => text.replace(/^enc:/, ''),
}))
vi.mock('@/lib/account/delete-account', () => ({
  deleteAccount: (...args: unknown[]) => deleteAccountMock(...args),
}))
vi.mock('@/lib/strava/sync', () => ({
  syncStravaActivities: (userId: string) => syncMock(userId),
}))

import { POST } from '../route'
import { sealStravaReplaceOffer } from '@/lib/strava/replace-offer'

const OFFER = {
  userId: SESSION_USER_ID,
  athleteId: ATHLETE,
  accessToken: 'ACCESS-SECRET-TOKEN',
  refreshToken: 'REFRESH-SECRET-TOKEN',
  tokenExpiresAtSec: 1_800_000_000,
}

async function makeRequest(options: { cookie?: string | null; offer?: Partial<typeof OFFER>; sealedAt?: number } = {}) {
  const sealed =
    options.cookie !== undefined
      ? options.cookie
      : await sealStravaReplaceOffer({ ...OFFER, ...options.offer }, options.sealedAt)
  const headers: Record<string, string> = {}
  if (sealed !== null) headers.cookie = `${COOKIE_NAME}=${encodeURIComponent(sealed)}`
  return { request: new NextRequest('https://jam.test/api/strava/replace', { method: 'POST', headers }), sealed }
}

const connRow = (userId: string, athleteId: number, extra: Row = {}): Row => ({
  user_id: userId,
  strava_athlete_id: athleteId,
  access_token: 'enc:old-access',
  refresh_token: 'enc:old-refresh',
  token_expires_at: '2026-01-01T00:00:00.000Z',
  last_synced_at: '2026-10-01T00:00:00.000Z',
  first_sync_pending: false,
  disconnected_at: null,
  disconnect_reason: null,
  ...extra,
})

function offerCookie(res: Response) {
  return (res as import('next/server').NextResponse).cookies.get(COOKIE_NAME)
}

function expectOfferCleared(res: Response) {
  expect(offerCookie(res)).toMatchObject({ name: COOKIE_NAME, value: '', maxAge: 0, path: '/api/strava' })
}

function expectNothingExecuted() {
  expect(deleteAccountMock).not.toHaveBeenCalled()
  expect(state.order).toHaveLength(0)
  expect(syncMock).not.toHaveBeenCalled()
}

describe('POST /api/strava/replace', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>
  let infoSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    state.authenticated = true
    state.owner = { id: OWNER_ID, email: 'owner@example.com', is_admin: false }
    state.ownerError = false
    state.ownerSuspended = false
    state.failOn = null
    state.encryptFails = false
    state.order = []
    state.ownerReads = []
    db.rows = [connRow(OWNER_ID, ATHLETE), connRow(SESSION_USER_ID, OTHER_ATHLETE)]
    deleteAccountMock.mockReset().mockImplementation(async (_supabase: unknown, userId: string) => {
      state.order.push(`delete:${userId}`)
      // 계정을 지우면 외래키 CASCADE가 연결 행도 지운다
      db.rows = db.rows.filter((r) => r.user_id !== userId)
      return { ok: true, summary: { retained: {}, custodyRowsCleared: 0, vanishedItems: 0 } }
    })
    syncMock.mockReset().mockImplementation(async (userId: string) => {
      state.order.push(`sync:${userId}`)
    })
    vi.stubEnv('ENCRYPTION_KEY', 'ab'.repeat(32))
    vi.stubEnv('ADMIN_EMAILS', '')
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
    infoSpy.mockRestore()
  })

  describe('요청을 받아 주기 전 거부', () => {
    it('비로그인이면 401(restart)이고 아무것도 읽거나 쓰지 않는다', async () => {
      state.authenticated = false
      const { request } = await makeRequest()

      const res = await POST(request)

      expect(res.status).toBe(401)
      await expect(res.json()).resolves.toEqual({ error: d.stravaConnection.replaceResult.restart, next: 'restart' })
      expectNothingExecuted()
      expect(state.ownerReads).toHaveLength(0)
    })

    it.each([
      ['쿠키가 없으면', () => makeRequest({ cookie: null })],
      ['쿠키 값이 비어 있으면', () => makeRequest({ cookie: '' })],
      ['쿠키가 변조되었으면', async () => {
        const { sealed } = await makeRequest()
        const value = sealed as string
        const flipped = value.slice(0, 3) + (value[3] === '0' ? '1' : '0') + value.slice(4)
        return makeRequest({ cookie: flipped })
      }],
      ['쿠키가 만료되었으면', () => makeRequest({ sealedAt: Date.now() - 11 * 60 * 1000 })],
      ['쿠키가 다른 유저의 것이면', () => makeRequest({ offer: { userId: OTHER_USER_ID } })],
    ])('%s 400(restart)이고 기존 계정을 읽지도 지우지도 않으며 쿠키를 지운다', async (_label, build) => {
      const { request } = await build()

      const res = await POST(request)

      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toEqual({ error: d.stravaConnection.replaceResult.restart, next: 'restart' })
      expectNothingExecuted()
      expect(state.ownerReads).toHaveLength(0)
      expectOfferCleared(res)
    })
  })

  describe('기존 계정 판정', () => {
    it.each([
      ['어드민(is_admin)이면', () => { state.owner = { id: OWNER_ID, email: 'owner@example.com', is_admin: true } }],
      ['어드민 화이트리스트 이메일이면', () => { vi.stubEnv('ADMIN_EMAILS', 'owner@example.com') }],
      ['이용 정지 중이면', () => { state.ownerSuspended = true }],
      ['유저 행이 없으면', () => { state.owner = null }],
    ])('기존 계정이 %s 403(blocked)이고 지우지도 저장하지도 않는다', async (_label, arrange) => {
      arrange()
      const before = JSON.parse(JSON.stringify(db.rows))
      const { request } = await makeRequest()

      const res = await POST(request)

      expect(res.status).toBe(403)
      await expect(res.json()).resolves.toEqual({ error: d.stravaConnection.replaceResult.blocked, next: 'blocked' })
      expectNothingExecuted()
      expect(db.rows).toEqual(before)
      expectOfferCleared(res)
    })

    it('기존 계정을 읽지 못하면 «지워도 된다»로 보지 않고 500(retry)이며 쿠키를 지우지 않는다', async () => {
      state.ownerError = true
      const { request } = await makeRequest()

      const res = await POST(request)

      expect(res.status).toBe(500)
      await expect(res.json()).resolves.toEqual({ error: d.stravaConnection.replaceResult.retry, next: 'retry' })
      expectNothingExecuted()
      expect(offerCookie(res)).toBeUndefined()
    })

    it('연결 행 조회가 실패하면 500(retry)이고 오류 원문은 응답에 없다', async () => {
      state.failOn = 'lookup'
      const { request } = await makeRequest()

      const res = await POST(request)
      const text = JSON.stringify(await res.json())

      expect(res.status).toBe(500)
      expect(text).toContain(d.stravaConnection.replaceResult.retry)
      expect(text).not.toContain('does not exist')
      expectNothingExecuted()
    })

    it('지우기가 어드민을 거절하면(판정 뒤 어드민이 된 경합) 403(blocked)이고 저장하지 않는다', async () => {
      deleteAccountMock.mockResolvedValue({ ok: false, code: 'admin_account' })
      const { request } = await makeRequest()

      const res = await POST(request)

      expect(res.status).toBe(403)
      await expect(res.json()).resolves.toMatchObject({ next: 'blocked' })
      expect(state.order).toEqual([])
      expect(syncMock).not.toHaveBeenCalled()
      expectOfferCleared(res)
    })
  })

  describe('성공', () => {
    it('기존 계정을 앱 해제 없이 지우고 → 새 연결을 첫 동기화 대기로 저장하고 → 이 유저의 이전 연결을 정리하고 → 첫 동기화 → 쿠키를 지운다', async () => {
      const { request } = await makeRequest()

      const res = await POST(request)

      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toEqual({ success: true })
      expect(state.order).toEqual([`delete:${OWNER_ID}`, 'save:insert', 'save:delete_old', `sync:${SESSION_USER_ID}`])
      expect(deleteAccountMock).toHaveBeenCalledTimes(1)
      expect(deleteAccountMock.mock.calls[0][1]).toBe(OWNER_ID)
      expect(deleteAccountMock.mock.calls[0][2]).toEqual({ skipStravaDeauthorize: true })
      // 새 연결 하나만 남는다: 이 유저, 이 Strava 계정, 암호화된 토큰, 첫 동기화 대기
      expect(db.rows).toHaveLength(1)
      expect(db.rows[0]).toMatchObject({
        user_id: SESSION_USER_ID,
        strava_athlete_id: ATHLETE,
        access_token: 'enc:ACCESS-SECRET-TOKEN',
        refresh_token: 'enc:REFRESH-SECRET-TOKEN',
        first_sync_pending: true,
        last_synced_at: null,
        disconnected_at: null,
      })
      expectOfferCleared(res)
    })

    it('끊긴 연결 행을 가진 기존 계정도 같다', async () => {
      db.rows = [connRow(OWNER_ID, ATHLETE, { disconnected_at: '2026-10-10T00:00:00.000Z', disconnect_reason: 'user_disconnected' })]
      const { request } = await makeRequest()

      const res = await POST(request)

      expect(res.status).toBe(200)
      expect(db.rows).toHaveLength(1)
      expect(db.rows[0]).toMatchObject({ user_id: SESSION_USER_ID, disconnected_at: null, first_sync_pending: true })
    })

    it('동기화가 실패해도 연결은 성공이다', async () => {
      syncMock.mockRejectedValue(new Error('strava 500'))
      const { request } = await makeRequest()

      const res = await POST(request)

      expect(res.status).toBe(200)
      expect(db.rows[0]).toMatchObject({ user_id: SESSION_USER_ID, strava_athlete_id: ATHLETE })
    })

    it('그사이 기존 계정이 이미 지워졌으면(not_found) 지우기를 건너뛴 채 저장만 한다', async () => {
      deleteAccountMock.mockResolvedValue({ ok: false, code: 'not_found' })
      db.rows = [connRow(OWNER_ID, ATHLETE), connRow(SESSION_USER_ID, OTHER_ATHLETE)]
      // not_found 응답이라 가짜 deleteAccount가 연결 행을 지우지 않는다 — 실제로는 이미 지워진 상태이므로 행도 치운다
      deleteAccountMock.mockImplementation(async () => {
        db.rows = db.rows.filter((r) => r.user_id !== OWNER_ID)
        return { ok: false, code: 'not_found' }
      })
      const { request } = await makeRequest()

      const res = await POST(request)

      expect(res.status).toBe(200)
      expect(state.order).toEqual(['save:insert', 'save:delete_old', `sync:${SESSION_USER_ID}`])
    })

    it('연결 행을 가진 계정이 이미 없으면 지우기 없이 저장한다', async () => {
      db.rows = [connRow(SESSION_USER_ID, OTHER_ATHLETE)]
      const { request } = await makeRequest()

      const res = await POST(request)

      expect(res.status).toBe(200)
      expect(deleteAccountMock).not.toHaveBeenCalled()
      expect(state.ownerReads).toHaveLength(0)
      expect(db.rows).toHaveLength(1)
      expect(db.rows[0]).toMatchObject({ user_id: SESSION_USER_ID, strava_athlete_id: ATHLETE, first_sync_pending: true })
    })

    it('이 Strava 계정이 이미 로그인한 유저 자신의 것이면 지우지 않고 토큰만 갱신한다 — 자기 계정은 절대 지우지 않는다', async () => {
      db.rows = [connRow(SESSION_USER_ID, ATHLETE, { disconnected_at: '2026-10-10T00:00:00.000Z', disconnect_reason: 'user_disconnected' })]
      const { request } = await makeRequest()

      const res = await POST(request)

      expect(res.status).toBe(200)
      expect(deleteAccountMock).not.toHaveBeenCalled()
      expect(state.ownerReads).toHaveLength(0)
      expect(state.order).toEqual(['save:update', 'save:delete_old', `sync:${SESSION_USER_ID}`])
      expect(db.rows).toHaveLength(1)
      expect(db.rows[0]).toMatchObject({ user_id: SESSION_USER_ID, access_token: 'enc:ACCESS-SECRET-TOKEN', disconnected_at: null })
      // 같은 계정 재연결이라 첫 동기화 대기 표시를 바꾸지 않는다
      expect(db.rows[0].first_sync_pending).toBe(false)
    })
  })

  describe('실패', () => {
    it.each(['prepare_failed', 'delete_failed'])('기존 계정 삭제가 %s로 실패하면 500(retry)이고 저장·동기화를 하지 않으며 쿠키를 지우지 않는다', async (code) => {
      deleteAccountMock.mockResolvedValue({ ok: false, code })
      const before = JSON.parse(JSON.stringify(db.rows))
      const { request } = await makeRequest()

      const res = await POST(request)
      const body = await res.json()

      expect(res.status).toBe(500)
      expect(body).toEqual({ error: d.stravaConnection.replaceResult.retry, next: 'retry' })
      expect(JSON.stringify(body)).not.toContain(code)
      expect(state.order).toEqual([])
      expect(syncMock).not.toHaveBeenCalled()
      expect(db.rows).toEqual(before)
      expect(offerCookie(res)).toBeUndefined()
    })

    it('삭제는 됐는데 저장이 실패하면 고정 문구(afterDeleteFailed)와 restart이고 쿠키를 지운다', async () => {
      state.failOn = 'insert'
      const { request } = await makeRequest()

      const res = await POST(request)
      const body = await res.json()

      expect(res.status).toBe(500)
      expect(body).toEqual({ error: d.stravaConnection.replaceResult.afterDeleteFailed, next: 'restart' })
      expect(JSON.stringify(body)).not.toContain('duplicate key')
      expect(deleteAccountMock).toHaveBeenCalledTimes(1)
      expect(syncMock).not.toHaveBeenCalled()
      expectOfferCleared(res)
    })

    it('삭제 없이 저장만 하다 실패하면 retry이고 쿠키를 지우지 않는다(다시 누르면 된다)', async () => {
      db.rows = [connRow(SESSION_USER_ID, OTHER_ATHLETE)]
      state.failOn = 'insert'
      const { request } = await makeRequest()

      const res = await POST(request)

      expect(res.status).toBe(500)
      await expect(res.json()).resolves.toEqual({ error: d.stravaConnection.replaceResult.retry, next: 'retry' })
      expect(deleteAccountMock).not.toHaveBeenCalled()
      expect(offerCookie(res)).toBeUndefined()
    })

    it('이전 연결 정리가 실패하면 새 행을 되돌리고 삭제 뒤라면 afterDeleteFailed + restart다', async () => {
      state.failOn = 'delete_old'
      const { request } = await makeRequest()

      const res = await POST(request)

      expect(res.status).toBe(500)
      await expect(res.json()).resolves.toMatchObject({ error: d.stravaConnection.replaceResult.afterDeleteFailed, next: 'restart' })
      expect(state.order).toEqual([`delete:${OWNER_ID}`, 'save:insert', 'save:delete_old', 'save:rollback'])
      expect(db.rows.filter((r) => r.strava_athlete_id === ATHLETE)).toHaveLength(0)
    })

    it('삭제 뒤 저장 단계에서 예외가 나도 고정 문구와 restart다(예외 원문은 응답에 없다)', async () => {
      // 제안은 정상 키로 봉인한 뒤, 저장 단계의 암호화만 실패시킨다
      const { request } = await makeRequest()
      state.encryptFails = true

      const res = await POST(request)
      const body = await res.json()

      expect(res.status).toBe(500)
      expect(body).toEqual({ error: d.stravaConnection.replaceResult.afterDeleteFailed, next: 'restart' })
      expect(JSON.stringify(body)).not.toContain('암호화 실패')
      expectOfferCleared(res)
    })
  })

  describe('토큰과 쿠키 값을 싣지 않는다', () => {
    it('성공·거부·실패 어느 응답과 로그에도 토큰이나 쿠키 값이 없다', async () => {
      const scenarios: (() => Promise<{ res: Response; secret: string }>)[] = [
        async () => {
          const { request, sealed } = await makeRequest()
          return { res: await POST(request), secret: sealed as string }
        },
        async () => {
          db.rows = [connRow(OWNER_ID, ATHLETE)]
          state.owner = { id: OWNER_ID, email: 'a@example.com', is_admin: true }
          const { request, sealed } = await makeRequest()
          return { res: await POST(request), secret: sealed as string }
        },
        async () => {
          db.rows = [connRow(OWNER_ID, ATHLETE)]
          state.owner = { id: OWNER_ID, email: 'a@example.com', is_admin: false }
          state.failOn = 'insert'
          const { request, sealed } = await makeRequest()
          return { res: await POST(request), secret: sealed as string }
        },
      ]

      for (const run of scenarios) {
        const { res, secret } = await run()
        const haystack = JSON.stringify([
          await res.clone().text(),
          warnSpy.mock.calls,
          errorSpy.mock.calls,
          infoSpy.mock.calls,
        ])
        expect(haystack).not.toContain('ACCESS-SECRET-TOKEN')
        expect(haystack).not.toContain('REFRESH-SECRET-TOKEN')
        expect(haystack).not.toContain(secret)
      }
    })
  })
})
