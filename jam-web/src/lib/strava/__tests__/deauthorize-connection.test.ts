/**
 * deauthorizeStoredConnection — Strava 쪽 앱 승인 해제 공용 함수 (티켓 20261021_1249 3회)
 * 프로필의 «동기화 끊기»와 계정 삭제가 같이 쓴다. Strava·암호화는 가짜다 — 실제 호출이 없다.
 *
 * 고정하는 것: 유효한 토큰이면 그대로 해제 · 만료 직전이면 갱신한 새 토큰으로 해제 · 해제나 갱신이 실패해도 던지지 않고 false ·
 * 로그에 토큰이 들어가지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/deauthorize-connection.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiMock = vi.hoisted(() => ({
  deauthorizeStrava: vi.fn<(token: string) => Promise<void>>(),
  refreshStravaToken: vi.fn(),
}))

vi.mock('@/lib/utils', () => ({
  decrypt: async (v: string) => v.replace(/^enc:/, ''),
}))
vi.mock('@/lib/strava/api', () => apiMock)

import { deauthorizeStoredConnection } from '../deauthorize-connection'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const FUTURE = '2099-01-01T00:00:00.000Z'
const PAST = '2020-01-01T00:00:00.000Z'

const tokens = (expiresAt: string) => ({
  access_token: 'enc:ACCESS-SECRET',
  refresh_token: 'enc:REFRESH-SECRET',
  token_expires_at: expiresAt,
})

describe('deauthorizeStoredConnection', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    apiMock.deauthorizeStrava.mockReset().mockResolvedValue(undefined)
    apiMock.refreshStravaToken.mockReset()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('유효한 토큰이면 갱신 없이 복호화한 토큰으로 해제하고 true를 돌려준다', async () => {
    expect(await deauthorizeStoredConnection(tokens(FUTURE), { userId: USER_ID })).toBe(true)

    expect(apiMock.deauthorizeStrava).toHaveBeenCalledWith('ACCESS-SECRET')
    expect(apiMock.refreshStravaToken).not.toHaveBeenCalled()
  })

  it('만료 직전이면 갱신한 새 토큰으로 해제한다', async () => {
    apiMock.refreshStravaToken.mockResolvedValue({ access_token: 'NEW-ACCESS', refresh_token: 'NEW-REFRESH', expires_at: 1 })

    expect(await deauthorizeStoredConnection(tokens(PAST), { userId: USER_ID })).toBe(true)

    expect(apiMock.refreshStravaToken).toHaveBeenCalledWith('REFRESH-SECRET')
    expect(apiMock.deauthorizeStrava).toHaveBeenCalledWith('NEW-ACCESS')
  })

  it('해제가 실패하면 던지지 않고 false이며, 로그에는 상태만 남고 토큰은 없다', async () => {
    apiMock.deauthorizeStrava.mockRejectedValue(Object.assign(new Error('Strava 앱 해제 실패 401'), { status: 401 }))

    expect(await deauthorizeStoredConnection(tokens(FUTURE), { userId: USER_ID })).toBe(false)

    const logged = JSON.stringify(warnSpy.mock.calls)
    expect(logged).toContain('status: 401')
    expect(logged).toContain(USER_ID)
    expect(logged).not.toContain('ACCESS-SECRET')
    expect(logged).not.toContain('REFRESH-SECRET')
  })

  it('갱신이 실패하면 해제를 부르지 않고 false다', async () => {
    apiMock.refreshStravaToken.mockRejectedValue(Object.assign(new Error('Strava 토큰 갱신 실패 400'), { status: 400 }))

    expect(await deauthorizeStoredConnection(tokens(PAST), { userId: USER_ID })).toBe(false)

    expect(apiMock.deauthorizeStrava).not.toHaveBeenCalled()
  })

  it('상태 코드가 없는 오류(네트워크 등)도 던지지 않고 n/a로 남긴다', async () => {
    apiMock.deauthorizeStrava.mockRejectedValue(new Error('network down'))

    expect(await deauthorizeStoredConnection(tokens(FUTURE), { userId: USER_ID })).toBe(false)
    expect(JSON.stringify(warnSpy.mock.calls)).toContain('status: n/a')
  })
})
