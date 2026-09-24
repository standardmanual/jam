/**
 * POST /api/admin/users/bulk — 미리보기·확인 문구·자동 제외 분기 (티켓 20260924_0951)
 * DB 접근(대상 조회·영향 집계·초기화·삭제·지급)은 모듈 단위로 가짜로 바꿔, 라우트가
 * "미리보기는 아무것도 바꾸지 않는다 / 확인 문구가 없으면 409 / 어드민·본인은 실행에서 빠진다"를
 * 지키는지만 본다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/users/bulk/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const ADMIN_ID = '00000000-0000-4000-8000-0000000000aa'
const USER_A = '00000000-0000-4000-8000-000000000001'
const USER_B = '00000000-0000-4000-8000-000000000002'
const OTHER_ADMIN = '00000000-0000-4000-8000-0000000000bb'

const mocks = vi.hoisted(() => ({
  fetchUserTargets: vi.fn(),
  computeUserBulkImpact: vi.fn(),
  resetUserData: vi.fn(),
  hardDeleteUser: vi.fn(),
  executeAdminGrant: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  getAdminUser: async () => ({ id: ADMIN_ID, email: 'me@jam.app' }),
}))
vi.mock('@/lib/admin/user-bulk-impact', () => ({
  fetchUserTargets: mocks.fetchUserTargets,
  computeUserBulkImpact: mocks.computeUserBulkImpact,
}))
vi.mock('@/lib/admin/user-actions', () => ({
  resetUserData: mocks.resetUserData,
  hardDeleteUser: mocks.hardDeleteUser,
}))
vi.mock('@/lib/points/admin-grant', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/points/admin-grant')>()),
  executeAdminGrant: mocks.executeAdminGrant,
}))

const { POST } = await import('../route')

function post(body: unknown): NextRequest {
  return new NextRequest('https://j-a-m.app/api/admin/users/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.fetchUserTargets.mockReset().mockResolvedValue([
    { id: USER_A, email: 'a@x.com', is_admin: false },
    { id: USER_B, email: 'b@x.com', is_admin: false },
    { id: OTHER_ADMIN, email: 'boss@x.com', is_admin: true },
    { id: ADMIN_ID, email: 'me@jam.app', is_admin: true },
  ])
  mocks.computeUserBulkImpact.mockReset().mockResolvedValue({ targetCount: 2, excludedAdminCount: 1, excludedSelfCount: 1 })
  mocks.resetUserData.mockReset().mockResolvedValue({ ok: true, deletedActivityBadges: 1, deletedInventoryItems: 1 })
  mocks.hardDeleteUser.mockReset().mockResolvedValue({ ok: true, deletedEmail: 'x', deletedActivityBadges: 0, deletedInventoryItems: 0 })
  mocks.executeAdminGrant.mockReset().mockResolvedValue({ transaction: { id: 'tx' }, balance: 10 })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const ALL_IDS = [USER_A, USER_B, OTHER_ADMIN, ADMIN_ID]

describe('미리보기(dry_run)', () => {
  it('영향 수치와 확인 문구를 돌려주고 아무것도 바꾸지 않는다', async () => {
    const res = await POST(post({ ids: ALL_IDS, action: 'delete', dry_run: true }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.dryRun).toBe(true)
    expect(data.requiredPhrase).toBe('삭제 2')
    expect(data.impact).toEqual({ targetCount: 2, excludedAdminCount: 1, excludedSelfCount: 1 })
    expect(data.processed).toEqual([USER_A, USER_B])
    expect(data.skipped).toEqual(
      expect.arrayContaining([
        { id: OTHER_ADMIN, reason: '어드민 계정' },
        { id: ADMIN_ID, reason: '본인 계정' },
      ])
    )
    expect(mocks.hardDeleteUser).not.toHaveBeenCalled()
    expect(mocks.resetUserData).not.toHaveBeenCalled()
    expect(mocks.executeAdminGrant).not.toHaveBeenCalled()
  })

  it('포인트 회수의 확인 문구는 "회수 N"이고, 고액이어도 미리보기는 막히지 않는다', async () => {
    const res = await POST(
      post({
        ids: [USER_A],
        action: 'grant_points',
        dry_run: true,
        payload: { amount: -5000, reasonLabel: 'abuse_reclaim' },
      })
    )
    expect(res.status).toBe(200)
    expect((await res.json()).requiredPhrase).toBe('회수 1')
    expect(mocks.executeAdminGrant).not.toHaveBeenCalled()
  })
})

describe('실행', () => {
  it('확인 문구 없이 실행하면 409와 필요한 문구를 돌려주고 아무것도 바꾸지 않는다', async () => {
    const res = await POST(post({ ids: ALL_IDS, action: 'reset' }))
    expect(res.status).toBe(409)
    expect((await res.json()).requiredPhrase).toBe('초기화 2')
    expect(mocks.resetUserData).not.toHaveBeenCalled()
  })

  it('틀린 확인 문구도 409다', async () => {
    const res = await POST(post({ ids: ALL_IDS, action: 'reset', confirm_phrase: '초기화 4' }))
    expect(res.status).toBe(409)
    expect(mocks.resetUserData).not.toHaveBeenCalled()
  })

  it('확인 문구가 맞으면 어드민·본인을 뺀 유저에게만 실행하고 유저별 결과를 돌려준다', async () => {
    mocks.hardDeleteUser.mockImplementation(async (_client: unknown, id: string) =>
      id === USER_B ? { ok: false, status: 500, error: '삭제 실패' } : { ok: true, deletedEmail: 'a', deletedActivityBadges: 0, deletedInventoryItems: 0 }
    )
    const res = await POST(post({ ids: ALL_IDS, action: 'delete', confirm_phrase: '삭제 2' }))
    expect(res.status).toBe(200)
    const data = await res.json()

    const deletedIds = mocks.hardDeleteUser.mock.calls.map((c) => c[1]).sort()
    expect(deletedIds).toEqual([USER_A, USER_B].sort())
    expect(data.results).toEqual(
      expect.arrayContaining([
        { id: USER_A, ok: true },
        { id: USER_B, ok: false, error: '삭제 실패' },
      ])
    )
    expect(data.processed).toEqual([USER_A])
    expect(data.skipped).toEqual(
      expect.arrayContaining([
        { id: USER_B, reason: '삭제 실패' },
        { id: OTHER_ADMIN, reason: '어드민 계정' },
        { id: ADMIN_ID, reason: '본인 계정' },
      ])
    )
  })

  it('포인트 지급은 검증을 통과한 금액으로 유저마다 실행한다', async () => {
    const res = await POST(
      post({
        ids: [USER_A, USER_B],
        action: 'grant_points',
        confirm_phrase: '지급 2',
        payload: { amount: 300, reasonLabel: 'cs_compensation' },
      })
    )
    expect(res.status).toBe(200)
    expect(mocks.executeAdminGrant).toHaveBeenCalledTimes(2)
    expect(mocks.executeAdminGrant).toHaveBeenCalledWith(USER_A, { amount: 300, reasonLabel: 'cs_compensation', note: null })
  })

  it('1,000P 이상 지급은 실행 요청에 confirmed가 없으면 422다', async () => {
    const res = await POST(
      post({
        ids: [USER_A],
        action: 'grant_points',
        confirm_phrase: '지급 1',
        payload: { amount: 1000, reasonLabel: 'cs_compensation' },
      })
    )
    expect(res.status).toBe(422)
    expect(mocks.executeAdminGrant).not.toHaveBeenCalled()
  })

  it('지급 입력이 잘못되면 400이고 대상 조회도 하지 않는다', async () => {
    const res = await POST(
      post({ ids: [USER_A], action: 'grant_points', dry_run: true, payload: { amount: 0, reasonLabel: 'cs_compensation' } })
    )
    expect(res.status).toBe(400)
    expect(mocks.fetchUserTargets).not.toHaveBeenCalled()
  })
})

describe('요청 형식', () => {
  it('초기화·삭제는 한 번에 50명까지만 받는다', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    const res = await POST(post({ ids, action: 'delete', dry_run: true }))
    expect(res.status).toBe(400)
  })

  it('지원하지 않는 동작은 400이다', async () => {
    const res = await POST(post({ ids: [USER_A], action: 'ban' }))
    expect(res.status).toBe(400)
  })
})
