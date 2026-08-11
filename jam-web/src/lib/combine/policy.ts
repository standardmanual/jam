/**
 * 조합 정책(combine_policy) 로딩 — service_role 클라이언트 전용
 * 패턴: src/lib/drop-engine/policy.ts (싱글톤 id=1, 실패 시 기본값 폴백)
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { CombinePolicyRow } from '@/types/database'

export type CombinePolicy = Omit<CombinePolicyRow, 'id' | 'updated_at'>

export const DEFAULT_COMBINE_POLICY: CombinePolicy = {
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
}

export async function getCombinePolicy(): Promise<CombinePolicy> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase.from('combine_policy').select('*').eq('id', 1).single()
    if (!data) return DEFAULT_COMBINE_POLICY
    const row = data as unknown as Record<string, unknown>
    const policy = { ...DEFAULT_COMBINE_POLICY } as Record<string, number>
    for (const key of Object.keys(DEFAULT_COMBINE_POLICY)) {
      const v = row[key]
      const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
      if (!Number.isNaN(n)) policy[key] = n
    }
    return policy as unknown as CombinePolicy
  } catch {
    return DEFAULT_COMBINE_POLICY
  }
}

export async function updateCombinePolicy(patch: Partial<CombinePolicy>): Promise<void> {
  const supabase = createServiceClient()
  const q = supabase.from('combine_policy')
  // @ts-expect-error Supabase insert/update/upsert 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 CombinePolicyRow와 일치
  await q.upsert({ id: 1, ...patch, updated_at: new Date().toISOString() })
}

/** 재료 개수 + 서로 다른 소재 세계관 수로 티어 결정. 요건 미충족 시 하위 티어로 강등. */
export function resolveTier(
  itemCount: number,
  distinctFactionCount: number,
  policy: CombinePolicy
): { tier: 1 | 2 | 3; bRate: number; bCount: number } | null {
  if (itemCount < 2 || itemCount > policy.tier3_max_items) return null

  if (itemCount <= policy.tier3_max_items && distinctFactionCount >= policy.tier3_min_factions) {
    return { tier: 3, bRate: policy.tier3_b_rate, bCount: policy.tier3_b_count }
  }
  if (itemCount <= policy.tier2_max_items && distinctFactionCount >= policy.tier2_min_factions) {
    return { tier: 2, bRate: policy.tier2_b_rate, bCount: policy.tier2_b_count }
  }
  // tier1(기본) — 다양성 요건 미충족 시 이 티어로 강등
  return { tier: 1, bRate: policy.tier1_b_rate, bCount: policy.tier1_b_count }
}
