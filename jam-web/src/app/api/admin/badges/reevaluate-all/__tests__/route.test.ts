/**
 * POST /api/admin/badges/reevaluate-all — 안전 가드 고정 (티켓 20261006_1529)
 *
 * 이 라우트는 `dryRun: false`로 부르면 실제 배지·포인트를 발급한다. 그래서 «발급 경로가 열리지 않는 입력»을 테스트로 묶는다.
 *  ① 관리자가 아니면 403 — 어떤 평가도 돌지 않는다
 *  ② `includeUpcoming`(읽기 전용 미리보기)과 `dryRun: false` 동시 금지(400)
 *  ③ `badgeIds`는 `includeUpcoming: true` 없이는 금지(400) — 좁혀진다고 믿고 `dryRun: false`로 보내면 전체 카탈로그가 발급된다
 *  ④ 대상 유저 0명이면 평가 없이 0 응답. 단 미리보기(`includeUpcoming`)는 0명이어도 그대로 진행한다
 *  ⑤ 미리보기 성공은 읽기 전용 응답, 실패는 내부 오류 문장 없이 고정 문장 500
 *  ⑥ `dryRun`은 생략하면 true — 명시적 `false`만 실제 발급 경로(`reevaluateUsersForCatalog`)를 연다
 *
 * 실제 발급은 일어나지 않는다 — 평가 함수(`reevaluateUsersForCatalog`·`previewUpcomingJamBadges`)는 모의 함수이고
 * 대상 유저 조회(`users`)만 가짜 클라이언트로 돌려준다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/badges/reevaluate-all/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const ADMIN = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@jam.app' }

const state = vi.hoisted(() => ({
  /** `users` 전체 조회 결과 */
  users: [] as { id: string }[],
  usersError: null as { message: string } | null,
  /** `users` 조회가 실제로 나갔는지 — 입력 검증에서 걸러진 요청은 DB를 건드리지 않는다 */
  usersQueried: 0,
}))

const getAdminUserMock = vi.hoisted(() => vi.fn())
const reevaluateMock = vi.hoisted(() => vi.fn())
const previewMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/admin/auth', () => ({ getAdminUser: getAdminUserMock }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => {
        if (table === 'users') state.usersQueried += 1
        return Promise.resolve(
          state.usersError ? { data: null, error: state.usersError } : { data: state.users, error: null }
        )
      },
    }),
  }),
}))
vi.mock('@/lib/badge-engine/reevaluateCatalog', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/badge-engine/reevaluateCatalog')>()),
  reevaluateUsersForCatalog: reevaluateMock,
  previewUpcomingJamBadges: previewMock,
}))

const { POST } = await import('../route')

function post(body: unknown): NextRequest {
  return new NextRequest('https://j-a-m.app/api/admin/badges/reevaluate-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** 입력 검증에서 걸러진 요청은 평가도 대상 유저 조회도 하지 않는다 */
function expectNothingRan() {
  expect(reevaluateMock).not.toHaveBeenCalled()
  expect(previewMock).not.toHaveBeenCalled()
  expect(state.usersQueried).toBe(0)
}

const PREVIEW_RESULT = {
  targetUserCount: 2,
  affectedUserCount: 1,
  totalPoints: 80,
  badges: [{ badgeId: 'jam-upcoming', name: '예정 믹서', validFrom: '2099-01-01T00:00:00Z', userCount: 1, points: 80 }],
  errors: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  state.users = [{ id: 'user-1' }, { id: 'user-2' }]
  state.usersError = null
  state.usersQueried = 0
  getAdminUserMock.mockResolvedValue(ADMIN)
  reevaluateMock.mockResolvedValue({ dryRun: true, targetUserCount: 2, users: [] })
  previewMock.mockResolvedValue(PREVIEW_RESULT)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('관리자 권한', () => {
  it('관리자가 아니면 403이고 평가도 대상 유저 조회도 하지 않는다', async () => {
    getAdminUserMock.mockResolvedValue(null)

    const res = await POST(post({ dryRun: false }))

    expect(res.status).toBe(403)
    expectNothingRan()
  })
})

describe('includeUpcoming 가드', () => {
  it('includeUpcoming과 dryRun: false를 같이 보내면 400이고 발급 경로가 열리지 않는다', async () => {
    const res = await POST(post({ includeUpcoming: true, dryRun: false }))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('dryRun: false')
    expectNothingRan()
  })

  it('includeUpcoming: true는 dryRun을 생략하거나 true로 보낼 때만 미리보기로 간다', async () => {
    const omitted = await POST(post({ includeUpcoming: true }))
    const explicit = await POST(post({ includeUpcoming: true, dryRun: true }))

    expect(omitted.status).toBe(200)
    expect(explicit.status).toBe(200)
    expect(previewMock).toHaveBeenCalledTimes(2)
    expect(reevaluateMock).not.toHaveBeenCalled()
  })
})

describe('badgeIds 가드', () => {
  it('includeUpcoming 없이 badgeIds를 보내면 400이다(dryRun: false여도 전체 카탈로그를 발급하지 않는다)', async () => {
    const res = await POST(post({ badgeIds: ['badge-1'], dryRun: false }))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('includeUpcoming: true')
    expectNothingRan()
  })

  it('includeUpcoming: false로 보내도 badgeIds는 거절한다', async () => {
    const res = await POST(post({ badgeIds: ['badge-1'], includeUpcoming: false }))

    expect(res.status).toBe(400)
    expectNothingRan()
  })

  it('includeUpcoming: true와 함께면 badgeIds를 미리보기에 그대로 넘긴다', async () => {
    const res = await POST(post({ includeUpcoming: true, badgeIds: ['jam-upcoming'] }))

    expect(res.status).toBe(200)
    expect(previewMock).toHaveBeenCalledWith(expect.anything(), {
      userIds: ['user-1', 'user-2'],
      badgeIds: ['jam-upcoming'],
    })
    expect(reevaluateMock).not.toHaveBeenCalled()
  })
})

describe('대상 유저 0명', () => {
  it('전체 유저가 0명이면 평가 없이 0으로 채운 응답을 돌려준다', async () => {
    state.users = []

    const res = await POST(post({}))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      dryRun: true,
      targetUserCount: 0,
      affectedUserCount: 0,
      totalBadgesIssued: 0,
      totalPointsAwarded: 0,
      totalCounterIncrements: 0,
      jamActionAffectedUserCount: 0,
      totalJamActionBadgesIssued: 0,
      totalJamActionPointsAwarded: 0,
      usageMetricAffectedUserCount: 0,
      totalUsageMetricBadgesIssued: 0,
      totalUsageMetricPointsAwarded: 0,
      users: [],
    })
    expect(reevaluateMock).not.toHaveBeenCalled()
    expect(previewMock).not.toHaveBeenCalled()
  })

  it('0명이어도 dryRun: false는 그대로 응답에 담기고 발급 경로는 열리지 않는다', async () => {
    state.users = []

    const res = await POST(post({ dryRun: false }))

    expect((await res.json()).dryRun).toBe(false)
    expect(reevaluateMock).not.toHaveBeenCalled()
  })

  it('includeUpcoming 미리보기는 0명이어도 빈 대상으로 미리보기를 돌린다', async () => {
    state.users = []

    const res = await POST(post({ includeUpcoming: true }))

    expect(res.status).toBe(200)
    expect(previewMock).toHaveBeenCalledWith(expect.anything(), { userIds: [], badgeIds: undefined })
  })
})

describe('열릴 예정 배지 미리보기', () => {
  it('성공하면 읽기 전용 표지(dryRun: true, includeUpcoming: true)와 미리보기 결과를 돌려준다', async () => {
    const res = await POST(post({ includeUpcoming: true }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ dryRun: true, includeUpcoming: true, ...PREVIEW_RESULT })
    expect(previewMock).toHaveBeenCalledWith(expect.anything(), { userIds: ['user-1', 'user-2'], badgeIds: undefined })
    expect(reevaluateMock).not.toHaveBeenCalled()
  })

  it('실패하면 500이고 응답에는 내부 오류 문장이 없다. 상세는 서버 로그에만 남는다', async () => {
    const internal = new Error('배지 목록 조회 실패: relation "badges" permission denied')
    previewMock.mockRejectedValue(internal)

    const res = await POST(post({ includeUpcoming: true }))

    expect(res.status).toBe(500)
    const raw = await res.text()
    expect(JSON.parse(raw)).toEqual({ error: '열릴 예정 배지 미리보기 중 오류가 발생했습니다. 서버 로그를 확인해 주세요.' })
    expect(raw).not.toContain('permission denied')
    expect(raw).not.toContain('relation')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('열릴 예정 배지 미리보기 오류'), internal)
    expect(reevaluateMock).not.toHaveBeenCalled()
  })
})

describe('dryRun 기본값', () => {
  it('dryRun을 생략하면 true로 평가한다(실제 발급 경로가 열리지 않는다)', async () => {
    await POST(post({}))

    expect(reevaluateMock).toHaveBeenCalledWith(expect.anything(), { dryRun: true, userIds: ['user-1', 'user-2'] })
  })

  it('명시적 dryRun: false일 때만 false로 평가한다(모의 함수라 실제 발급은 없다)', async () => {
    await POST(post({ dryRun: false }))

    expect(reevaluateMock).toHaveBeenCalledWith(expect.anything(), { dryRun: false, userIds: ['user-1', 'user-2'] })
  })
})
