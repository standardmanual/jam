/**
 * 믹스 레시피 공개 판정 — 믹스 화면과 믹스 시도가 공유하는 단일 규칙 (티켓 20261001_1157, 종료 시각 20261002_0710)
 *
 * 순수 함수만 둔다(Supabase·React 의존 없음). `/combine` 서버 렌더와 `combineRecipeAttempt()`가
 * 반드시 이 파일을 거쳐 판정하게 해서 화면과 서버가 서로 다른 규칙을 쓰지 않게 한다
 * (`lib/missions/visibility.ts`의 `isMissionExposed` 선례).
 *
 * ## 판정 규칙
 *
 * 공개 기간은 `valid_from <= now < valid_until`이다(공개 시각 포함, 종료 시각 제외).
 *
 * - `valid_from`이 `null`/`undefined`이면 공개 — 지금까지 모든 레시피의 동작이고, 마이그레이션 204가
 *   아직 적용되지 않은 환경(칸이 없어 `undefined`로 옴)에서도 레시피가 통째로 사라지지 않는다.
 * - `valid_from <= now`이면 공개 시각이 지난 것이다(경계 시각 포함).
 * - `valid_from`을 해석할 수 없는 문자열이면 숨김(fail-closed, `scheduled`) — 예약한 레시피가 형식 오류로
 *   조용히 먼저 공개되는 사고를 막는다.
 * - `valid_until`이 `null`/`undefined`이면 종료 없음(상시) — 기존 레시피 전체의 동작이고, 마이그레이션 213이
 *   아직 적용되지 않은 환경에서도 레시피가 통째로 사라지지 않는다.
 * - `valid_until <= now`이면 종료(`ended`) — 종료 시각 그 순간부터 끝이다.
 * - `valid_until`을 해석할 수 없는 문자열이면 종료로 본다(fail-closed, `ended`).
 * - 공개 시각 전이면 종료 시각이 어떻든 `scheduled`가 앞선다(DB CHECK가 둘의 순서를 지키므로 실제로는 겹치지 않는다).
 *
 * 공개 전·종료된 레시피는 일반 유저에게 없는 레시피와 같다(목록·검색·슬롯·보상 미리보기에서 빠지고,
 * 믹스 시도는 `recipe_not_found`). 이미 받은 보상은 그대로 둔다. 운영자의 공개 전 미리보기·시험 믹스는
 * `scheduled`만 대상이고 `ended`는 운영자에게도 없는 레시피다(티켓 20261002_0710 G7).
 */

export interface RecipeReleaseInput {
  valid_from?: string | null
  valid_until?: string | null
}

export type RecipeReleaseState = 'released' | 'scheduled' | 'ended'

/**
 * 레시피의 공개 상태 — `released`(공개 중), `scheduled`(공개 전, 예약 중), `ended`(종료됨).
 * 운영툴 목록·상태 읽기와 어드민 목록이 쓴다(티켓 20261001_1158·20260930_1500·20261002_0710).
 */
export function recipeReleaseState(recipe: RecipeReleaseInput, now: Date = new Date()): RecipeReleaseState {
  const nowMs = now.getTime()

  const validFrom = recipe.valid_from
  if (validFrom !== null && validFrom !== undefined) {
    const releaseAt = new Date(validFrom).getTime()
    if (Number.isNaN(releaseAt) || releaseAt > nowMs) return 'scheduled'
  }

  const validUntil = recipe.valid_until
  if (validUntil !== null && validUntil !== undefined) {
    const endAt = new Date(validUntil).getTime()
    if (Number.isNaN(endAt) || endAt <= nowMs) return 'ended'
  }

  return 'released'
}

export function isRecipeReleased(recipe: RecipeReleaseInput, now: Date = new Date()): boolean {
  return recipeReleaseState(recipe, now) === 'released'
}

/** 공개 중인 레시피만 남긴다(공개 전·종료된 레시피는 뺀다). 입력 배열은 바꾸지 않고 순서를 유지한다. */
export function filterReleasedRecipes<T extends RecipeReleaseInput>(recipes: T[], now: Date = new Date()): T[] {
  return recipes.filter((recipe) => isRecipeReleased(recipe, now))
}
