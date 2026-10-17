/**
 * lib/jam/policy — `jam_policy` 로더 (티켓 20261017_1423)
 *
 * 고정하는 것: 정상 행은 그대로 읽는다(NUMERIC 문자열 포함) · 조회 실패·행 없음·예외는 기본값(1/2/3, 3배, 4주, 1,200)과
 * 로그 · 비정상 칸은 그 칸만 기본값으로 대체하고 나머지는 DB 값을 쓴다.
 * 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/jam/__tests__/policy.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))

import { DEFAULT_JAM_POLICY, getJamPolicy } from '../policy'

function fakeClient(result: { data: unknown; error: unknown } | 'throw'): SupabaseClient {
  return {
    from: (table: string) => {
      expect(table).toBe('jam_policy')
      return {
        select: () => ({
          eq: () => ({
            single: async () => {
              if (result === 'throw') throw new Error('network')
              return result
            },
          }),
        }),
      }
    },
  } as unknown as SupabaseClient
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.restoreAllMocks()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('DEFAULT_JAM_POLICY', () => {
  it('운영 로직 4.4·16.3절 기본값이다', () => {
    expect(DEFAULT_JAM_POLICY).toEqual({
      intensity_light: 1,
      intensity_normal: 2,
      intensity_hard: 3,
      mass_earn_alert_multiplier: 3,
      mass_earn_alert_weeks: 4,
      mass_earn_alert_no_history_amount: 1200,
    })
  })
})

describe('getJamPolicy', () => {
  it('DB 행의 값을 그대로 읽는다 (NUMERIC은 문자열로 와도 숫자로 바꾼다)', async () => {
    const policy = await getJamPolicy(
      fakeClient({
        data: {
          id: 1,
          intensity_light: 2,
          intensity_normal: 4,
          intensity_hard: 6,
          mass_earn_alert_multiplier: '2.50',
          mass_earn_alert_weeks: 8,
          mass_earn_alert_no_history_amount: 900,
          updated_at: '2026-10-17T00:00:00Z',
        },
        error: null,
      })
    )
    expect(policy).toEqual({
      intensity_light: 2,
      intensity_normal: 4,
      intensity_hard: 6,
      mass_earn_alert_multiplier: 2.5,
      mass_earn_alert_weeks: 8,
      mass_earn_alert_no_history_amount: 900,
    })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('조회 실패는 기본값으로 대체하고 로그를 남긴다', async () => {
    const policy = await getJamPolicy(fakeClient({ data: null, error: { message: 'boom' } }))
    expect(policy).toEqual(DEFAULT_JAM_POLICY)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('행이 없으면 기본값으로 대체하고 로그를 남긴다', async () => {
    const policy = await getJamPolicy(fakeClient({ data: null, error: null }))
    expect(policy).toEqual(DEFAULT_JAM_POLICY)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('조회가 예외를 던져도 기본값을 돌려준다', async () => {
    const policy = await getJamPolicy(fakeClient('throw'))
    expect(policy).toEqual(DEFAULT_JAM_POLICY)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('비정상 칸만 기본값으로 대체한다 (음수·소수 배율, 0주, 숫자가 아닌 값)', async () => {
    const policy = await getJamPolicy(
      fakeClient({
        data: {
          id: 1,
          intensity_light: -1,
          intensity_normal: 2.5,
          intensity_hard: 5,
          mass_earn_alert_multiplier: 0,
          mass_earn_alert_weeks: 0,
          mass_earn_alert_no_history_amount: 'abc',
        },
        error: null,
      })
    )
    expect(policy).toEqual({ ...DEFAULT_JAM_POLICY, intensity_hard: 5 })
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('배율 0은 허용한다 (운영자가 해당 강도의 잼을 끌 수 있다)', async () => {
    const policy = await getJamPolicy(fakeClient({ data: { ...DEFAULT_JAM_POLICY, intensity_light: 0 }, error: null }))
    expect(policy.intensity_light).toBe(0)
  })
})
