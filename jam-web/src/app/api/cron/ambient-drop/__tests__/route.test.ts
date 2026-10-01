/**
 * GET /api/cron/ambient-drop — 날짜 예약 처리와 매일 배포의 독립 (티켓 20261001_2051)
 *
 * 매시 cron은 두 가지를 한다. ① 도래한 날짜 예약을 처리한다(매 호출, `auto_enabled`와 무관). ② 매일 배포
 * 판정을 한다(`auto_enabled`·배포 시각·하루 1회). 둘은 서로를 막지 않는다 — 예약 처리가 던져도 매일 배포는
 * 돌고, 매일 배포가 꺼져 있어도 예약은 처리된다.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/cron/ambient-drop/__tests__/route.test.ts
 */
import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const SECRET = 'test-cron-secret'

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  config: { auto_enabled: true, schedule_hour_kst: 3 } as Record<string, unknown>,
  claimResult: true,
  runDue: vi.fn(),
  runBatch: vi.fn(),
}))

vi.mock('@/lib/ambient-drop/config', () => ({
  getAmbientDropConfig: async () => {
    mocks.order.push('getConfig')
    return mocks.config
  },
  claimAmbientDropAutoRun: async () => {
    mocks.order.push('claim')
    return mocks.claimResult
  },
}))
vi.mock('@/lib/ambient-drop', () => ({
  runAmbientDropBatch: (...args: unknown[]) => {
    mocks.order.push('batch')
    return mocks.runBatch(...args)
  },
}))
vi.mock('@/lib/ambient-drop/scheduleRun', () => ({
  runDueAmbientDropSchedules: (...args: unknown[]) => {
    mocks.order.push('schedules')
    return mocks.runDue(...args)
  },
}))

const route = await import('../route')

/** KST 03:00 = 전날 18:00Z — 기본 설정(schedule_hour_kst 3)의 배포 시각 */
const SCHEDULED_HOUR = new Date('2026-10-05T18:00:00.000Z')
/** KST 10:00 */
const OTHER_HOUR = new Date('2026-10-05T01:00:00.000Z')

const SUMMARY = { due: 1, done: 1, skipped: 0, failed: 0, missed: 0 }
const BATCH_RESULT = {
  trigger: 'cron',
  ranAt: SCHEDULED_HOUR.toISOString(),
  effectiveCategorySlug: null,
  effectiveCollectionIds: [],
  effectiveRarityDistribution: { common: 1, rare: 0, epic: 0, mystic: 0 },
  eligiblePoiCount: 4,
  spawned: 3,
}

function request(auth: string | undefined = `Bearer ${SECRET}`): NextRequest {
  return new NextRequest('https://j-a-m.app/api/cron/ambient-drop', { headers: auth ? { authorization: auth } : {} })
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(SCHEDULED_HOUR)
  mocks.order = []
  mocks.config = { auto_enabled: true, schedule_hour_kst: 3 }
  mocks.claimResult = true
  mocks.runDue.mockReset().mockResolvedValue(SUMMARY)
  mocks.runBatch.mockReset().mockResolvedValue(BATCH_RESULT)
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('인증', () => {
  it('Authorization 헤더가 없거나 틀리면 401이고 아무것도 처리하지 않는다', async () => {
    for (const auth of [undefined, 'Bearer wrong', SECRET]) {
      const res = await route.GET(request(auth ?? ''))
      expect(res.status).toBe(401)
    }
    expect(mocks.runDue).not.toHaveBeenCalled()
    expect(mocks.runBatch).not.toHaveBeenCalled()
  })
})

describe('날짜 예약 처리는 매일 배포 조건과 무관하다', () => {
  it('auto_enabled=false여도 예약을 처리하고 skipped: auto_disabled와 schedules를 돌려준다', async () => {
    mocks.config = { auto_enabled: false, schedule_hour_kst: 3 }
    const res = await route.GET(request())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ skipped: true, reason: 'auto_disabled', schedules: SUMMARY })
    expect(mocks.runDue).toHaveBeenCalledTimes(1)
    expect(mocks.runBatch).not.toHaveBeenCalled()
  })

  it('배포 시각이 아니어도 예약을 처리한다', async () => {
    vi.setSystemTime(OTHER_HOUR)
    const res = await route.GET(request())
    expect(await res.json()).toEqual({ skipped: true, reason: 'not_scheduled_hour', schedules: SUMMARY })
    expect(mocks.runDue).toHaveBeenCalledTimes(1)
  })

  it('오늘 이미 배포했어도 예약을 처리한다', async () => {
    mocks.claimResult = false
    const res = await route.GET(request())
    expect(await res.json()).toEqual({ skipped: true, reason: 'already_ran_today', schedules: SUMMARY })
    expect(mocks.runDue).toHaveBeenCalledTimes(1)
  })

  it('예약 처리는 매일 배포 판정보다 먼저 한다', async () => {
    await route.GET(request())
    expect(mocks.order).toEqual(['schedules', 'getConfig', 'claim', 'batch'])
  })

  it('예약 처리에 현재 시각을 넘긴다', async () => {
    await route.GET(request())
    expect(mocks.runDue.mock.calls[0][0]).toEqual(SCHEDULED_HOUR)
  })
})

describe('예약 처리와 매일 배포는 서로를 막지 않는다', () => {
  it('예약 처리가 던져도 매일 배포는 돈다 — 응답에 schedules: { error: true }', async () => {
    mocks.runDue.mockRejectedValue(new Error('예약 처리 폭발'))
    const res = await route.GET(request())
    expect(res.status).toBe(200)
    expect(mocks.runBatch).toHaveBeenCalledWith('cron')
    expect(await res.json()).toEqual({ ...BATCH_RESULT, schedules: { error: true } })
  })

  it('예약 처리가 던져도 매일 배포 판정(꺼짐·시각 아님)은 그대로 응답한다', async () => {
    mocks.runDue.mockRejectedValue(new Error('폭발'))
    mocks.config = { auto_enabled: false, schedule_hour_kst: 3 }
    expect(await (await route.GET(request())).json()).toEqual({
      skipped: true,
      reason: 'auto_disabled',
      schedules: { error: true },
    })
  })

  it('매일 배포 결과에 기존 필드를 그대로 두고 schedules만 더한다', async () => {
    const body = await (await route.GET(request())).json()
    expect(body).toMatchObject(BATCH_RESULT)
    expect(body.schedules).toEqual(SUMMARY)
    expect(mocks.runBatch).toHaveBeenCalledTimes(1)
  })
})

describe('함수 시간', () => {
  it('maxDuration이 60초다 — 예약 여러 건과 매일 배포를 한 호출에서 처리한다', () => {
    expect(route.maxDuration).toBe(60)
  })
})
