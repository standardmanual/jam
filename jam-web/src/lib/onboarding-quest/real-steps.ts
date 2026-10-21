/**
 * 온보딩 퀘스트 «실제 3단계» 읽기 (티켓 20261021_1248 1회, 운영 로직 2.2절)
 *
 * 연출 7단계와 별개로 유저가 자기 활동으로 하는 세 단계를 기록에서 읽는다.
 *  ① 첫 동기화      — `strava_activities`에 걸러지지 않은(`filter_reason IS NULL`) 활동이 1건 이상
 *  ② 캡슐 열기      — `capsule_opens`에 그 유저의 행이 1건 이상(열 때마다 1행, 마이그레이션 232)
 *  ③ 잠긴 개체 열기 — `inventory_item_events`에 `unlocked`이고 `user_id`가 그 유저인 행이 1건 이상(마이그레이션 235).
 *                     동기화로 받은 잠긴 개체를 열어도 센다(사용자 결정 2) — 캡슐에서 나온 것만이 아니다.
 * 세 단계는 순서와 무관하게 각자 독립이다.
 *
 * 읽기와 판정을 나눈다: DB 읽기(`readRealSteps`)와 순수 판정(`isRealStepsDone`). 홈 카드(2회)도 같은 읽기를 쓴다.
 *
 * **하나라도 읽지 못하면 던진다.** 읽지 못한 단계를 «아직 안 했다»로 돌려주면 카드가 틀린 체크를 보이고,
 * «했다»로 돌려주면 챕터 1이 잘못 시작된다. 던지면 호출부가 «마쳤다»로 보지 않는 쪽(챕터를 시작하지 않는 쪽)으로 처리한다.
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface RealStepsProgress {
  /** ① 걸러지지 않은 활동이 처리돼 있다 */
  sync: boolean
  /** ② 캡슐을 한 번 이상 열었다 */
  capsuleOpened: boolean
  /** ③ 잠긴 아이템 배지를 한 번 이상 열었다 */
  lockedOpened: boolean
}

/** 순수 판정 — 세 단계가 모두 끝났는가 */
export function isRealStepsDone(steps: RealStepsProgress): boolean {
  return steps.sync && steps.capsuleOpened && steps.lockedOpened
}

type QueryResult = { data: unknown[] | null; error: { message: string } | null }

/** 한 단계의 «기록이 1건 이상 있는가»를 읽는다. 읽지 못하면 던진다. */
async function hasRow(label: string, query: PromiseLike<QueryResult>): Promise<boolean> {
  const { data, error } = await query
  if (error) throw new Error(`실제 단계 읽기 실패 (${label}): ${error.message}`)
  return (data?.length ?? 0) > 0
}

/** 실제 3단계를 읽는다. 하나라도 읽지 못하면 던진다 — 틀린 «마쳤다»를 만들지 않는다. */
export async function readRealSteps(supabase: SupabaseClient, userId: string): Promise<RealStepsProgress> {
  const [sync, capsuleOpened, lockedOpened] = await Promise.all([
    hasRow(
      '첫 동기화',
      supabase
        .from('strava_activities')
        .select('id')
        .eq('user_id', userId)
        .is('filter_reason', null) // 걸러진 활동은 «실제 첫 활동»이 아니다(티켓 20261017_1421)
        .limit(1)
    ),
    hasRow('캡슐 열기', supabase.from('capsule_opens').select('id').eq('user_id', userId).limit(1)),
    hasRow(
      '잠긴 개체 열기',
      supabase.from('inventory_item_events').select('id').eq('user_id', userId).eq('event_type', 'unlocked').limit(1)
    ),
  ])
  return { sync, capsuleOpened, lockedOpened }
}
