/**
 * POST /api/strava/sync — 끊김 응답 테스트 (티켓 20261017_1422)
 *
 * 검증 대상:
 *  - 비로그인은 401
 *  - 정상 동기화는 결과를 그대로 200으로 돌려준다
 *  - 연결이 끊긴 상태(StravaDisconnectedError)는 500이 아니라 409와 구분 값(`code`, `connectionState`)이다
 *  - 고르지 않은 보류가 남아 있으면(SyncPendingItemsError) 409와 구분 값(`code: 'sync_pending_items'`, `pendingCount`)이다 (티켓 20261017_1425)
 *  - 이용 정지 중이면(UserSuspendedError) 403과 구분 값(`code: 'user_suspended'`)이다 (티켓 20261017_1426)
 *  - 그 밖의 오류는 지금처럼 500이다
 *
 * 실행: cd jam-web && npx vitest run src/app/api/strava/sync/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { d } from '@/lib/i18n'
import { StravaDisconnectedError } from '@/lib/strava/connection-state'
import { SyncPendingItemsError } from '@/lib/strava/pending-items'
import { UserSuspendedError } from '@/lib/suspension/suspension'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const state = vi.hoisted(() => ({ authenticated: true }))
const syncMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        state.authenticated
          ? { data: { user: { id: USER_ID } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
  }),
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨')
  },
}))
vi.mock('@/lib/strava/sync', () => ({
  syncStravaActivities: (userId: string) => syncMock(userId),
}))

import { POST } from '../route'

describe('POST /api/strava/sync', () => {
  beforeEach(() => {
    state.authenticated = true
    syncMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('비로그인이면 401이고 동기화하지 않는다', async () => {
    state.authenticated = false

    const res = await POST()

    expect(res.status).toBe(401)
    expect(syncMock).not.toHaveBeenCalled()
  })

  it('정상 동기화는 결과를 200으로 돌려준다', async () => {
    syncMock.mockResolvedValue({ synced: 2, badges: 1 })

    const res = await POST()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ synced: 2, badges: 1 })
    expect(syncMock).toHaveBeenCalledWith(USER_ID)
  })

  it('연결이 끊긴 상태는 409와 구분 값으로 알린다', async () => {
    syncMock.mockRejectedValue(new StravaDisconnectedError('token_refresh_failed'))

    const res = await POST()

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      error: d.auth.stravaSyncError,
      code: 'strava_disconnected',
      connectionState: 'disconnected',
    })
  })

  it('고르지 않은 보류가 남아 있으면 409와 구분 값, 보류 개수로 알린다', async () => {
    syncMock.mockRejectedValue(new SyncPendingItemsError(3))

    const res = await POST()

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      error: d.syncPending.syncBlocked,
      code: 'sync_pending_items',
      pendingCount: 3,
    })
  })

  it('이용 정지 중이면 403과 구분 값, 안내 문구로 알리고 정지 까닭은 응답에 싣지 않는다', async () => {
    syncMock.mockRejectedValue(new UserSuspendedError({ reason: '운영자만 보는 메모', suspendedAt: '2026-10-10T00:00:00.000Z' }))

    const res = await POST()

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body).toEqual({ error: d.suspension.syncBlocked, code: 'user_suspended' })
    expect(JSON.stringify(body)).not.toContain('운영자만 보는 메모')
  })

  it('정상 동기화 결과의 기존 필드와 pendingItems를 그대로 돌려준다', async () => {
    const result = { synced: 1, badges: 0, earnedBadges: [], earnedBadgesMore: 0, jamEarned: 90, pendingItems: 2 }
    syncMock.mockResolvedValue(result)

    const res = await POST()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(result)
  })

  it('그 밖의 오류는 500이다', async () => {
    syncMock.mockRejectedValue(new Error('boom'))

    const res = await POST()

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: d.auth.stravaSyncError })
  })
})
