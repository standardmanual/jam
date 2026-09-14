/**
 * 믹스 레시피(`combination_recipes` 테이블)를 가리키는 참조를 센다 (티켓 20260907_1138)
 *
 * ## 실제 스키마 재검증 결과 (2026-09-07)
 * `poi-references.ts`와 같은 근거(마이그레이션 전체 grep — `recipe_id` 컬럼, `REFERENCES
 * combination_recipes` 패턴 + `database.generated.ts`의 Relationships 블록 대조)로 재확인한
 * 결과, **`combination_recipes.id`를 참조하는 테이블은 하나도 없다.**
 *
 * `combination_recipes`는 `ingredient_badge_ids`·`required_badge_ids`·`reward_badge_ids`로
 * **배지를 참조하는 방향**만 있고(마이그레이션 153에서 세 컬럼 모두 uuid[] 배열이 됐다),
 * 반대로 레시피 행을 가리키는 인바운드 FK나 uuid[] 참조는 존재하지 않는다.
 *
 * 그래서 이 파일은 `badge-references.ts`/`poi-references.ts`와 **같은 계약**
 * (`collect*References` → `blockingTotal`/`cascadeTotal`/`total`/`error`)을 유지하되,
 * 소스 목록이 **비어 있다** — 항상 "참조 없음" 경로를 탄다(티켓 20260907_1138 구현 계획
 * "가드 유틸은 만들되 참조 없음 경로만 타는 것도 정상"에 따른 결정).
 *
 * ⚠️ 향후 `combination_recipes.id`를 가리키는 인바운드 FK/참조 컬럼이 새로 추가되면
 * `RECIPE_REFERENCE_SOURCES`에 그 소스를 추가하고 `collectRecipeReferences` 안의
 * 카운터 목록도 함께 늘려야 한다 — 이 파일이 그 시점의 단일 출처가 된다.
 */
import type { createServiceClient } from '@/lib/supabase/server'

type ServiceClient = ReturnType<typeof createServiceClient>

export type RecipeReferenceKey = never

export interface RecipeReferenceSource {
  key: RecipeReferenceKey
  label: string
  location: string
  blocksDelete: boolean
  cascades: boolean
}

/** 실제 스키마 재검증 결과 — 인바운드 참조 없음(파일 상단 주석 참고). */
export const RECIPE_REFERENCE_SOURCES: RecipeReferenceSource[] = []

export interface RecipeReferenceReport {
  blockingTotal: number
  cascadeTotal: number
  total: number
  error: string | null
}

/**
 * 대상 레시피 집합을 가리키는 참조를 전부 센다. **아무것도 쓰지 않는다.**
 *
 * 현재는 `RECIPE_REFERENCE_SOURCES`가 비어 있어 즉시 0건을 반환한다 — 재검증 결과
 * `combination_recipes.id`를 가리키는 인바운드 참조가 없기 때문이다. `supabase` 인자는
 * 향후 소스가 추가될 때 즉시 querying이 가능하도록 시그니처를 `badge-references.ts`·
 * `poi-references.ts`와 맞춰 둔 것이다.
 */
export async function collectRecipeReferences(
  supabase: ServiceClient,
  recipeIds: string[]
): Promise<RecipeReferenceReport> {
  // 현재는 소스가 없어 인자를 쓰지 않는다 — 시그니처는 `badge-references.ts`·
  // `poi-references.ts`와 맞춰 향후 소스가 추가될 때 그대로 querying에 쓸 수 있게 둔다.
  void supabase
  void recipeIds
  return { blockingTotal: 0, cascadeTotal: 0, total: 0, error: null }
}

export interface BadgeInRecipeReferenceReport {
  /** 이 배지를 재료로 쓰는 레시피 id */
  ingredientRecipeIds: string[]
  /** 이 배지를 보상으로 주는 레시피 id */
  rewardRecipeIds: string[]
  total: number
  error: string | null
}

/**
 * 배지 하나가 레시피의 `ingredient_badge_ids`·`reward_badge_ids`(둘 다 uuid[])에 남아 있는
 * 레시피 수를 센다 (티켓 20260910_1515).
 *
 * `combination_recipes`가 레시피 행을 참조하는 인바운드 참조는 없지만(파일 상단 주석),
 * **반대 방향**(레시피가 배지를 참조하는 방향)은 배열 컬럼이라 FK가 걸리지 않는다. 그래서
 * 소프트 삭제(`badges` PATCH)가 이 참조를 막지는 않되, 운영이 탐지할 수 있도록 경고만
 * 남긴다 — `badge-references.ts`가 하드 삭제 차단용으로 이미 세는 것과 같은 컬럼을 보되,
 * 목적은 «차단»이 아니라 «소프트 삭제 시 경고»다.
 *
 * 배열 컬럼 매칭은 PostgREST `.overlaps()`(Postgres `&&` 연산자)로 센다 — 전체 레시피를
 * 메모리로 끌어와 필터링하지 않는다.
 */
export async function countRecipesReferencingBadge(
  supabase: ServiceClient,
  badgeId: string
): Promise<BadgeInRecipeReferenceReport> {
  const [ingredientResult, rewardResult] = await Promise.all([
    supabase.from('combination_recipes').select('id').overlaps('ingredient_badge_ids', [badgeId]),
    supabase.from('combination_recipes').select('id').overlaps('reward_badge_ids', [badgeId]),
  ])

  if (ingredientResult.error || rewardResult.error) {
    return {
      ingredientRecipeIds: [],
      rewardRecipeIds: [],
      total: 0,
      error: (ingredientResult.error ?? rewardResult.error)?.message ?? '알 수 없는 오류',
    }
  }

  const ingredientRecipeIds = ((ingredientResult.data ?? []) as { id: string }[]).map((r) => r.id)
  const rewardRecipeIds = ((rewardResult.data ?? []) as { id: string }[]).map((r) => r.id)

  return {
    ingredientRecipeIds,
    rewardRecipeIds,
    total: ingredientRecipeIds.length + rewardRecipeIds.length,
    error: null,
  }
}
