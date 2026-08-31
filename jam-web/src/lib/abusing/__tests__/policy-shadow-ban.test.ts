/**
 * abusing/policy — 앱 키 ↔ DB 컬럼 매핑 + 섀도우밴 판정 회귀 테스트
 *
 * 배경: `abusing_policy` 테이블의 실제 컬럼은 `soft_legendary_rate`/`hard_legendary_rate`인데
 * 앱은 `soft_legend_rate`/`hard_legend_rate`를 읽는다(티켓 20260813_003 rename 누락).
 * getAbusingPolicy()에 정규화 폴백이 없어 반환 객체에 앱 키가 아예 없었고,
 * shadow-ban.ts의 `?? 1.0` 폴백 때문에 소프트밴·하드밴 유저의 legend 드랍이
 * 차단되지 않고 정상 확률로 허용됐다 (티켓 20260831_1149).
 *
 * 실행: cd jam-web && npx vitest run src/lib/abusing/__tests__/policy-shadow-ban.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

/** `abusing_policy` 행을 DB 컬럼명 그대로 돌려주는 스텁 (조사 시점 실제값, 2026-08-31) */
const dbRow = vi.hoisted(() => ({
  current: {
    id: 1,
    soft_common_rate: 1.0,
    soft_rare_rate: 1.0,
    soft_legendary_rate: 0.0,
    soft_mythic_rate: 0.0,
    hard_common_rate: 1.0,
    hard_rare_rate: 0.0,
    hard_legendary_rate: 0.0,
    hard_mythic_rate: 0.0,
    gps_max_speed_kmh: 300,
    poi_block_hours: 72,
    vehicle_speed_filter_kmh: 60,
    gps_daily_distance_cap_km: 3000,
    updated_at: '2026-08-13T01:28:00.090694+00:00',
  } as Record<string, unknown>,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: (): SupabaseClient => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      single: async () => ({ data: dbRow.current, error: null }),
    }
    return { from: () => builder } as unknown as SupabaseClient
  },
}))

import { getAbusingPolicy, DEFAULT_POLICY } from '../policy'
import { shouldAllowDrop } from '../shadow-ban'

describe('getAbusingPolicy — DB 컬럼 → 앱 키 매핑', () => {
  beforeEach(() => {
    dbRow.current = {
      ...dbRow.current,
      soft_legendary_rate: 0.0,
      hard_legendary_rate: 0.0,
      gps_max_speed_kmh: 300,
    }
  })

  it('soft_legendary_rate / hard_legendary_rate를 앱 키로 되돌린다', async () => {
    const policy = await getAbusingPolicy()
    expect(policy.soft_legend_rate).toBe(0)
    expect(policy.hard_legend_rate).toBe(0)
    // DB 컬럼명이 그대로 새어 나오지 않는다
    expect((policy as unknown as Record<string, unknown>).soft_legendary_rate).toBeUndefined()
  })

  it('NUMERIC이 문자열로 내려와도 숫자로 정규화한다', async () => {
    dbRow.current = { ...dbRow.current, soft_legendary_rate: '0.30', gps_max_speed_kmh: '250' }
    const policy = await getAbusingPolicy()
    expect(policy.soft_legend_rate).toBeCloseTo(0.3)
    expect(policy.gps_max_speed_kmh).toBe(250)
  })

  it('키가 없으면 기본값으로 폴백하고 서버 로그를 남긴다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const withoutLegend = { ...dbRow.current }
    delete withoutLegend.soft_legendary_rate
    dbRow.current = withoutLegend
    const policy = await getAbusingPolicy()
    expect(policy.soft_legend_rate).toBe(DEFAULT_POLICY.soft_legend_rate)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('shouldAllowDrop — 섀도우밴 legend 차단', () => {
  it('DB에서 읽은 정책으로 소프트밴 legend 드랍을 차단한다 (수정 전 true였던 회귀)', async () => {
    const policy = await getAbusingPolicy()
    expect(shouldAllowDrop('legend', 'soft', policy)).toBe(false)
    expect(shouldAllowDrop('mythic', 'soft', policy)).toBe(false)
    expect(shouldAllowDrop('common', 'soft', policy)).toBe(true)
    expect(shouldAllowDrop('rare', 'soft', policy)).toBe(true)
  })

  it('하드밴은 common만 허용한다', async () => {
    const policy = await getAbusingPolicy()
    expect(shouldAllowDrop('common', 'hard', policy)).toBe(true)
    expect(shouldAllowDrop('rare', 'hard', policy)).toBe(false)
    expect(shouldAllowDrop('legend', 'hard', policy)).toBe(false)
    expect(shouldAllowDrop('mythic', 'hard', policy)).toBe(false)
  })

  it('밴이 없으면 모든 등급을 허용한다', () => {
    expect(shouldAllowDrop('legend', 'none', DEFAULT_POLICY)).toBe(true)
    expect(shouldAllowDrop('mythic', 'none', DEFAULT_POLICY)).toBe(true)
  })

  it('기본 정책도 소프트밴 legend를 차단한다', () => {
    expect(shouldAllowDrop('legend', 'soft', DEFAULT_POLICY)).toBe(false)
  })
})
