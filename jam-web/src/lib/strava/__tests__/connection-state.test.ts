/**
 * strava/connection-state — 연결 상태 판정과 끊김 저장 (티켓 20261017_1422)
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/connection-state.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))

import {
  resolveStravaConnectionState,
  isStravaRevokedError,
  isStravaAuthFailureError,
  resolveStravaUiState,
  markStravaDisconnected,
  StravaDisconnectedError,
  STRAVA_DISCONNECT_CLEARED,
  type MarkDisconnectedOptions,
} from '../connection-state'
import { StravaApiError } from '../api'

describe('resolveStravaConnectionState', () => {
  it('행이 없으면 none이다', () => {
    expect(resolveStravaConnectionState(null)).toBe('none')
    expect(resolveStravaConnectionState(undefined)).toBe('none')
  })

  it('disconnected_at이 NULL이면 connected다', () => {
    expect(resolveStravaConnectionState({ disconnected_at: null })).toBe('connected')
  })

  it('옛 행처럼 칸 자체가 없어도 connected다 (기존 연결은 그대로)', () => {
    expect(resolveStravaConnectionState({})).toBe('connected')
  })

  it('disconnected_at이 있으면 disconnected다', () => {
    expect(resolveStravaConnectionState({ disconnected_at: '2026-10-17T00:00:00.000Z' })).toBe('disconnected')
  })
})

describe('isStravaRevokedError', () => {
  it('401 StravaApiError만 철회로 본다', () => {
    expect(isStravaRevokedError(new StravaApiError('x', 401))).toBe(true)
    expect(isStravaRevokedError(new StravaApiError('x', 500))).toBe(false)
    expect(isStravaRevokedError(new StravaApiError('x', 429))).toBe(false)
    expect(isStravaRevokedError(new Error('401'))).toBe(false)
    expect(isStravaRevokedError(null)).toBe(false)
    expect(isStravaRevokedError('401')).toBe(false)
  })
})

describe('StravaDisconnectedError', () => {
  it('사유와 원인을 들고 있다', () => {
    const cause = new Error('boom')
    const err = new StravaDisconnectedError('token_revoked', { cause })
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('StravaDisconnectedError')
    expect(err.reason).toBe('token_revoked')
    expect(err.cause).toBe(cause)
  })
})

describe('STRAVA_DISCONNECT_CLEARED', () => {
  it('끊김 칸 둘만 비우고 first_sync_pending은 건드리지 않는다', () => {
    expect(STRAVA_DISCONNECT_CLEARED).toEqual({ disconnected_at: null, disconnect_reason: null })
  })
})

describe('markStravaDisconnected', () => {
  let updateMock: ReturnType<typeof vi.fn>
  let eqMock: ReturnType<typeof vi.fn>
  let fromMock: ReturnType<typeof vi.fn>
  // 주입 클라이언트는 이 파일에서 최소 모양만 흉내 낸다
  let client: NonNullable<MarkDisconnectedOptions['supabase']>

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    eqMock = vi.fn(async () => ({ error: null }))
    updateMock = vi.fn(() => ({ eq: eqMock }))
    fromMock = vi.fn(() => ({ update: updateMock }))
    client = { from: fromMock } as unknown as typeof client
  })

  it('이 유저의 연결 행에 끊김 시각과 사유를 저장하고 true를 돌려준다', async () => {
    const ok = await markStravaDisconnected('u1', 'token_refresh_failed', { supabase: client })

    expect(ok).toBe(true)
    expect(fromMock).toHaveBeenCalledWith('strava_connections')
    expect(eqMock).toHaveBeenCalledWith('user_id', 'u1')
    const payload = updateMock.mock.calls[0][0] as Record<string, unknown>
    expect(payload).toMatchObject({ disconnect_reason: 'token_refresh_failed' })
    expect(typeof payload.disconnected_at).toBe('string')
    expect(payload).not.toHaveProperty('access_token')
    expect(payload).not.toHaveProperty('refresh_token')
  })

  it('clearTokens면 토큰 칸을 빈 값으로 지운다', async () => {
    await markStravaDisconnected('u1', 'user_disconnected', { supabase: client, clearTokens: true })

    expect(updateMock.mock.calls[0][0]).toMatchObject({
      disconnect_reason: 'user_disconnected',
      access_token: '',
      refresh_token: '',
    })
  })

  it('저장이 실패하면 던지지 않고 false를 돌려준다', async () => {
    eqMock.mockResolvedValue({ error: { message: 'db down' } })

    await expect(markStravaDisconnected('u1', 'token_revoked', { supabase: client })).resolves.toBe(false)
  })
})

describe('resolveStravaUiState — 화면이 쓰는 네 갈래', () => {
  const AT = '2026-10-17T00:00:00.000Z'

  it('행이 없으면 none, 연결 중이면 connected다', () => {
    expect(resolveStravaUiState(null)).toBe('none')
    expect(resolveStravaUiState({ disconnected_at: null, disconnect_reason: null })).toBe('connected')
  })

  it('토큰 갱신 실패·Strava 철회로 끊기면 disconnected_error다', () => {
    expect(resolveStravaUiState({ disconnected_at: AT, disconnect_reason: 'token_refresh_failed' })).toBe(
      'disconnected_error'
    )
    expect(resolveStravaUiState({ disconnected_at: AT, disconnect_reason: 'token_revoked' })).toBe(
      'disconnected_error'
    )
  })

  it('유저가 직접 끊었으면 disconnected_user다', () => {
    expect(resolveStravaUiState({ disconnected_at: AT, disconnect_reason: 'user_disconnected' })).toBe(
      'disconnected_user'
    )
  })

  it('사유가 비어 있는 끊김은 유저가 끊은 것으로 단정하지 않고 오류로 본다', () => {
    expect(resolveStravaUiState({ disconnected_at: AT, disconnect_reason: null })).toBe('disconnected_error')
  })
})

describe('isStravaAuthFailureError — 일시 실패는 끊김이 아니다 (서버 보정 a)', () => {
  it('400·401·403 StravaApiError만 인증 오류다', () => {
    for (const status of [400, 401, 403]) {
      expect(isStravaAuthFailureError(new StravaApiError('x', status))).toBe(true)
    }
  })

  it('5xx·429·네트워크 오류·시간 초과·일반 오류는 아니다', () => {
    for (const status of [429, 500, 502, 503, 504]) {
      expect(isStravaAuthFailureError(new StravaApiError('x', status))).toBe(false)
    }
    expect(isStravaAuthFailureError(new TypeError('fetch failed'))).toBe(false)
    expect(isStravaAuthFailureError(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))).toBe(false)
    expect(isStravaAuthFailureError(null)).toBe(false)
    expect(isStravaAuthFailureError('401')).toBe(false)
  })
})
