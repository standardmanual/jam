/**
 * JAM! 행동 지표 계산 — 미션 완료·컬렉션 완성 (서버 사이드 전용, 티켓 20261001_0633, 상위 20260930_1456 ③)
 *
 * `jamActionBadges.ts`의 `METRIC_COMPUTERS`가 부르는 «값 계산» 함수 모음이다. `jamActionMetrics.ts`와 같은
 * 규약이다: `(supabase, userId)`를 받아 숫자를 돌려주고 **DB 오류를 던진다**(0으로 바꿔 돌려주면
 * 「센 값이 0」과 「세지 못함」이 구분되지 않는다). 던진 오류는 `evaluateJamActionBadges`가 그 지표만
 * 건너뛰는 것(fail-closed)으로 받는다.
 *
 * ## 값의 정의 (BADGE_ENGINE_UNIFIED.md)
 * 둘 다 **전체 기록**을 센다(가입 이전 기록도 센다 — 상위 티켓 결정 Q1).
 *
 *  - `mission_complete_count`: 내가 완료한 서로 다른 미션 수. 원천은 `user_mission_completions`이고
 *    `UNIQUE(user_id, mission_id)`라 행 수가 서로 다른 미션 수다(같은 미션을 다시 완료해도 행이 늘지 않는다).
 *  - `collection_complete_count`: 내가 완성한 서로 다른 컬렉션 수. 원천은 `user_item_book_completions`이고
 *    PK `(user_id, item_book_id)`라 행 수가 서로 다른 컬렉션 수다. 장착 해제·교체는 이 기록을 지우지 않는다.
 *
 * ## SQL 등가식 (읽기 전용 기준값 — 마이그레이션 203의 검증 주석과 같다)
 * ```
 * mission_complete_count    = count(*) FROM user_mission_completions      WHERE user_id = :u
 * collection_complete_count = count(*) FROM user_item_book_completions    WHERE user_id = :u
 * ```
 * 두 테이블 모두 `user_id` 선두 인덱스가 있어(`idx_user_mission_completions_user`, PK) 별도 인덱스를 만들지 않는다.
 *
 * 선택 인자 `window`(티켓 20261019_1445): 주면 `completed_at`이 그 범위 안인 행만 센다(미션의 «참가한 뒤, 기간 안»).
 * 주지 않으면 위의 전체 기록 그대로다 — 배지 엔진 호출처는 이 인자를 쓰지 않는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { applyMetricWindow, type MetricWindow } from './jamActionWindow'

function throwQueryError(label: string, error: { message?: string }): never {
  throw new Error(`[jamActionCompletionMetrics] ${label} 조회 오류: ${error.message ?? '알 수 없는 오류'}`)
}

/** 완료한 미션 수 — `user_mission_completions` 행 수(`UNIQUE(user_id, mission_id)`라 서로 다른 미션 수) */
export async function countMissionCompletions(supabase: SupabaseClient, userId: string, window?: MetricWindow): Promise<number> {
  const { count, error } = await applyMetricWindow(
    supabase.from('user_mission_completions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    'completed_at',
    window
  )
  if (error) throwQueryError('미션 완료 기록', error)
  return count ?? 0
}

/** 완성한 컬렉션 수 — `user_item_book_completions` 행 수(PK `(user_id, item_book_id)`라 서로 다른 컬렉션 수) */
export async function countCollectionCompletions(supabase: SupabaseClient, userId: string, window?: MetricWindow): Promise<number> {
  const { count, error } = await applyMetricWindow(
    supabase.from('user_item_book_completions').select('item_book_id', { count: 'exact', head: true }).eq('user_id', userId),
    'completed_at',
    window
  )
  if (error) throwQueryError('컬렉션 완성 기록', error)
  return count ?? 0
}
