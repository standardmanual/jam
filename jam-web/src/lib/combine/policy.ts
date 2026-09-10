/**
 * 믹스 정책(combine_policy) 로딩 — service_role 클라이언트 전용
 * 패턴: src/lib/drop-engine/policy.ts (싱글톤 id=1, 실패 시 기본값 폴백)
 *
 * 마이그레이션 153(티켓 20260910_1408)에서 트라이브 다양성 티어(경로 B)와 피티를
 * 전면 폐기했다 — 남은 설정은 「레시피 미매칭 시 지급할 고정 포인트」 하나뿐이다.
 * 싱글톤 구조·기본값 폴백·저장 실패 시 예외 던지기 패턴은 그대로 지킨다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { CombinePolicyRow } from '@/types/database'

export type CombinePolicy = Omit<CombinePolicyRow, 'id' | 'updated_at'>

/** DB 기본값(마이그레이션 153의 `DEFAULT 10`)과 동일하게 맞춘다 — 폴백 시 실패가 빈손이 되지 않게. */
export const DEFAULT_COMBINE_POLICY: CombinePolicy = {
  fail_reward_points: 10,
}

export async function getCombinePolicy(): Promise<CombinePolicy> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.from('combine_policy').select('*').eq('id', 1).single()
    if (error) {
      // 폴백은 유지하되(믹스 기능이 죽으면 안 됨) 실패 신호는 서버 로그에 남긴다 (티켓 20260901_1843)
      console.error('[combine-policy] 조회 실패 — 기본 정책으로 폴백:', error)
      return DEFAULT_COMBINE_POLICY
    }
    if (!data) return DEFAULT_COMBINE_POLICY
    const row = data as unknown as Record<string, unknown>
    const policy = { ...DEFAULT_COMBINE_POLICY } as Record<string, number>
    for (const key of Object.keys(DEFAULT_COMBINE_POLICY)) {
      const v = row[key]
      const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
      if (!Number.isNaN(n)) policy[key] = n
    }
    return policy as unknown as CombinePolicy
  } catch (e) {
    console.error('[combine-policy] 조회 예외 — 기본 정책으로 폴백:', e)
    return DEFAULT_COMBINE_POLICY
  }
}

/**
 * 조합 정책을 저장한다. 실패하면 호출부가 인지하도록 예외를 던진다.
 * (이전에는 upsert 반환 error를 확인하지 않아 저장 실패가 성공으로 응답됐다 — 티켓 20260901_1843,
 * `drop-engine/policy.ts`의 `updateDropPolicy` 패턴을 그대로 따른다)
 */
export async function updateCombinePolicy(patch: Partial<CombinePolicy>): Promise<void> {
  const supabase = createServiceClient()
  const q = supabase.from('combine_policy')
  const { error } = await q.upsert({ id: 1, ...patch, updated_at: new Date().toISOString() })
  if (error) {
    console.error('[combine-policy] 저장 실패:', error)
    throw new Error(`combine_policy upsert 실패 (${error.code}): ${error.message}`)
  }
}
