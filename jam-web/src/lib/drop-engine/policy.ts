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
  rarity_epic: 0.09,
  rarity_mystic: 0.03,
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
    const { data, error } = await supabase.from('drop_policy').select('*').eq('id', 1).single()
    if (error) {
      // 폴백은 유지하되(드랍 엔진이 죽으면 안 됨) 실패 신호는 서버 로그에 남긴다
      console.error('[drop-policy] 조회 실패 — 기본 정책으로 폴백:', error)
      return DEFAULT_DROP_POLICY
    }
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
  } catch (e) {
    console.error('[drop-policy] 조회 예외 — 기본 정책으로 폴백:', e)
    return DEFAULT_DROP_POLICY
  }
}

/**
 * 드랍 정책을 저장한다. 실패하면 호출부가 인지하도록 예외를 던진다.
 * (이전에는 upsert 반환 error를 확인하지 않아 저장 실패가 성공으로 응답됐다)
 */
export async function updateDropPolicy(patch: Partial<DropPolicy>): Promise<void> {
  const supabase = createServiceClient()
  const payload = { id: 1, ...patch, updated_at: new Date().toISOString() }
  // @ts-expect-error Supabase upsert()가 페이로드 타입을 never[]로 추론하는 제한 우회
  // (억제가 여전히 필요함을 tsc로 확인)
  const { error } = await supabase.from('drop_policy').upsert(payload)
  if (error) {
    console.error('[drop-policy] 저장 실패:', error)
    throw new Error(`drop_policy upsert 실패 (${error.code}): ${error.message}`)
  }
}
