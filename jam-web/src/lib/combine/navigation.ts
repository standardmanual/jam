/**
 * 믹스 화면(`/combine`)의 화면 전환을 주소에 싣는 규칙 — 레시피 상세와 등급 올리기의 개별 URL (티켓 20261110_1215)
 *
 * 판정은 순수 함수로 두고(React·Next 의존 없음), 화면 상태의 단일 원천은 주소의 쿼리다.
 *
 * - 레시피 상세: `/combine?recipe=<레시피ID>`
 * - 등급 올리기: `/combine?view=tier-up`
 * - 둘이 같이 있으면 `view=tier-up`이 이긴다.
 * - 공개 목록에 없는 레시피 ID(종료·공개 전 포함)와 알 수 없는 값은 목록 화면으로 보내고 주소를 `/combine`으로 정리한다.
 */

export const COMBINE_PATH = '/combine'
export const TIER_UP_VIEW = 'tier-up'

export type CombineView =
  | { kind: 'list'; recipeId: null; needsCleanup: boolean }
  | { kind: 'recipe'; recipeId: string; needsCleanup: false }
  | { kind: 'tierUp'; recipeId: null; needsCleanup: false }

/** 주소의 쿼리에서 지금 보여 줄 화면을 정한다. `needsCleanup`이 true면 주소를 `/combine`으로 정리해야 한다. */
export function resolveCombineView(
  params: { recipe: string | null; view: string | null },
  knownRecipeIds: Iterable<string>,
): CombineView {
  if (params.view === TIER_UP_VIEW) return { kind: 'tierUp', recipeId: null, needsCleanup: false }
  if (params.recipe !== null && params.recipe !== '') {
    for (const id of knownRecipeIds) {
      if (id === params.recipe) return { kind: 'recipe', recipeId: id, needsCleanup: false }
    }
  }
  return { kind: 'list', recipeId: null, needsCleanup: params.recipe !== null || params.view !== null }
}

export function recipeHref(recipeId: string): string {
  return `${COMBINE_PATH}?recipe=${encodeURIComponent(recipeId)}`
}

export function tierUpHref(): string {
  return `${COMBINE_PATH}?view=${TIER_UP_VIEW}`
}

/** 레시피를 여는 방식 — 목록에서 열면 history를 쌓고(push), 이미 상세가 열려 있으면 쌓지 않는다(replace). */
export function recipeOpenMethod(currentRecipeId: string | null): 'push' | 'replace' {
  return currentRecipeId === null ? 'push' : 'replace'
}

/**
 * 닫기 방식 — 목록에서 push로 열었으면 앞 항목이 목록이므로 `back`, 링크·새로고침으로 바로 열려 앞 항목이 없거나
 * 다른 라우트일 수 있으면 `replace('/combine')`.
 */
export function closeAction(openedByPush: boolean): 'back' | 'replace' {
  return openedByPush ? 'back' : 'replace'
}

/**
 * «목록에서 push로 열었는가» 표시. 화면을 떠나면(언마운트) 지우고, 새로고침이면 모듈이 새로 뜨므로 저절로 false다.
 */
let openedByPush = false

export function markOpenedByPush(value: boolean): void {
  openedByPush = value
}

export function wasOpenedByPush(): boolean {
  return openedByPush
}
