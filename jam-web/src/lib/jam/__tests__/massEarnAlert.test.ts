/**
 * lib/jam/massEarnAlert — 대량 수령 경보 (티켓 20261017_1423, 운영 로직 16.3절)
 *
 * 고정하는 것:
 * - 기준선: 지난 N주(오늘 KST 포함 7×N일)의 `jam_daily_earned` 합계. 읽지 못하면 null.
 * - 판정: 받은 잼이 주간 평균의 배수를 **넘을 때만**(같으면 아니다). 지난 기록이 없으면 1,200을 넘을 때만.
 * - 발송: `#jam-alert`로 중단 신호 글 형식. 발송 실패·예외·기준선 없음은 던지지 않는다. 자동 제재는 없다.
 * 실제 슬랙은 호출하지 않는다 — 발송 함수를 모킹한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/jam/__tests__/massEarnAlert.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { postOpsSlackMock } = vi.hoisted(() => ({ postOpsSlackMock: vi.fn() }))

vi.mock('@/lib/admin/opsInbox/slack', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin/opsInbox/slack')>('@/lib/admin/opsInbox/slack')
  return { ...actual, postOpsSlack: postOpsSlackMock }
})

import { DEFAULT_JAM_POLICY } from '../policy'
import {
  alertMassEarnIfNeeded,
  describeMassEarn,
  isMassEarn,
  MASS_EARN_ALERT_LABEL,
  readMassEarnBaseline,
  type MassEarnBaseline,
} from '../massEarnAlert'

const NOW = new Date('2026-10-17T03:00:00Z') // KST 2026-10-17 12:00

beforeEach(() => {
  vi.clearAllMocks()
  postOpsSlackMock.mockResolvedValue({ ok: true })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('isMassEarn', () => {
  // 지난 4주에 400을 모았다면 주간 평균 100, 3배는 300
  const baseline: MassEarnBaseline = { pastTotal: 400, weeks: 4 }

  it('주간 평균의 3배를 넘을 때만 참이다 (같으면 거짓)', () => {
    expect(isMassEarn(301, baseline, DEFAULT_JAM_POLICY)).toBe(true)
    expect(isMassEarn(300, baseline, DEFAULT_JAM_POLICY)).toBe(false)
    expect(isMassEarn(299, baseline, DEFAULT_JAM_POLICY)).toBe(false)
  })

  it('지난 기록이 없으면 1,200을 넘을 때만 참이다 (같으면 거짓)', () => {
    const none: MassEarnBaseline = { pastTotal: 0, weeks: 4 }
    expect(isMassEarn(1201, none, DEFAULT_JAM_POLICY)).toBe(true)
    expect(isMassEarn(1200, none, DEFAULT_JAM_POLICY)).toBe(false)
    expect(isMassEarn(90, none, DEFAULT_JAM_POLICY)).toBe(false)
  })

  it('받은 잼이 없으면 거짓이다', () => {
    expect(isMassEarn(0, baseline, DEFAULT_JAM_POLICY)).toBe(false)
    expect(isMassEarn(0, { pastTotal: 0, weeks: 4 }, DEFAULT_JAM_POLICY)).toBe(false)
  })

  it('배수·기록 없음 기준은 정책 값을 따른다', () => {
    expect(isMassEarn(201, baseline, { ...DEFAULT_JAM_POLICY, mass_earn_alert_multiplier: 2 })).toBe(true)
    expect(isMassEarn(200, baseline, { ...DEFAULT_JAM_POLICY, mass_earn_alert_multiplier: 2 })).toBe(false)
    expect(isMassEarn(501, { pastTotal: 0, weeks: 4 }, { ...DEFAULT_JAM_POLICY, mass_earn_alert_no_history_amount: 500 })).toBe(true)
  })

  it('기준 주 수가 다르면 평균도 그 주 수로 나눈다 (8주 800 = 주간 100)', () => {
    expect(isMassEarn(301, { pastTotal: 800, weeks: 8 }, DEFAULT_JAM_POLICY)).toBe(true)
    expect(isMassEarn(300, { pastTotal: 800, weeks: 8 }, DEFAULT_JAM_POLICY)).toBe(false)
  })
})

describe('readMassEarnBaseline', () => {
  function client(result: { data: unknown; error: unknown } | 'throw', filters: Record<string, unknown> = {}): SupabaseClient {
    return {
      from: (table: string) => {
        expect(table).toBe('jam_daily_earned')
        const chain: Record<string, unknown> = {
          eq: (col: string, v: unknown) => {
            filters[col] = v
            return chain
          },
          gte: (col: string, v: unknown) => {
            filters[`gte:${col}`] = v
            return chain
          },
          lte: async (col: string, v: unknown) => {
            filters[`lte:${col}`] = v
            if (result === 'throw') throw new Error('network')
            return result
          },
        }
        return { select: () => chain }
      },
    } as unknown as SupabaseClient
  }

  it('지난 4주(오늘 KST 포함 28일)의 일별 합계를 더한다', async () => {
    const filters: Record<string, unknown> = {}
    const baseline = await readMassEarnBaseline(
      client({ data: [{ amount: 100 }, { amount: '250' }], error: null }, filters),
      'user-1',
      DEFAULT_JAM_POLICY,
      NOW
    )
    expect(baseline).toEqual({ pastTotal: 350, weeks: 4 })
    expect(filters).toMatchObject({
      user_id: 'user-1',
      'gte:earned_on': '2026-09-20', // 2026-10-17 포함 28일의 첫날
      'lte:earned_on': '2026-10-17',
    })
  })

  it('기록이 없으면 합계 0이다', async () => {
    expect(await readMassEarnBaseline(client({ data: [], error: null }), 'user-1', DEFAULT_JAM_POLICY, NOW)).toEqual({
      pastTotal: 0,
      weeks: 4,
    })
  })

  it('정책의 주 수를 따른다', async () => {
    const filters: Record<string, unknown> = {}
    const baseline = await readMassEarnBaseline(
      client({ data: [{ amount: 80 }], error: null }, filters),
      'user-1',
      { ...DEFAULT_JAM_POLICY, mass_earn_alert_weeks: 2 },
      NOW
    )
    expect(baseline).toEqual({ pastTotal: 80, weeks: 2 })
    expect(filters['gte:earned_on']).toBe('2026-10-04')
  })

  it('조회 실패·예외는 null이다 (기록 없음으로 대체하지 않는다)', async () => {
    expect(await readMassEarnBaseline(client({ data: null, error: { message: 'boom' } }), 'user-1', DEFAULT_JAM_POLICY, NOW)).toBeNull()
    expect(await readMassEarnBaseline(client('throw'), 'user-1', DEFAULT_JAM_POLICY, NOW)).toBeNull()
  })
})

describe('alertMassEarnIfNeeded', () => {
  const baseline: MassEarnBaseline = { pastTotal: 400, weeks: 4 }

  it('기준을 넘으면 #jam-alert(alert 채널)로 중단 신호 글을 보낸다', async () => {
    const sent = await alertMassEarnIfNeeded({ userId: 'user-1', earned: 301, baseline, policy: DEFAULT_JAM_POLICY })

    expect(sent).toBe(true)
    expect(postOpsSlackMock).toHaveBeenCalledTimes(1)
    const [channel, text] = postOpsSlackMock.mock.calls[0] as [string, string]
    expect(channel).toBe('alert')
    expect(text).toContain('중단 신호가 새로 걸렸어요')
    expect(text).toContain(MASS_EARN_ALERT_LABEL)
    expect(text).toContain('user-1')
    expect(text).toContain('301')
  })

  it('기준 이하면 보내지 않는다 (3배 정확히는 아니다)', async () => {
    expect(await alertMassEarnIfNeeded({ userId: 'user-1', earned: 300, baseline, policy: DEFAULT_JAM_POLICY })).toBe(false)
    expect(postOpsSlackMock).not.toHaveBeenCalled()
  })

  it('지난 기록이 없으면 1,200 초과일 때만 보낸다', async () => {
    const none: MassEarnBaseline = { pastTotal: 0, weeks: 4 }
    await alertMassEarnIfNeeded({ userId: 'user-1', earned: 1200, baseline: none, policy: DEFAULT_JAM_POLICY })
    expect(postOpsSlackMock).not.toHaveBeenCalled()
    await alertMassEarnIfNeeded({ userId: 'user-1', earned: 1201, baseline: none, policy: DEFAULT_JAM_POLICY })
    expect(postOpsSlackMock).toHaveBeenCalledTimes(1)
  })

  it('기준선을 읽지 못했으면 보내지 않는다', async () => {
    expect(await alertMassEarnIfNeeded({ userId: 'user-1', earned: 99999, baseline: null, policy: DEFAULT_JAM_POLICY })).toBe(false)
    expect(postOpsSlackMock).not.toHaveBeenCalled()
  })

  it('발송이 실패해도(ok:false) 던지지 않고 false를 돌려준다', async () => {
    postOpsSlackMock.mockResolvedValueOnce({ ok: false, error: 'not_configured' })
    await expect(
      alertMassEarnIfNeeded({ userId: 'user-1', earned: 301, baseline, policy: DEFAULT_JAM_POLICY })
    ).resolves.toBe(false)
  })

  it('발송이 예외를 던져도 던지지 않는다', async () => {
    postOpsSlackMock.mockRejectedValueOnce(new Error('network'))
    await expect(
      alertMassEarnIfNeeded({ userId: 'user-1', earned: 301, baseline, policy: DEFAULT_JAM_POLICY })
    ).resolves.toBe(false)
  })
})

describe('describeMassEarn', () => {
  it('지난 기록이 있으면 주간 평균과 배수를, 없으면 기록 없음과 기준을 적는다', () => {
    expect(describeMassEarn('user-1', 2160, { pastTotal: 400, weeks: 4 }, DEFAULT_JAM_POLICY)).toBe(
      '유저(user-1)가 한 번의 동기화로 잼 2,160을 받았어요 (지난 4주 주간 평균 100, 기준 3배 초과)'
    )
    expect(describeMassEarn('user-1', 2160, { pastTotal: 0, weeks: 4 }, DEFAULT_JAM_POLICY)).toBe(
      '유저(user-1)가 한 번의 동기화로 잼 2,160을 받았어요 (지난 4주 기록 없음, 기준 1,200 초과)'
    )
  })
})
