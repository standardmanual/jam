/**
 * combine/policy — 조용한 실패(에러 삼킴) 회귀 테스트
 *
 * 배경 (티켓 20260901_1843):
 * `updateCombinePolicy()`가 upsert 반환 `error`를 확인하지 않아 저장 실패가 "성공"으로
 * 응답됐고, `getCombinePolicy()`도 select 실패를 로그 없이 기본 정책으로 흡수했다.
 * `drop-engine/policy.ts`(`getDropPolicy`/`updateDropPolicy`)와 같은 패턴으로 맞췄다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/combine/__tests__/policy.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const POLICY_ROW: Record<string, unknown> = {
  id: 1,
  tier1_max_items: 3,
  tier1_min_factions: 1,
  tier1_b_rate: 0.35,
  tier1_b_count: 1,
  tier2_max_items: 6,
  tier2_min_factions: 3,
  tier2_b_rate: 0.45,
  tier2_b_count: 2,
  tier3_max_items: 10,
  tier3_min_factions: 5,
  tier3_b_rate: 0.55,
  tier3_b_count: 3,
  pity_prob_increment: 0.03,
  pity_prob_cap: 0.5,
  pity_points_start_streak: 3,
  pity_points_base: 5,
  pity_points_step: 3,
  pity_points_increment: 3,
  pity_points_cap: 30,
  updated_at: '2026-09-01T00:00:00.000Z',
}

const stub = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  selectError: null as { code: string; message: string } | null,
  upsertError: null as { code: string; message: string } | null,
  upsertPayloads: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: (): SupabaseClient => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      single: async () => ({ data: stub.row, error: stub.selectError }),
      upsert: async (payload: Record<string, unknown>) => {
        stub.upsertPayloads.push(payload)
        return { error: stub.upsertError }
      },
    }
    return { from: () => builder } as unknown as SupabaseClient
  },
}))

import { getCombinePolicy, updateCombinePolicy, DEFAULT_COMBINE_POLICY } from '../policy'

beforeEach(() => {
  stub.row = { ...POLICY_ROW }
  stub.selectError = null
  stub.upsertError = null
  stub.upsertPayloads = []
})

describe('getCombinePolicy — 조회 실패 시 기본 정책 폴백 + 로그', () => {
  it('정상 행이면 DB 값을 그대로 돌려준다', async () => {
    const policy = await getCombinePolicy()
    expect(policy.tier1_b_rate).toBe(0.35)
  })

  it('조회 실패는 기본 정책으로 폴백하되 서버 로그를 남긴다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stub.selectError = { code: 'PGRST116', message: 'no rows' }
    const policy = await getCombinePolicy()
    expect(policy).toEqual(DEFAULT_COMBINE_POLICY)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('행이 없어도 기본 정책으로 폴백한다', async () => {
    stub.row = null
    const policy = await getCombinePolicy()
    expect(policy).toEqual(DEFAULT_COMBINE_POLICY)
  })
})

describe('updateCombinePolicy — upsert 실패 전파', () => {
  it('upsert error를 받으면 예외를 던진다 (이전에는 삼켰다)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stub.upsertError = { code: 'PGRST204', message: "Could not find the 'foo' column" }
    await expect(updateCombinePolicy({ tier1_b_rate: 0.4 })).rejects.toThrow('PGRST204')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('정상이면 { id: 1, ...patch, updated_at } 페이로드로 저장한다', async () => {
    await updateCombinePolicy({ tier1_b_rate: 0.4 })
    expect(stub.upsertPayloads).toHaveLength(1)
    const payload = stub.upsertPayloads[0]
    expect(payload.id).toBe(1)
    expect(payload.tier1_b_rate).toBe(0.4)
    expect(typeof payload.updated_at).toBe('string')
  })
})
