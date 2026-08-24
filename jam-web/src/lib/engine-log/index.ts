/**
 * 엔진 판정 구조화 로그 (engine_decision_log)
 *
 * "왜 이 배지가 발급/미발급됐는지", "왜 이 아이템이 뽑혔는지", "포인트 지급이 왜 실패했는지"를
 * 사후에 SQL 조회만으로 재구성할 수 있게 한다.
 *
 * ## 실패 정책 — "삼키되 로그는 남긴다"
 *
 * 로그 실패가 본 흐름(배지 발급·드랍·포인트 지급)을 깨뜨려서는 안 되므로 예외를 던지지 않는다.
 * 다만 **조용히 사라지지도 않게 한다.** insert가 반환하는 `error`를 반드시 검사하고
 * `console.error`로 남긴다 — `supabase-js`는 실패해도 throw하지 않으므로 try/catch만으로는
 * 아무것도 잡히지 않는다. (실제로 티켓 20260824_024 이전까지 `points` 로그가 CHECK 제약에
 * 막혀 전량 무성 유실됐다.)
 */
import { createServiceClient } from '@/lib/supabase/server'

/**
 * 판정을 남긴 엔진.
 *
 * **값을 추가하면 DB의 CHECK 제약도 함께 확장해야 한다.**
 * 제약: `engine_decision_log_engine_check` (마이그레이션 073에서 생성, 098에서 'points' 추가)
 * 경로: `supabase/migrations/0XX_engine_decision_log_*.sql`에 새 마이그레이션을 추가한다.
 * 한쪽만 고치면 타입 검사는 통과하는데 런타임에 조용히 거절된다 — 이번 결함의 원인이다.
 */
export type EngineKind = 'badge' | 'drop' | 'points'

export type EngineDecisionEvent =
  | 'sync_result'
  | 'drop_attempt'
  | 'point_award_failed'
  | 'faction_constant_missing'
  | 'drop_state_last_activity_mismatch'

/**
 * ## `@ts-expect-error` 대신 좁은 캐스팅을 쓰는 이유
 *
 * `src/types/database.ts`의 `XxxRow`가 `interface`라 supabase-js의 `GenericSchema` 제약
 * (`Row: Record<string, unknown>`)을 만족하지 못해 `Schema`가 `never`로 접히고,
 * `.insert()` 인자가 `never`로 추론된다(리포 전역 문제 — 해소는 이 티켓 범위 밖).
 *
 * `@ts-expect-error`로 덮으면 **원인이 해소되는 순간 그 주석 줄 자체가 컴파일 오류**가 되어
 * 무관한 작업이 빌드를 깨뜨린다. 대신 이 호출부만 실제 계약으로 좁혀 둔다 —
 * insert 인자는 `EngineDecisionLogInsert`로 **여전히 타입 검사를 받는다.**
 * 이번 결함이 "타입은 통과했는데 런타임에 거절됐다"는 성격이라 특히 중요하다.
 * (메서드 형태로 호출해야 `this`가 유지되므로 함수만 떼어내지 않고 객체째 캐스팅한다)
 */
interface PostgrestFailure {
  message: string
}

interface EngineDecisionLogInsert {
  user_id: string | null
  engine: EngineKind
  event: EngineDecisionEvent
  payload: Record<string, unknown>
}

type EngineDecisionLogTable = {
  insert: (values: EngineDecisionLogInsert) => PromiseLike<{ error: PostgrestFailure | null }>
}

export async function logEngineDecision(
  engine: EngineKind,
  event: EngineDecisionEvent,
  userId: string | null,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = createServiceClient()
    const table = supabase.from('engine_decision_log') as unknown as EngineDecisionLogTable
    const row: EngineDecisionLogInsert = { user_id: userId, engine, event, payload }
    const { error } = await table.insert(row)

    if (error) {
      // 예외로 승격하지 않는다 — 다만 어느 호출부가 유실됐는지는 식별 가능해야 한다
      console.error(
        `[engine-log] 기록 실패 — engine: ${engine}, event: ${event}, userId: ${userId ?? 'null'}:`,
        error
      )
    }
  } catch (e) {
    // 네트워크 예외 등 throw 경로 (본 흐름을 끌고 들어가지 않는다)
    console.error(
      `[engine-log] 기록 중 예외 — engine: ${engine}, event: ${event}, userId: ${userId ?? 'null'}:`,
      e
    )
  }
}
