/**
 * 배지·드랍 엔진 판정 구조화 로그 (engine_decision_log)
 *
 * "왜 이 배지가 발급/미발급됐는지", "왜 이 아이템이 뽑혔는지"를 사후에
 * SQL 조회만으로 재구성할 수 있게 한다. 로그 실패는 메인 흐름을 막지 않는다
 * (recordFeedEvent와 동일한 패턴 — try/catch로 흡수).
 */
import { createServiceClient } from '@/lib/supabase/server'

export type EngineDecisionEvent =
  | 'sync_result'
  | 'drop_attempt'
  | 'point_award_failed'
  | 'faction_constant_missing'

export async function logEngineDecision(
  engine: 'badge' | 'drop',
  event: EngineDecisionEvent,
  userId: string | null,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('engine_decision_log').insert({
      user_id: userId,
      engine,
      event,
      payload,
    })
  } catch (e) {
    console.error('[engine-log] 기록 실패:', e)
  }
}
