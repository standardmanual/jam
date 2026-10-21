/**
 * GET /api/account/delete-summary — 탈퇴 화면의 본인 데이터 요약 라우트 (티켓 20261021_1249 3회)
 * 요약을 모으는 함수(`getAccountSummary`)는 가짜다 — 공용 DB를 부르지 않는다. 수치를 세는 규칙은 `summary.test.ts`가 고정한다.
 *
 * 고정하는 것: 비로그인은 401이고 조회하지 않는다 · 성공은 200 { summary } · 대상은 세션의 유저 id · 조회가 실패하면 500과 고정 문장이고 원문이 새지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/account/delete-summary/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { d } from '@/lib/i18n'

const USER_ID = '11111111-1111-4111-8111-111111111111'

const state = vi.hoisted(() => ({ authenticated: true }))
const summaryMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        state.authenticated
          ? { data: { user: { id: USER_ID } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
  }),
  createServiceClient: () => ({ service: true }),
}))
vi.mock('@/lib/account/summary', () => ({
  getAccountSummary: (...args: unknown[]) => summaryMock(...args),
}))

import { GET } from '../route'

const SUMMARY = {
  activityBadgeCount: 12,
  checkinBadgeCount: 7,
  itemCount: 20,
  jamBalance: 340,
  pointBalance: 1200,
  stravaConnected: true,
}

describe('GET /api/account/delete-summary', () => {
  beforeEach(() => {
    state.authenticated = true
    summaryMock.mockReset().mockResolvedValue(SUMMARY)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('비로그인이면 401이고 조회하지 않는다', async () => {
    state.authenticated = false

    const res = await GET()

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: d.common.authRequired })
    expect(summaryMock).not.toHaveBeenCalled()
  })

  it('세션 유저의 요약을 200 { summary }로 돌려준다', async () => {
    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ summary: SUMMARY })
    expect(summaryMock).toHaveBeenCalledWith({ service: true }, USER_ID)
  })

  it('조회가 실패하면 500과 고정 문장이고 원문이 새지 않는다', async () => {
    summaryMock.mockRejectedValue(new Error('[account/summary] 잼 조회 실패: permission denied for table jam_wallets'))

    const res = await GET()
    const text = JSON.stringify(await res.json())

    expect(res.status).toBe(500)
    expect(text).toContain(d.auth.errorGeneric)
    expect(text).not.toContain('jam_wallets')
  })
})
