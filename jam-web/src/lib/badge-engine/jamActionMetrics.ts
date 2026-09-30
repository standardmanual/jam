/**
 * JAM! 행동 지표 계산 — 믹스 시도·성공·실패·레시피 최초 성공 (서버 사이드 전용, 티켓 20261001_0631)
 *
 * `jamActionBadges.ts`의 `METRIC_COMPUTERS`가 부르는 «값 계산» 함수 모음이다. 각 함수는
 * `(supabase, userId)`를 받아 숫자(또는 집합)를 돌려주고, **DB 오류를 던진다.** 오류를 0으로 바꿔
 * 돌려주면 「센 값이 0」과 「세지 못함」이 구분되지 않아 배지가 잘못 발급되거나 영영 안 나오기 때문이다.
 * 던진 오류는 `evaluateJamActionBadges`가 그 지표만 건너뛰는 것(fail-closed)으로 받는다.
 *
 * 값의 정의 (BADGE_ENGINE_UNIFIED.md 믹스 절):
 *  - 성공 횟수: `user_combine_success_logs` 행 수(빈손 성공 포함).
 *  - 실패 횟수: `user_combine_fail_logs` 중 `fail_reason = 'no_recipe_match'` 수. 재료가 소각되기 전에
 *    끝난 실패(`invalid_count`·`items_not_found`·`recipe_not_found`)는 세지 않는다.
 *  - 시도 횟수: 성공 횟수 + 실패 횟수(= 재료가 소각된 시도).
 *  - 레시피 최초 성공: 그 레시피의 `is_recipe_first = true` 행이 내 것인가.
 *
 * 성공 기록은 이 기능을 배포한 날부터, 실패 로그는 2026-09-10부터 쌓였다 — 과거 구간은 소급되지 않는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

function throwQueryError(label: string, error: { message?: string }): never {
  throw new Error(`[jamActionMetrics] ${label} 조회 오류: ${error.message ?? '알 수 없는 오류'}`)
}

/** 믹스 성공 횟수 — `user_combine_success_logs` 행 수 */
export async function countCombineSuccess(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('user_combine_success_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (error) throwQueryError('믹스 성공 기록', error)
  return count ?? 0
}

/** 믹스 실패 횟수 — 재료가 소각된 실패(`no_recipe_match`)만 센다 */
export async function countCombineFail(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('user_combine_fail_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('fail_reason', 'no_recipe_match')
  if (error) throwQueryError('믹스 실패 로그', error)
  return count ?? 0
}

/** 믹스 시도 횟수 — 성공 기록 수 + `no_recipe_match` 실패 수 */
export async function countCombineAttempts(supabase: SupabaseClient, userId: string): Promise<number> {
  const [success, fail] = await Promise.all([countCombineSuccess(supabase, userId), countCombineFail(supabase, userId)])
  return success + fail
}

/**
 * `recipeIds` 중 내가 «최초 성공자»인 레시피 id 집합 — `is_recipe_first = true` 행이 내 것인 레시피.
 * 최초 표시는 레시피마다 DB가 1행만 허용하므로(부분 유니크 인덱스, 마이그레이션 200) 같은 레시피가
 * 두 유저의 집합에 동시에 들어가는 일은 없다.
 */
export async function fetchFirstSuccessRecipeIds(
  supabase: SupabaseClient,
  userId: string,
  recipeIds: readonly string[]
): Promise<Set<string>> {
  if (recipeIds.length === 0) return new Set()
  const { data, error } = await supabase
    .from('user_combine_success_logs')
    .select('recipe_id')
    .eq('user_id', userId)
    .eq('is_recipe_first', true)
    .in('recipe_id', [...recipeIds])
  if (error) throwQueryError('레시피 최초 성공 기록', error)
  return new Set(((data ?? []) as { recipe_id: string }[]).map((r) => r.recipe_id))
}
