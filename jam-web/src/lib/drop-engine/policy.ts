/**
 * 드랍 파라미터(drop_policy) 로딩 — service_role 클라이언트 전용
 * 패턴: src/lib/abusing/policy.ts (싱글톤 id=1, 실패 시 기본값 폴백)
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { DropPolicyRow } from '@/types/database'

export type DropPolicy = Omit<DropPolicyRow, 'id' | 'updated_at'>

export const DEFAULT_DROP_POLICY: DropPolicy = {
  // Layer 1
  rarity_common: 0.6,
  rarity_rare: 0.28,
  rarity_legendary: 0.09,
  rarity_mythic: 0.03,
  bonus_drop_rate: 0.15,
  bonus_drop_rate_intense: 0.3,
  intense_duration_min: 60,
  intense_elevation_m: 300,
  rare_pity_threshold: 5,
  daily_downgrade_from: 4,
  daily_downgrade_common: 0.9,
  comeback_gap_days: 7,
  weekly_first_rare_mult: 2.0,
  // Layer 2
  momentum_weight: 0.5,
  adjacent_weight: 0.25,
  explore_weight: 0.15,
  context_override_rate: 0.6,
  mystery_spice_rate: 0.15,
  // Layer 3
  completion_decay: 0.7,
  completed_book_weight: 0.3,
  same_book_penalty: 0.5,
  last_piece_pity_threshold: 5,
}

export async function getDropPolicy(): Promise<DropPolicy> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase.from('drop_policy').select('*').eq('id', 1).single()
    if (!data) return DEFAULT_DROP_POLICY
    // NUMERIC 컬럼이 문자열로 내려올 수 있어 숫자로 정규화
    const row = data as unknown as Record<string, unknown>
    const policy = { ...DEFAULT_DROP_POLICY } as Record<string, number>
    for (const key of Object.keys(DEFAULT_DROP_POLICY)) {
      const v = row[key]
      const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
      if (!Number.isNaN(n)) policy[key] = n
    }
    return policy as unknown as DropPolicy
  } catch {
    return DEFAULT_DROP_POLICY
  }
}

export async function updateDropPolicy(patch: Partial<DropPolicy>): Promise<void> {
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('drop_policy')
    .upsert({ id: 1, ...patch, updated_at: new Date().toISOString() })
}
