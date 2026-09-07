/**
 * 믹스 레시피(`combination_recipes` 테이블)를 가리키는 참조를 센다 (티켓 20260907_1138)
 *
 * ## 실제 스키마 재검증 결과 (2026-09-07)
 * `poi-references.ts`와 같은 근거(마이그레이션 전체 grep — `recipe_id` 컬럼, `REFERENCES
 * combination_recipes` 패턴 + `database.generated.ts`의 Relationships 블록 대조)로 재확인한
 * 결과, **`combination_recipes.id`를 참조하는 테이블은 하나도 없다.**
 *
 * `combination_recipes`는 `ingredient_badge_ids`·`result_badge_id`·
 * `required_activity_badge_id`로 **배지를 참조하는 방향**만 있고(이 방향은
 * `combination_recipes_result_badge_id_fkey` 등으로 `database.generated.ts`에 확인됨),
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
