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
 *  - `collection_complete_count`: 내가 완성한 서로 다른 컬렉션 수. 원천은 두 표다 — 옛 완성 표 `user_item_book_completions`
 *    (PK `(user_id, item_book_id)`)와 등급 완성 표 `user_item_book_tier_completions`(PK `(user_id, item_book_id, tier)`).
 *    **등급 하나라도 완성하면 센다, 컬렉션당 최대 1**(티켓 20261022_0939 사용자 결정 3): 한 컬렉션의 등급 행이 여러 개여도,
 *    옛 표와 등급 표에 같은 컬렉션이 겹쳐도 컬렉션 id 기준으로 한 번만 센다. 장착 해제·교체는 이 기록을 지우지 않는다.
 *
 * ## SQL 등가식 (읽기 전용 기준값 — 마이그레이션 203의 검증 주석과 같다)
 * ```
 * mission_complete_count    = count(*) FROM user_mission_completions      WHERE user_id = :u
 * collection_complete_count = count(DISTINCT item_book_id) FROM (
 *                                SELECT item_book_id FROM user_item_book_completions      WHERE user_id = :u
 *                                UNION ALL
 *                                SELECT item_book_id FROM user_item_book_tier_completions WHERE user_id = :u
 *                              ) c
 * ```
 * 세 테이블 모두 `user_id` 선두 인덱스가 있어(`idx_user_mission_completions_user`, 두 완성 표는 PK) 별도 인덱스를 만들지 않는다.
 * 옛 완성 표를 읽는 쪽은 옛 방식을 걷는 회차(티켓 20261022_0939 2회)에서 걷는다.
 *
 * 선택 인자 `window`(티켓 20261019_1445): 주면 `completed_at`이 그 범위 안인 행만 센다(미션의 «참가한 뒤, 기간 안»).
 * 컬렉션 완성은 두 표의 `completed_at`에 모두 건다. 주지 않으면 위의 전체 기록 그대로다 — 배지 엔진 호출처는 이 인자를 쓰지 않는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { selectAllPages } from './jamActionPaging'
import { applyMetricWindow, type MetricWindow } from './jamActionWindow'

/** 오류 메시지 접두어 — 로그에서 어느 계산인지 알아보도록 공용 페이징에 넘긴다 */
const TAG = 'jamActionCompletionMetrics'

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

/**
 * 완성한 컬렉션 수 — 옛 완성 표와 등급 완성 표에서 읽은 컬렉션 id의 **서로 다른 개수**.
 *
 * 한 컬렉션이 여러 등급 행으로 남거나 두 표에 겹쳐도 한 번만 센다. 행이 아니라 id가 필요해 head count 대신 id를 읽는다
 * (유저 한 명의 완성 기록은 컬렉션 수 × 등급 수가 상한이라 작다). 한 번에 받는 상한을 넘기는 경우를 대비해 공용 페이징을 쓰고,
 * 조회 오류는 0으로 바꾸지 않고 던진다.
 */
export async function countCollectionCompletions(supabase: SupabaseClient, userId: string, window?: MetricWindow): Promise<number> {
  const [legacyRows, tierRows] = await Promise.all([
    selectAllPages<{ item_book_id: string }>(TAG, '컬렉션 완성 기록', (from, to) =>
      applyMetricWindow(
        supabase.from('user_item_book_completions').select('item_book_id').eq('user_id', userId),
        'completed_at',
        window
      )
        .order('item_book_id')
        .range(from, to)
    ),
    selectAllPages<{ item_book_id: string }>(TAG, '컬렉션 등급 완성 기록', (from, to) =>
      applyMetricWindow(
        supabase.from('user_item_book_tier_completions').select('item_book_id').eq('user_id', userId),
        'completed_at',
        window
      )
        .order('item_book_id')
        .order('tier')
        .range(from, to)
    ),
  ])
  return new Set([...legacyRows, ...tierRows].map((row) => row.item_book_id)).size
}
