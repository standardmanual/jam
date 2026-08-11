/**
 * 어뷰징 정책 설정 로딩
 * service_role 클라이언트 전용
 */
import { createServiceClient } from '@/lib/supabase/server'

export interface AbusingPolicy {
  soft_common_rate: number
  soft_rare_rate: number
  soft_legendary_rate: number
  soft_mythic_rate: number
  hard_common_rate: number
  hard_rare_rate: number
  hard_legendary_rate: number
  hard_mythic_rate: number
  gps_max_speed_kmh: number
  poi_block_hours: number
  vehicle_speed_filter_kmh: number
  gps_daily_distance_cap_km: number
}

const DEFAULT_POLICY: AbusingPolicy = {
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
}

export async function getAbusingPolicy(): Promise<AbusingPolicy> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase.from('abusing_policy').select('*').eq('id', 1).single()
    if (!data) return DEFAULT_POLICY
    return data
  } catch {
    return DEFAULT_POLICY
  }
}

export async function updateAbusingPolicy(patch: Partial<AbusingPolicy>): Promise<void> {
  const supabase = createServiceClient()
  const table = supabase.from('abusing_policy')
  const payload = { id: 1, ...patch, updated_at: new Date().toISOString() }
  // @ts-expect-error Supabase upsert() 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 AbusingPolicyRow와 일치
  await table.upsert(payload)
}
