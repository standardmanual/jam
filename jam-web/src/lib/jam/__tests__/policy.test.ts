/**
 * lib/jam/policy — `jam_policy` 로더 (티켓 20261017_1423)
 *
 * 고정하는 것: 정상 행은 그대로 읽는다(NUMERIC 문자열 포함) · 조회 실패·행 없음·예외는 기본값(1/2/3, 3배, 4주, 1,200)과
 * 로그 · 비정상 칸은 그 칸만 기본값으로 대체하고 나머지는 DB 값을 쓴다.
 * 아이템 발급 정책 10칸(티켓 20261017_1424)은 묶음 단위다 — 칸이 비정상이거나 등급 확률 합계가 100이 아니면 10칸 전체가
 * 기본값이 되고 로그가 한 번 남는다. 강도·경보 칸은 이 대체의 영향을 받지 않는다.
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

/** 아이템 발급 10칸의 기본값 — 강도·경보 칸만 시험하는 행에 끼워 넣는다 */
const itemIssueDefaults = {
  sync_item_guaranteed: DEFAULT_JAM_POLICY.sync_item_guaranteed,
  sync_item_guaranteed_hiking: DEFAULT_JAM_POLICY.sync_item_guaranteed_hiking,
  sync_item_bonus_rolls: DEFAULT_JAM_POLICY.sync_item_bonus_rolls,
  sync_item_bonus_jam_divisor: DEFAULT_JAM_POLICY.sync_item_bonus_jam_divisor,
  sync_item_bonus_max_probability: DEFAULT_JAM_POLICY.sync_item_bonus_max_probability,
  sync_rarity_common: DEFAULT_JAM_POLICY.sync_rarity_common,
  sync_rarity_rare: DEFAULT_JAM_POLICY.sync_rarity_rare,
  sync_rarity_epic: DEFAULT_JAM_POLICY.sync_rarity_epic,
  sync_rarity_mystic: DEFAULT_JAM_POLICY.sync_rarity_mystic,
  common_streak_threshold: DEFAULT_JAM_POLICY.common_streak_threshold,
}

describe('DEFAULT_JAM_POLICY', () => {
  it('운영 로직 4.4·16.3절 기본값이다', () => {
    expect(DEFAULT_JAM_POLICY).toEqual({
      intensity_light: 1,
      intensity_normal: 2,
      intensity_hard: 3,
      mass_earn_alert_multiplier: 3,
      mass_earn_alert_weeks: 4,
      mass_earn_alert_no_history_amount: 1200,
      sync_item_guaranteed: 1,
      sync_item_guaranteed_hiking: 2,
      sync_item_bonus_rolls: 2,
      sync_item_bonus_jam_divisor: 600,
      sync_item_bonus_max_probability: 0.25,
      sync_rarity_common: 84,
      sync_rarity_rare: 13,
      sync_rarity_epic: 2.5,
      sync_rarity_mystic: 0.5,
      common_streak_threshold: 10,
    })
  })

  it('기본 등급 확률 합계는 100이다', () => {
    const d = DEFAULT_JAM_POLICY
    expect(d.sync_rarity_common + d.sync_rarity_rare + d.sync_rarity_epic + d.sync_rarity_mystic).toBeCloseTo(100, 6)
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
          sync_item_guaranteed: 2,
          sync_item_guaranteed_hiking: 3,
          sync_item_bonus_rolls: 3,
          sync_item_bonus_jam_divisor: '300',
          sync_item_bonus_max_probability: '0.500',
          sync_rarity_common: '70.000',
          sync_rarity_rare: '20.000',
          sync_rarity_epic: '8.000',
          sync_rarity_mystic: '2.000',
          common_streak_threshold: 5,
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
      sync_item_guaranteed: 2,
      sync_item_guaranteed_hiking: 3,
      sync_item_bonus_rolls: 3,
      sync_item_bonus_jam_divisor: 300,
      sync_item_bonus_max_probability: 0.5,
      sync_rarity_common: 70,
      sync_rarity_rare: 20,
      sync_rarity_epic: 8,
      sync_rarity_mystic: 2,
      common_streak_threshold: 5,
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
          ...itemIssueDefaults,
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

  it('등급 확률 합계가 100이 아니면 아이템 발급 정책 10칸 전체를 기본값으로 대체하고 로그를 남긴다 (강도·경보 칸은 DB 값 유지)', async () => {
    const policy = await getJamPolicy(
      fakeClient({
        data: {
          ...DEFAULT_JAM_POLICY,
          intensity_hard: 5,
          sync_item_guaranteed: 3,
          sync_rarity_common: 90,
          sync_rarity_rare: 20,
        },
        error: null,
      })
    )
    expect(policy).toEqual({ ...DEFAULT_JAM_POLICY, intensity_hard: 5 })
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('아이템 발급 칸 하나가 비정상이면(분모 0) 10칸 전체를 기본값으로 대체한다', async () => {
    const policy = await getJamPolicy(
      fakeClient({
        data: { ...DEFAULT_JAM_POLICY, sync_item_guaranteed: 5, sync_item_bonus_jam_divisor: 0 },
        error: null,
      })
    )
    expect(policy).toEqual(DEFAULT_JAM_POLICY)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('새 칸이 행에 없으면 아이템 발급 정책은 기본값이다', async () => {
    const legacyRow: Record<string, unknown> = { ...DEFAULT_JAM_POLICY, intensity_light: 2 }
    for (const key of Object.keys(itemIssueDefaults)) delete legacyRow[key]
    const policy = await getJamPolicy(fakeClient({ data: legacyRow, error: null }))
    expect(policy).toEqual({ ...DEFAULT_JAM_POLICY, intensity_light: 2 })
  })

  it('확정 개수 0과 보너스 0회는 정상 값이다 (드랍 없음 설정을 둘 수 있다)', async () => {
    const policy = await getJamPolicy(
      fakeClient({
        data: { ...DEFAULT_JAM_POLICY, sync_item_guaranteed: 0, sync_item_guaranteed_hiking: 0, sync_item_bonus_rolls: 0 },
        error: null,
      })
    )
    expect(policy.sync_item_guaranteed).toBe(0)
    expect(policy.sync_item_guaranteed_hiking).toBe(0)
    expect(policy.sync_item_bonus_rolls).toBe(0)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('등급 확률은 소수 합계 오차(DB NUMERIC 문자열)를 허용한다', async () => {
    const policy = await getJamPolicy(
      fakeClient({
        data: {
          ...DEFAULT_JAM_POLICY,
          sync_rarity_common: '33.333',
          sync_rarity_rare: '33.333',
          sync_rarity_epic: '33.334',
          sync_rarity_mystic: '0.000',
        },
        error: null,
      })
    )
    expect(policy.sync_rarity_epic).toBe(33.334)
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
