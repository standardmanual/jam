/**
 * 앰비언트 POI 드랍 정책(ambient_drop_policy) 로딩
 * 패턴: src/lib/drop-engine/policy.ts (싱글톤 id=1, 실패 시 기본값 폴백)
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { AmbientDropPolicyRow } from '@/types/database'

export type AmbientDropPolicy = Omit<AmbientDropPolicyRow, 'id' | 'updated_at'>

export const DEFAULT_AMBIENT_DROP_POLICY: AmbientDropPolicy = {
  rarity_common: 0.86,
  rarity_rare: 0.12,
  rarity_legendary: 0.02,
  target_coverage_ratio: 0.15,
  min_target_total: 20,
  max_target_total: 2000,
  max_active_per_poi: 1,
  replenish_batch_size: 30,
}

export async function getAmbientDropPolicy(): Promise<AmbientDropPolicy> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase.from('ambient_drop_policy').select('*').eq('id', 1).single()
    if (!data) return DEFAULT_AMBIENT_DROP_POLICY
    // NUMERIC 컬럼이 문자열로 내려올 수 있어 숫자로 정규화
    const row = data as unknown as Record<string, unknown>
    const policy = { ...DEFAULT_AMBIENT_DROP_POLICY } as Record<string, number>
    for (const key of Object.keys(DEFAULT_AMBIENT_DROP_POLICY)) {
      const v = row[key]
      const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
      if (!Number.isNaN(n)) policy[key] = n
    }
    return policy as unknown as AmbientDropPolicy
  } catch {
    return DEFAULT_AMBIENT_DROP_POLICY
  }
}

export async function updateAmbientDropPolicy(patch: Partial<AmbientDropPolicy>): Promise<void> {
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('ambient_drop_policy')
    .upsert({ id: 1, ...patch, updated_at: new Date().toISOString() })
}
