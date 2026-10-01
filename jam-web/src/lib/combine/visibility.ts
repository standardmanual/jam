/**
 * 믹스 레시피 공개 판정 — 믹스 화면과 믹스 시도가 공유하는 단일 규칙 (티켓 20261001_1157)
 *
 * 순수 함수만 둔다(Supabase·React 의존 없음). `/combine` 서버 렌더와 `combineRecipeAttempt()`가
 * 반드시 이 파일을 거쳐 판정하게 해서 화면과 서버가 서로 다른 규칙을 쓰지 않게 한다
 * (`lib/missions/visibility.ts`의 `isMissionExposed` 선례).
 *
 * ## 판정 규칙
 *
 * - `valid_from`이 `null`/`undefined`이면 공개 — 지금까지 모든 레시피의 동작이고, 마이그레이션 204가
 *   아직 적용되지 않은 환경(칸이 없어 `undefined`로 옴)에서도 레시피가 통째로 사라지지 않는다.
 * - `valid_from <= now`이면 공개(경계 시각 포함).
 * - 해석할 수 없는 문자열이면 숨김(fail-closed) — 예약한 레시피가 형식 오류로 조용히 먼저 공개되는
 *   사고를 막는다.
 * - 종료 시각은 없다. 레시피는 영구이고 내릴 때는 삭제한다.
 *
 * 공개 전 레시피는 일반 유저에게 없는 레시피와 같다(목록·검색·슬롯·보상 미리보기에서 빠지고,
 * 믹스 시도는 `recipe_not_found`).
 */

export interface RecipeReleaseInput {
  valid_from?: string | null
}

export type RecipeReleaseState = 'released' | 'scheduled'

export function isRecipeReleased(recipe: RecipeReleaseInput, now: Date = new Date()): boolean {
  const validFrom = recipe.valid_from
  if (validFrom === null || validFrom === undefined) return true
  const releaseAt = new Date(validFrom).getTime()
  if (Number.isNaN(releaseAt)) return false
  return releaseAt <= now.getTime()
}

/**
 * 레시피의 공개 상태 — `released`(공개됨) 또는 `scheduled`(공개 전, 예약 중).
 * 운영툴 목록·상태 읽기가 쓴다(티켓 20261001_1158·20260930_1500).
 */
export function recipeReleaseState(recipe: RecipeReleaseInput, now: Date = new Date()): RecipeReleaseState {
  return isRecipeReleased(recipe, now) ? 'released' : 'scheduled'
}

/** 공개된 레시피만 남긴다. 입력 배열은 바꾸지 않고 순서를 유지한다. */
export function filterReleasedRecipes<T extends RecipeReleaseInput>(recipes: T[], now: Date = new Date()): T[] {
  return recipes.filter((recipe) => isRecipeReleased(recipe, now))
}
