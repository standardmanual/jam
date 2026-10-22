/**
 * POST /api/strava/disconnect — 연결 끊기 테스트 (티켓 20261017_1422, 운영 로직 3.2절)
 *
 * 검증 대상:
 *  - 비로그인은 401이고 아무것도 호출하지 않는다 / 연결이 없으면 404이고 쓰기가 없다
 *  - Strava 앱 해제를 부르고, 저장된 토큰을 지우며 user_disconnected로 끊김을 저장한다
 *  - 이미 끊긴 연결에 다시 부르면 앱 해제·갱신을 부르지 않고 200이며 끊김 시각·사유를 덮어쓰지 않는다(멱등)
 *  - 앱 해제가 실패해도(이미 무효한 토큰) 끊김 저장은 진행한다
 *  - 만료 직전 토큰은 갱신한 뒤 해제한다 (갱신이 실패해도 끊김 저장은 진행한다)
 *  - strava_connections 한 행의 끊김 칸·토큰만 바꾸고 다른 테이블(활동 기록·배지·잼·포인트)은 건드리지 않는다
 *  - 끊김 저장이 실패하면 500이다
 *  - 로그에 토큰이 들어가지 않는다
 *  - 동의 철회 (티켓 20261021_1249 4회): 끊김이 저장된 뒤에 좌표 파기(`scrub_user_location`)를 부른다 · 실패하면 한 번 더 부르고 두 번 모두 실패하거나
 *    던져도 200이다(서버 로그에만 남고 응답에는 오류 원문이 없다) · 끊김 저장이 실패했거나 연결이 없거나 이미 끊긴 연결이면 부르지 않는다
 *
 * 실제 Strava·공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/strava/disconnect/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { d } from '@/lib/i18n'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const FUTURE = '2099-01-01T00:00:00.000Z'
const PAST = '2020-01-01T00:00:00.000Z'

const state = vi.hoisted(() => ({
  authenticated: true,
  connection: null as null | Record<string, unknown>,
  lookupError: null as null | { message: string },
  updateError: null as null | { message: string },
  touchedTables: [] as string[],
  updates: [] as { payload: Record<string, unknown>; eqs: Record<string, unknown> }[],
  /** 좌표 파기 RPC 호출 기록과, 호출 순서대로 돌려줄 결과('ok' · 'error' · 'throw'). 비면 'ok' */
  rpcCalls: [] as { fn: string; args: unknown; afterUpdates: number }[],
  rpcOutcomes: [] as ('ok' | 'error' | 'throw')[],
}))
const deauthorizeMock = vi.hoisted(() => vi.fn<(token: string) => Promise<void>>())
const refreshMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        state.authenticated
          ? { data: { user: { id: USER_ID } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
  }),
  createServiceClient: () => ({
    rpc: async (fn: string, args: unknown) => {
      state.rpcCalls.push({ fn, args, afterUpdates: state.updates.length })
      const outcome = state.rpcOutcomes.shift() ?? 'ok'
      if (outcome === 'throw') throw new Error('rpc 네트워크 오류 relation "users" 접근 거부')
      if (outcome === 'error') return { data: null, error: { message: 'permission denied for function scrub_user_location' } }
      return { data: { user_location_cleared: 1, activities_cleared: 3 }, error: null }
    },
    from: (table: string) => {
      state.touchedTables.push(table)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: state.connection, error: state.lookupError }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          const entry = { payload, eqs: {} as Record<string, unknown> }
          state.updates.push(entry)
          return {
            eq: async (col: string, val: unknown) => {
              entry.eqs[col] = val
              return { error: state.updateError }
            },
          }
        },
      }
    },
  }),
}))
vi.mock('@/lib/utils', () => ({
  decrypt: async (v: string) => v.replace(/^enc:/, ''),
}))
vi.mock('@/lib/strava/api', () => ({
  deauthorizeStrava: (token: string) => deauthorizeMock(token),
  refreshStravaToken: (token: string) => refreshMock(token),
}))

import { POST } from '../route'

describe('POST /api/strava/disconnect', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    state.authenticated = true
    state.connection = {
      access_token: 'enc:ACCESS-SECRET',
      refresh_token: 'enc:REFRESH-SECRET',
      token_expires_at: FUTURE,
    }
    state.lookupError = null
    state.updateError = null
    state.touchedTables = []
    state.updates = []
    state.rpcCalls = []
    state.rpcOutcomes = []
    deauthorizeMock.mockReset().mockResolvedValue(undefined)
    refreshMock.mockReset()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('비로그인이면 401이고 아무것도 호출하지 않는다', async () => {
    state.authenticated = false

    const res = await POST()

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: d.common.authRequired })
    expect(state.touchedTables).toHaveLength(0)
    expect(deauthorizeMock).not.toHaveBeenCalled()
  })

  it('연결이 없으면 404이고 앱 해제도 쓰기도 하지 않는다', async () => {
    state.connection = null

    const res = await POST()

    expect(res.status).toBe(404)
    expect(deauthorizeMock).not.toHaveBeenCalled()
    expect(state.updates).toHaveLength(0)
  })

  it('앱 해제를 부르고 토큰을 지우며 user_disconnected로 끊김을 저장한다', async () => {
    const res = await POST()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ connectionState: 'disconnected', deauthorized: true })
    expect(deauthorizeMock).toHaveBeenCalledWith('ACCESS-SECRET')
    expect(refreshMock).not.toHaveBeenCalled()
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].eqs).toEqual({ user_id: USER_ID })
    expect(state.updates[0].payload).toMatchObject({
      disconnect_reason: 'user_disconnected',
      access_token: '',
      refresh_token: '',
    })
    expect(typeof state.updates[0].payload.disconnected_at).toBe('string')
  })

  it('이미 끊긴 연결이면 앱 해제를 부르지 않고 200으로 돌려주며 끊김 칸을 덮어쓰지 않는다', async () => {
    state.connection = {
      access_token: '',
      refresh_token: '',
      token_expires_at: PAST,
      disconnected_at: '2026-10-10T00:00:00.000Z',
    }

    const res = await POST()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ connectionState: 'disconnected', deauthorized: false })
    expect(deauthorizeMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
    expect(state.updates).toHaveLength(0)
  })

  it('앱 해제가 실패해도 끊김 저장은 진행한다', async () => {
    deauthorizeMock.mockRejectedValue(Object.assign(new Error('Strava 앱 해제 실패 401'), { status: 401 }))

    const res = await POST()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ connectionState: 'disconnected', deauthorized: false })
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].payload).toMatchObject({ disconnect_reason: 'user_disconnected', access_token: '' })
  })

  it('만료 직전 토큰은 갱신한 뒤 새 토큰으로 해제한다', async () => {
    state.connection = { ...state.connection, token_expires_at: PAST }
    refreshMock.mockResolvedValue({ access_token: 'NEW-ACCESS', refresh_token: 'NEW-REFRESH', expires_at: 1 })

    await POST()

    expect(refreshMock).toHaveBeenCalledWith('REFRESH-SECRET')
    expect(deauthorizeMock).toHaveBeenCalledWith('NEW-ACCESS')
  })

  it('갱신이 실패해도 끊김 저장은 진행한다', async () => {
    state.connection = { ...state.connection, token_expires_at: PAST }
    refreshMock.mockRejectedValue(Object.assign(new Error('Strava 토큰 갱신 실패 400'), { status: 400 }))

    const res = await POST()

    expect(res.status).toBe(200)
    expect(deauthorizeMock).not.toHaveBeenCalled()
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].payload).toMatchObject({ disconnect_reason: 'user_disconnected' })
  })

  it('이 라우트가 직접 읽고 쓰는 테이블은 strava_connections뿐이다(기록·배지·잼·포인트는 건드리지 않는다)', async () => {
    await POST()

    expect(new Set(state.touchedTables)).toEqual(new Set(['strava_connections']))
    expect(Object.keys(state.updates[0].payload).sort()).toEqual(
      ['access_token', 'disconnect_reason', 'disconnected_at', 'refresh_token'].sort()
    )
  })

  it('끊김 저장이 실패하면 500이다', async () => {
    state.updateError = { message: 'db down' }

    const res = await POST()

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: d.auth.errorGeneric })
  })

  it('연결 조회가 실패하면 500이고 앱 해제·쓰기를 하지 않는다', async () => {
    state.connection = null
    state.lookupError = { message: 'db down' }

    const res = await POST()

    expect(res.status).toBe(500)
    expect(deauthorizeMock).not.toHaveBeenCalled()
    expect(state.updates).toHaveLength(0)
  })

  it('로그에 토큰이 들어가지 않는다', async () => {
    deauthorizeMock.mockRejectedValue(Object.assign(new Error('Strava 앱 해제 실패 401'), { status: 401 }))

    await POST()

    const logged = JSON.stringify([...warnSpy.mock.calls, ...errorSpy.mock.calls])
    expect(logged).not.toContain('ACCESS-SECRET')
    expect(logged).not.toContain('REFRESH-SECRET')
  })

  describe('동의 철회: 좌표 파기 (티켓 20261021_1249 4회)', () => {
    const SCRUB = 'scrub_user_location'

    // 바깥 beforeEach가 spyOn만 다시 걸어 호출 기록이 쌓인다 — 이 구역은 로그 횟수를 세므로 비운다
    beforeEach(() => {
      errorSpy.mockClear()
    })

    it('끊김을 저장한 뒤에 로그인한 유저의 좌표 파기를 한 번 부르고 응답 모양은 그대로다', async () => {
      const res = await POST()

      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toEqual({ connectionState: 'disconnected', deauthorized: true })
      expect(state.rpcCalls).toEqual([{ fn: SCRUB, args: { p_user_id: USER_ID }, afterUpdates: 1 }])
    })

    it('첫 호출이 실패하면 한 번 더 부르고, 두 번째가 성공하면 오류를 한 번만 남긴다', async () => {
      state.rpcOutcomes = ['error', 'ok']

      const res = await POST()

      expect(res.status).toBe(200)
      expect(state.rpcCalls).toHaveLength(2)
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('두 번 모두 실패해도 끊기는 성공이고, 더 부르지 않으며, 오류는 서버 로그에만 남는다', async () => {
      state.rpcOutcomes = ['error', 'error', 'error']

      const res = await POST()
      const text = JSON.stringify(await res.json())

      expect(res.status).toBe(200)
      expect(text).toContain('disconnected')
      expect(text).not.toContain('permission denied')
      expect(state.rpcCalls).toHaveLength(2)
      expect(state.updates).toHaveLength(1)
      const logged = errorSpy.mock.calls.map((c: unknown[]) => String(c[0]) + ' ' + String(c[1])).join('\n')
      expect(logged).toContain('좌표 파기 실패 (1/2)')
      expect(logged).toContain('좌표 파기 실패 (2/2)')
    })

    it('RPC가 던져도 한 번 재시도하고 끊기는 성공이다 — 예외 원문은 응답에 없다', async () => {
      state.rpcOutcomes = ['throw', 'throw']

      const res = await POST()
      const text = JSON.stringify(await res.json())

      expect(res.status).toBe(200)
      expect(state.rpcCalls).toHaveLength(2)
      expect(text).not.toContain('relation')
    })

    it('끊김 저장이 실패하면 좌표를 지우지 않는다 — 철회가 저장되지 않았다', async () => {
      state.updateError = { message: 'db down' }

      const res = await POST()

      expect(res.status).toBe(500)
      expect(state.rpcCalls).toHaveLength(0)
    })

    it('연결이 없거나 이미 끊긴 연결이면 좌표 파기를 부르지 않는다', async () => {
      state.connection = null
      expect((await POST()).status).toBe(404)

      state.connection = { access_token: '', refresh_token: '', token_expires_at: PAST, disconnected_at: '2026-10-10T00:00:00.000Z' }
      expect((await POST()).status).toBe(200)

      expect(state.rpcCalls).toHaveLength(0)
    })

    it('비로그인이면 부르지 않는다', async () => {
      state.authenticated = false
      await POST()
      expect(state.rpcCalls).toHaveLength(0)
    })
  })
})
