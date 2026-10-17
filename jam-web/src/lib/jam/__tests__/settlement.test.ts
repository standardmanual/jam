/**
 * lib/jam/settlement — 잼 계산과 정산 (티켓 20261017_1423, 운영 로직 4.2~4.5절)
 *
 * 고정하는 것:
 * - 계산: 걷기 30분 30, 러닝 30분 90, 자전거 30분 60, 전기자전거 30분 30. 분은 내림. 교통수단 구간을 뺀 시간(`movingTimeSec`)을 쓴다.
 * - 종목 불일치로 걷기가 된 활동은 가벼움, 전기자전거는 원본 종목으로 가린다.
 * - 배율은 정책 값을 따른다.
 * - 활동한 날(KST): UTC 15:00 전후 경계, 늦게 동기화해도 활동한 날로 넘긴다.
 * - 같은 활동을 두 번 정산해도 원장은 한 줄. 활동 하나가 실패해도 나머지는 정산, 던지지 않는다.
 * 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/jam/__tests__/settlement.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { DEFAULT_JAM_POLICY, type JamPolicy } from '../policy'
import { computeJamAmount, jamEarnedOn, jamIntensityOf, settleActivities, type JamSettleTarget } from '../settlement'

const MIN = 60

describe('computeJamAmount — 강도 배율 × 움직인 분(내림)', () => {
  it('걷기 30분은 30, 러닝 30분은 90, 자전거 30분은 60, 전기자전거 30분은 30이다', () => {
    expect(computeJamAmount({ jamActivityType: 'walking', movingTimeSec: 30 * MIN }, DEFAULT_JAM_POLICY)).toBe(30)
    expect(computeJamAmount({ jamActivityType: 'running', movingTimeSec: 30 * MIN }, DEFAULT_JAM_POLICY)).toBe(90)
    expect(computeJamAmount({ jamActivityType: 'cycling', sportType: 'Ride', movingTimeSec: 30 * MIN }, DEFAULT_JAM_POLICY)).toBe(60)
    expect(
      computeJamAmount({ jamActivityType: 'cycling', sportType: 'EBikeRide', movingTimeSec: 30 * MIN }, DEFAULT_JAM_POLICY)
    ).toBe(30)
  })

  it('등산은 보통(×2), 트레일러닝은 격함(×3)이다', () => {
    expect(computeJamAmount({ jamActivityType: 'hiking', movingTimeSec: 30 * MIN }, DEFAULT_JAM_POLICY)).toBe(60)
    expect(computeJamAmount({ jamActivityType: 'trail_running', movingTimeSec: 30 * MIN }, DEFAULT_JAM_POLICY)).toBe(90)
  })

  it('분은 내린다 (30분 59초는 30분)', () => {
    expect(computeJamAmount({ jamActivityType: 'running', movingTimeSec: 30 * MIN + 59 }, DEFAULT_JAM_POLICY)).toBe(90)
    expect(computeJamAmount({ jamActivityType: 'walking', movingTimeSec: 59 }, DEFAULT_JAM_POLICY)).toBe(0)
  })

  it('교통수단 구간을 뺀 시간이 쓰인다 (호출부가 구간을 뺀 움직인 시간을 넘긴다)', () => {
    // 러닝 40분 중 10분이 교통수단 구간이면 넘어오는 시간은 30분이다
    expect(computeJamAmount({ jamActivityType: 'running', movingTimeSec: (40 - 10) * MIN }, DEFAULT_JAM_POLICY)).toBe(90)
  })

  it('전기 산악자전거도 가벼움이다. sportType이 없으면 type으로 가린다', () => {
    expect(
      computeJamAmount({ jamActivityType: 'cycling', sportType: 'EMountainBikeRide', movingTimeSec: 30 * MIN }, DEFAULT_JAM_POLICY)
    ).toBe(30)
    expect(
      computeJamAmount({ jamActivityType: 'cycling', sportType: null, type: 'EBikeRide', movingTimeSec: 30 * MIN }, DEFAULT_JAM_POLICY)
    ).toBe(30)
    expect(
      computeJamAmount({ jamActivityType: 'cycling', sportType: null, type: 'Ride', movingTimeSec: 30 * MIN }, DEFAULT_JAM_POLICY)
    ).toBe(60)
  })

  it('종목 불일치로 걷기가 된 활동은 가벼움이다 (원래 러닝·자전거·전기자전거여도 ×1)', () => {
    // 정산 입력의 jamActivityType은 불일치 판정 뒤의 값('walking')이다
    expect(jamIntensityOf({ jamActivityType: 'walking', sportType: 'Run' })).toBe('light')
    expect(computeJamAmount({ jamActivityType: 'walking', sportType: 'Ride', movingTimeSec: 30 * MIN }, DEFAULT_JAM_POLICY)).toBe(30)
    expect(computeJamAmount({ jamActivityType: 'walking', sportType: 'EBikeRide', movingTimeSec: 30 * MIN }, DEFAULT_JAM_POLICY)).toBe(30)
  })

  it('정산 대상 종목이 아니거나 시간 값이 비정상이면 0이다', () => {
    expect(computeJamAmount({ jamActivityType: null, movingTimeSec: 30 * MIN }, DEFAULT_JAM_POLICY)).toBe(0)
    expect(computeJamAmount({ jamActivityType: 'swimming', movingTimeSec: 30 * MIN }, DEFAULT_JAM_POLICY)).toBe(0)
    expect(computeJamAmount({ jamActivityType: 'running', movingTimeSec: Number.NaN }, DEFAULT_JAM_POLICY)).toBe(0)
    expect(computeJamAmount({ jamActivityType: 'running', movingTimeSec: -60 }, DEFAULT_JAM_POLICY)).toBe(0)
  })

  it('강도 배율을 정책으로 바꾸면 계산에 반영된다', () => {
    const policy: JamPolicy = { ...DEFAULT_JAM_POLICY, intensity_light: 2, intensity_normal: 3, intensity_hard: 5 }
    expect(computeJamAmount({ jamActivityType: 'walking', movingTimeSec: 30 * MIN }, policy)).toBe(60)
    expect(computeJamAmount({ jamActivityType: 'hiking', movingTimeSec: 30 * MIN }, policy)).toBe(90)
    expect(computeJamAmount({ jamActivityType: 'running', movingTimeSec: 30 * MIN }, policy)).toBe(150)
  })
})

describe('jamEarnedOn — 활동한 날(KST)', () => {
  const NOW = new Date('2026-10-17T03:00:00Z')

  it('UTC 14:59:59 시작은 그날(KST 23:59:59), 15:00:00 시작은 다음 날(KST 00:00:00)이다', () => {
    expect(jamEarnedOn('2026-09-12T14:59:59Z', NOW)).toBe('2026-09-12')
    expect(jamEarnedOn('2026-09-12T15:00:00Z', NOW)).toBe('2026-09-13')
    expect(jamEarnedOn('2026-09-12T00:00:00Z', NOW)).toBe('2026-09-12')
  })

  it('늦게 동기화해도 동기화한 날이 아니라 활동한 날이다', () => {
    expect(jamEarnedOn('2026-09-01T01:00:00Z', NOW)).toBe('2026-09-01')
  })

  it('읽을 수 없는 시각은 null, 미래 날짜는 오늘(KST)로 맞춘다', () => {
    expect(jamEarnedOn('', NOW)).toBeNull()
    expect(jamEarnedOn('not-a-date', NOW)).toBeNull()
    expect(jamEarnedOn('2026-10-20T00:00:00Z', NOW)).toBe('2026-10-17')
  })
})

// ---------------------------------------------------------------------------------------------
// 정산 함수 — 가짜 클라이언트(원장 줄을 활동 id별로 하나만 받는다)

interface Ledger {
  /** source_activity_id → 원장에 기록된 줄 */
  lines: Map<string, { amount: number; earnedOn: string }>
  balance: number
  rpcCalls: Record<string, unknown>[]
}

function makeLedgerClient(opts: {
  activityIds: Record<number, string>
  failFor?: Set<string>
  activitiesError?: boolean
}): { supabase: SupabaseClient; ledger: Ledger } {
  const ledger: Ledger = { lines: new Map(), balance: 0, rpcCalls: [] }
  const supabase = {
    from: (table: string) => {
      expect(table).toBe('strava_activities')
      const chain = {
        eq: () => chain,
        in: async (_col: string, ids: number[]) =>
          opts.activitiesError
            ? { data: null, error: { message: 'boom' } }
            : {
                data: ids.filter((id) => opts.activityIds[id]).map((id) => ({ id: opts.activityIds[id], strava_id: id })),
                error: null,
              },
      }
      return { select: () => chain }
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe('jam_apply')
      ledger.rpcCalls.push(args)
      const activityId = args.p_source_activity_id as string
      if (opts.failFor?.has(activityId)) return { data: null, error: { message: 'rpc failed' } }
      const existing = ledger.lines.get(activityId)
      if (existing) return { data: { amount: existing.amount, source_activity_id: activityId }, error: null }
      ledger.lines.set(activityId, { amount: args.p_amount as number, earnedOn: args.p_earned_on as string })
      ledger.balance += args.p_amount as number
      return { data: { amount: args.p_amount, source_activity_id: activityId }, error: null }
    },
  } as unknown as SupabaseClient
  return { supabase, ledger }
}

function target(stravaId: number, overrides: Partial<JamSettleTarget> = {}): JamSettleTarget {
  return {
    stravaId,
    startDate: '2026-09-12T00:00:00Z',
    movingTimeSec: 30 * MIN,
    jamActivityType: 'running',
    sportType: 'Run',
    type: 'Run',
    ...overrides,
  }
}

const NOW = new Date('2026-10-17T03:00:00Z')

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('settleActivities', () => {
  it('활동마다 jam_apply(activity_settlement, 활동 id, 활동한 날 KST)를 부르고 합계를 돌려준다', async () => {
    const { supabase, ledger } = makeLedgerClient({ activityIds: { 1: 'act-1', 2: 'act-2' } })
    const result = await settleActivities(
      supabase,
      'user-1',
      [target(1), target(2, { jamActivityType: 'walking', sportType: 'Walk', type: 'Walk' })],
      DEFAULT_JAM_POLICY,
      NOW
    )

    expect(result.total).toBe(90 + 30)
    expect(result.items).toEqual([
      { stravaId: 1, activityId: 'act-1', amount: 90, earnedOn: '2026-09-12' },
      { stravaId: 2, activityId: 'act-2', amount: 30, earnedOn: '2026-09-12' },
    ])
    expect(ledger.rpcCalls[0]).toEqual({
      p_user_id: 'user-1',
      p_amount: 90,
      p_reason: 'activity_settlement',
      p_source_activity_id: 'act-1',
      p_earned_on: '2026-09-12',
    })
  })

  it('p_earned_on은 활동한 날이다 — 늦게 동기화해도, UTC 15:00 경계에서도', async () => {
    const { supabase, ledger } = makeLedgerClient({ activityIds: { 1: 'act-1', 2: 'act-2', 3: 'act-3' } })
    await settleActivities(
      supabase,
      'user-1',
      [
        target(1, { startDate: '2026-09-12T14:59:59Z' }),
        target(2, { startDate: '2026-09-12T15:00:00Z' }),
        target(3, { startDate: '2026-08-01T01:00:00Z' }), // 두 달 가까이 늦게 동기화한 활동
      ],
      DEFAULT_JAM_POLICY,
      NOW
    )
    const dateOf = (id: string) => ledger.lines.get(id)?.earnedOn
    expect(dateOf('act-1')).toBe('2026-09-12')
    expect(dateOf('act-2')).toBe('2026-09-13')
    expect(dateOf('act-3')).toBe('2026-08-01')
    // 어느 줄도 동기화한 날(2026-10-17)로 잡히지 않는다
    expect([...ledger.lines.values()].map((l) => l.earnedOn)).not.toContain('2026-10-17')
  })

  it('같은 활동을 두 번 정산해도 원장은 한 줄이고 가진 양은 한 번만 늘어난다', async () => {
    const { supabase, ledger } = makeLedgerClient({ activityIds: { 1: 'act-1' } })
    await settleActivities(supabase, 'user-1', [target(1)], DEFAULT_JAM_POLICY, NOW)
    const second = await settleActivities(supabase, 'user-1', [target(1)], DEFAULT_JAM_POLICY, NOW)

    expect(ledger.lines.size).toBe(1)
    expect(ledger.balance).toBe(90)
    // 두 번째는 기존 줄을 돌려받으므로 원장에 기록된 양 그대로다
    expect(second.total).toBe(90)
  })

  it('잼이 0인 활동(1분 미만, 배율 0)은 원장을 부르지 않는다', async () => {
    const { supabase, ledger } = makeLedgerClient({ activityIds: { 1: 'act-1', 2: 'act-2' } })
    const result = await settleActivities(
      supabase,
      'user-1',
      [target(1, { movingTimeSec: 59 }), target(2, { jamActivityType: 'walking' })],
      { ...DEFAULT_JAM_POLICY, intensity_light: 0 },
      NOW
    )
    expect(ledger.rpcCalls).toEqual([])
    expect(result).toEqual({ total: 0, items: [] })
  })

  it('활동 하나의 정산이 실패해도 나머지는 정산하고 던지지 않는다', async () => {
    const { supabase, ledger } = makeLedgerClient({ activityIds: { 1: 'act-1', 2: 'act-2' }, failFor: new Set(['act-1']) })
    const result = await settleActivities(supabase, 'user-1', [target(1), target(2)], DEFAULT_JAM_POLICY, NOW)

    expect(result.items.map((i) => i.stravaId)).toEqual([2])
    expect(result.total).toBe(90)
    expect(ledger.lines.has('act-1')).toBe(false)
  })

  it('활동 id를 읽지 못하면 정산을 건너뛰고 던지지 않는다', async () => {
    const { supabase, ledger } = makeLedgerClient({ activityIds: { 1: 'act-1' }, activitiesError: true })
    const result = await settleActivities(supabase, 'user-1', [target(1)], DEFAULT_JAM_POLICY, NOW)
    expect(result).toEqual({ total: 0, items: [] })
    expect(ledger.rpcCalls).toEqual([])
  })

  it('저장된 활동 행이 없는 활동은 건너뛴다', async () => {
    const { supabase, ledger } = makeLedgerClient({ activityIds: { 1: 'act-1' } })
    const result = await settleActivities(supabase, 'user-1', [target(1), target(2)], DEFAULT_JAM_POLICY, NOW)
    expect(result.items.map((i) => i.stravaId)).toEqual([1])
    expect(ledger.rpcCalls).toHaveLength(1)
  })

  it('시작 시각을 읽을 수 없는 활동은 건너뛴다 (동기화한 날로 잡히지 않게)', async () => {
    const { supabase, ledger } = makeLedgerClient({ activityIds: { 1: 'act-1' } })
    const result = await settleActivities(supabase, 'user-1', [target(1, { startDate: '' })], DEFAULT_JAM_POLICY, NOW)
    expect(result.total).toBe(0)
    expect(ledger.rpcCalls).toEqual([])
  })

  it('클라이언트가 예외를 던져도 던지지 않는다', async () => {
    const supabase = {
      from: () => {
        throw new Error('network')
      },
    } as unknown as SupabaseClient
    await expect(settleActivities(supabase, 'user-1', [target(1)], DEFAULT_JAM_POLICY, NOW)).resolves.toEqual({
      total: 0,
      items: [],
    })
  })

  it('대상이 없으면 아무것도 부르지 않는다', async () => {
    const supabase = {
      from: () => {
        throw new Error('호출되면 안 된다')
      },
    } as unknown as SupabaseClient
    await expect(settleActivities(supabase, 'user-1', [], DEFAULT_JAM_POLICY, NOW)).resolves.toEqual({ total: 0, items: [] })
  })
})
