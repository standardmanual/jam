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
vi.mock('@/lib/admin/user-actions', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/user-actions')>()),
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

// 삭제 실패 때 응답에 나가는 고정 문구(티켓 20261021_1249) — DB·Auth 오류 원문은 싣지 않는다
const DELETE_FAILED_MESSAGE = '계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.'

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
        { id: OTHER_ADMIN, reason: '어드민 계정', label: 'boss@x.com' },
        { id: ADMIN_ID, reason: '본인 계정', label: 'me@jam.app' },
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
      id === USER_B ? { ok: false, status: 500, error: 'duplicate key value violates unique constraint' } : { ok: true, deletedEmail: 'a', deletedActivityBadges: 0, deletedInventoryItems: 0 }
    )
    const res = await POST(post({ ids: ALL_IDS, action: 'delete', confirm_phrase: '삭제 2' }))
    expect(res.status).toBe(200)
    const data = await res.json()

    const deletedIds = mocks.hardDeleteUser.mock.calls.map((c) => c[1]).sort()
    expect(deletedIds).toEqual([USER_A, USER_B].sort())
    expect(data.results).toEqual(
      expect.arrayContaining([
        { id: USER_A, ok: true },
        { id: USER_B, ok: false, error: DELETE_FAILED_MESSAGE },
      ])
    )
    expect(data.processed).toEqual([USER_A])
    expect(data.skipped).toEqual(
      expect.arrayContaining([
        { id: USER_B, reason: DELETE_FAILED_MESSAGE, label: 'b@x.com' },
        { id: OTHER_ADMIN, reason: '어드민 계정', label: 'boss@x.com' },
        { id: ADMIN_ID, reason: '본인 계정', label: 'me@jam.app' },
      ])
    )
  })

  it('삭제 함수가 던지면 오류 원문이 아니라 고정 문구를 싣고 원문은 console.error로만 남긴다', async () => {
    mocks.hardDeleteUser.mockImplementation(async (_client: unknown, id: string) => {
      if (id === USER_B) throw new Error('connection refused to db-host')
      return { ok: true, deletedEmail: 'a', deletedActivityBadges: 0, deletedInventoryItems: 0 }
    })
    const res = await POST(post({ ids: ALL_IDS, action: 'delete', confirm_phrase: '삭제 2' }))
    const text = JSON.stringify(await res.clone().json())
    expect(res.status).toBe(200)
    expect(text).not.toContain('connection refused')
    expect((await res.json()).results).toEqual(expect.arrayContaining([{ id: USER_B, ok: false, error: DELETE_FAILED_MESSAGE }]))
    expect(console.error).toHaveBeenCalled()
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

  it('회수에서 잔액이 모자란 유저는 건너뛴 목록의 사유(현재 잔액·요청 금액)로 알리고, 나머지 유저는 계속 처리하며 응답은 200이다', async () => {
    mocks.executeAdminGrant.mockImplementation(async (id: string) =>
      id === USER_A
        ? { rejected: true, code: 'insufficient_balance', balance: 40, requested: 300 }
        : { transaction: { id: 'tx' }, balance: 700 }
    )
    const res = await POST(
      post({
        ids: [USER_A, USER_B],
        action: 'grant_points',
        confirm_phrase: '회수 2',
        payload: { amount: -300, reasonLabel: 'error_correction' },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    // 거절된 유저가 있어도 두 유저 모두 실행을 시도한다
    expect(mocks.executeAdminGrant).toHaveBeenCalledTimes(2)
    expect(mocks.executeAdminGrant).toHaveBeenCalledWith(USER_A, { amount: -300, reasonLabel: 'error_correction', note: null })
    expect(data.processed).toEqual([USER_B])
    const rejectedReason =
      '회수하지 못했어요. 이 유저의 잔액이 40 포인트라 300 포인트는 회수할 수 없어요. 40 포인트 이하로 줄여서 다시 회수해 주세요.'
    expect(data.skipped).toEqual(
      expect.arrayContaining([{ id: USER_A, reason: rejectedReason, label: 'a@x.com' }])
    )
    expect(data.results).toEqual(
      expect.arrayContaining([
        { id: USER_A, ok: false, error: rejectedReason },
        { id: USER_B, ok: true },
      ])
    )
  })

  it('회수가 모두 거절돼도 응답은 200이고 처리된 유저만 비어 있다', async () => {
    mocks.executeAdminGrant.mockResolvedValue({
      rejected: true,
      code: 'insufficient_balance',
      balance: 0,
      requested: 50,
    })
    const res = await POST(
      post({
        ids: [USER_A, USER_B],
        action: 'grant_points',
        confirm_phrase: '회수 2',
        payload: { amount: -50, reasonLabel: 'error_correction' },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.processed).toEqual([])
    expect(data.skipped).toHaveLength(2)
    expect(data.skipped.every((s: { reason: string }) => s.reason.includes('회수하지 못했어요.'))).toBe(true)
  })

  it('회수 처리 자체가 실패(null)하면 지금처럼 일반 실패 사유로 건너뛴다', async () => {
    mocks.executeAdminGrant.mockImplementation(async (id: string) =>
      id === USER_A ? null : { transaction: { id: 'tx' }, balance: 700 }
    )
    const res = await POST(
      post({
        ids: [USER_A, USER_B],
        action: 'grant_points',
        confirm_phrase: '회수 2',
        payload: { amount: -300, reasonLabel: 'error_correction' },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.processed).toEqual([USER_B])
    expect(data.skipped).toEqual(
      expect.arrayContaining([{ id: USER_A, reason: '지급/회수 처리에 실패했습니다.', label: 'a@x.com' }])
    )
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
