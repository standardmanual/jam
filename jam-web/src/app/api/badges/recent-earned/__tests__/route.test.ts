/**
 * GET /api/badges/recent-earned — 처음 연동 직후 도착 화면의 되읽기 (티켓 20261026_1029: 잼 합계 `jamEarned`)
 *
 * 공용 DB를 부르지 않는다. `createServiceClient()`는 줄을 들고 있는 가짜 표이고, 라우트가 건 조건(`eq`·`in`·`gte`)을 실제로 줄에 적용해
 * 돌려준다 — 그래서 «창 밖·다른 사유·다른 유저 줄이 빠진다»는 라우트가 조건을 제대로 걸었을 때만 성립한다.
 * 배지 상세를 모으는 `buildEarnedBadgePayload`는 가짜다(규칙은 `lib/strava` 쪽 시험이 고정한다).
 *
 * 고정하는 것: 창 안 활동 정산 줄의 합계가 `jamEarned`로 온다 · 창 밖·다른 사유·다른 유저 줄은 빠진다 · 줄이 없으면 0이다 ·
 * 원장을 읽지 못해도(오류 반환·예외) 기존 칸은 그대로이고 `jamEarned`는 0이다 · 피드 오류의 빈 응답에도 `jamEarned: 0`이 실린다 ·
 * 비로그인은 401이고 원장을 읽지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/badges/recent-earned/__tests__/route.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { d } from '@/lib/i18n'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-10-26T03:00:00.000Z')
/** 라우트의 10분 창 시작 */
const SINCE = new Date(NOW.getTime() - 10 * 60 * 1000)
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60 * 1000).toISOString()

type Row = Record<string, unknown>
type Result = { data: Row[] | null; error: { code: string; message: string } | null }

const state = vi.hoisted(() => ({
  authenticated: true,
  tables: {} as Record<string, Row[]>,
  /** 표 이름 → 읽기 결과를 이 값으로 갈아 끼운다(오류 시험용) */
  forced: {} as Record<string, Result | 'throw'>,
  /** 표 이름별로 읽은 횟수 */
  reads: {} as Record<string, number>,
}))
const payloadMock = vi.hoisted(() => vi.fn())

/** 조건을 줄에 적용하는 가짜 조회. `await`하면 결과가 나온다 */
function query(table: string) {
  const filters: ((row: Row) => boolean)[] = []
  const builder = {
    select: () => builder,
    eq: (col: string, value: unknown) => (filters.push((r) => r[col] === value), builder),
    in: (col: string, values: unknown[]) => (filters.push((r) => values.includes(r[col])), builder),
    gte: (col: string, value: string) => (filters.push((r) => String(r[col]) >= value), builder),
    order: () => builder,
    limit: () => builder,
    then: (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) => {
      state.reads[table] = (state.reads[table] ?? 0) + 1
      const forced = state.forced[table]
      if (forced === 'throw') return Promise.reject(new Error('boom')).then(resolve, reject)
      const result: Result = forced ?? {
        data: (state.tables[table] ?? []).filter((r) => filters.every((f) => f(r))),
        error: null,
      }
      return Promise.resolve(result).then(resolve, reject)
    },
  }
  return builder
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        state.authenticated
          ? { data: { user: { id: USER_ID } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
  }),
  createServiceClient: () => ({ from: (table: string) => query(table) }),
}))
vi.mock('@/lib/strava/sync', () => ({
  buildEarnedBadgePayload: (...args: unknown[]) => payloadMock(...args),
}))

import { GET } from '../route'

const BADGE = { id: 'b1', name: '들꽃', description: '길가에서 만났어요', imageUrl: null, rarity: 'common' }
const PAYLOAD = { earnedBadges: [BADGE], earnedBadgesMore: 2, isFirstBadgeEver: true }

const feedRow = (badgeId: string, createdAt = minutesAgo(1)): Row => ({
  user_id: USER_ID,
  event_type: 'badge_earned',
  created_at: createdAt,
  metadata: { badge_id: badgeId },
})
const ledgerRow = (amount: number, over: Row = {}): Row => ({
  user_id: USER_ID,
  reason: 'activity_settlement',
  amount,
  created_at: minutesAgo(1),
  ...over,
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  state.authenticated = true
  state.tables = { user_activity_feed: [feedRow('b1')], jam_transactions: [] }
  state.forced = {}
  state.reads = {}
  payloadMock.mockReset().mockResolvedValue(PAYLOAD)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('GET /api/badges/recent-earned — 잼 합계', () => {
  it('창 안 활동 정산 줄의 합계를 jamEarned로 싣고 기존 칸은 그대로 둔다', async () => {
    state.tables.jam_transactions = [ledgerRow(800), ledgerRow(300, { created_at: minutesAgo(5) }), ledgerRow(140)]

    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ...PAYLOAD, jamEarned: 1240 })
    expect(payloadMock).toHaveBeenCalledWith(expect.anything(), ['b1'], USER_ID)
  })

  it('창이 시작되는 시각 정각의 줄은 포함하고 그보다 1초 앞선 줄은 뺀다', async () => {
    state.tables.jam_transactions = [
      ledgerRow(100, { created_at: SINCE.toISOString() }),
      ledgerRow(7, { created_at: new Date(SINCE.getTime() - 1000).toISOString() }),
    ]

    const res = await GET()

    expect((await res.json()).jamEarned).toBe(100)
  })

  it('창 밖·다른 사유·다른 유저의 줄은 더하지 않는다', async () => {
    state.tables.jam_transactions = [
      ledgerRow(500),
      ledgerRow(9000, { created_at: minutesAgo(30) }),
      ledgerRow(9000, { created_at: minutesAgo(11) }),
      ledgerRow(9000, { reason: 'admin_grant' }),
      ledgerRow(-300, { reason: 'capsule_fill' }),
      ledgerRow(-200, { reason: 'admin_deduct' }),
      ledgerRow(9000, { user_id: OTHER_USER_ID }),
    ]

    const res = await GET()

    expect((await res.json()).jamEarned).toBe(500)
  })

  it('받은 잼이 없으면 jamEarned는 0이다', async () => {
    const res = await GET()

    await expect(res.json()).resolves.toEqual({ ...PAYLOAD, jamEarned: 0 })
  })

  it('원장 읽기가 오류를 돌려주면 jamEarned만 0으로 접고 배지 칸은 그대로 온다', async () => {
    state.tables.jam_transactions = [ledgerRow(800)]
    state.forced.jam_transactions = { data: null, error: { code: '42P01', message: 'relation does not exist' } }

    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ...PAYLOAD, jamEarned: 0 })
    expect(console.error).toHaveBeenCalled()
  })

  it('원장 읽기가 예외를 던져도 던지지 않고 jamEarned만 0으로 접는다', async () => {
    state.forced.jam_transactions = 'throw'

    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ...PAYLOAD, jamEarned: 0 })
    expect(console.error).toHaveBeenCalled()
  })

  it('피드 조회가 실패한 빈 응답에도 jamEarned: 0이 실린다', async () => {
    state.tables.jam_transactions = [ledgerRow(800)]
    state.forced.user_activity_feed = { data: null, error: { code: '42703', message: 'column does not exist' } }

    const res = await GET()

    await expect(res.json()).resolves.toEqual({ earnedBadges: [], earnedBadgesMore: 0, jamEarned: 0 })
    expect(payloadMock).not.toHaveBeenCalled()
  })

  it('비로그인이면 401이고 원장을 읽지 않는다', async () => {
    state.authenticated = false

    const res = await GET()

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: d.common.authRequired })
    expect(state.reads.jam_transactions).toBeUndefined()
  })
})
