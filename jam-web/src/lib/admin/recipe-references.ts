/**
 * 믹스 레시피(`combination_recipes` 테이블)를 가리키는 참조를 센다 (티켓 20260907_1138,
 * 배지 조건 참조는 티켓 20261001_1200)
 *
 * ## 실제 스키마 재검증 결과 (2026-09-07, 2026-10-01 갱신)
 * `poi-references.ts`와 같은 근거(마이그레이션 전체 grep — `recipe_id` 컬럼, `REFERENCES
 * combination_recipes` 패턴 + `database.generated.ts`의 Relationships 블록 대조)로 확인한
 * 결과, **`combination_recipes.id`를 FK로 참조하는 테이블은 하나도 없다.**
 *
 * `combination_recipes`는 `reward_badge_ids`로, `combination_recipe_slots`는
 * `allowed_badge_ids`로 **배지를 참조하는 방향**만 있다(마이그레이션 174, 티켓 20260917_1427
 * 에서 재료·보유 조건 배열이 슬롯 테이블로 이관됐다).
 *
 * 다만 **FK가 아닌 느슨한 참조가 하나 있다** — 배지 조건 `badges.condition_json.
 * recipe_first_success.recipe_id`(마이그레이션 199, 티켓 20261001_0631)다. 이 레시피를
 * 지우면 아무도 얻을 수 없는 JAM! 배지가 남으므로, 삭제되지 않은(`deleted_at IS NULL`) 배지
 * 중 이 값으로 레시피를 가리키는 것을 센다. 소스가 이것 하나뿐이라 `total`은 곧 «가리키는
 * 배지 수»이고, 삭제 거부 문구(`recipeDeleteBlockedMessage`)도 그 전제다 — 소스를 늘리면 문구도
 * 함께 고친다.
 *
 * `user_combine_success_logs.recipe_id`는 FK를 일부러 걸지 않았다(마이그레이션 200) —
 * 레시피를 지워도 유저의 성공 횟수·최초 성공 기록은 남아야 하므로 가드 대상이 아니다.
 *
 * 이 파일은 `badge-references.ts`/`poi-references.ts`와 **같은 계약**(`collect*References`
 * → `blockingTotal`/`cascadeTotal`/`total`/`error`)을 유지한다.
 *
 * ⚠️ 향후 `combination_recipes.id`를 가리키는 참조가 새로 추가되면 `RECIPE_REFERENCE_SOURCES`에
 * 그 소스를 추가하고 `collectRecipeReferences`의 카운터도 함께 늘려야 한다 — 이 파일이 그
 * 시점의 단일 출처가 된다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import type { RecipeDeletionCandidate } from './recipe-bulk'

type ServiceClient = ReturnType<typeof createServiceClient>

export type RecipeReferenceKey = 'badges_recipe_first_success'

export interface RecipeReferenceSource {
  key: RecipeReferenceKey
  label: string
  location: string
  blocksDelete: boolean
  cascades: boolean
}

export const RECIPE_REFERENCE_SOURCES: RecipeReferenceSource[] = [
  {
    key: 'badges_recipe_first_success',
    label: '레시피 최초 성공 배지',
    location: "badges.condition_json->'recipe_first_success'->>'recipe_id'",
    blocksDelete: true,
    cascades: false,
  },
]

export interface RecipeReferenceReport {
  blockingTotal: number
  cascadeTotal: number
  total: number
  error: string | null
}

/** `badges` 조건 JSON에서 레시피 id를 꺼내는 PostgREST 경로(`badge-list-query.ts`와 같은 표기) */
const BADGE_RECIPE_ID_PATH = 'condition_json->recipe_first_success->>recipe_id'

/** `.in()` 한 번에 넣는 id 개수. 80 × uuid 37자 ≈ 3KB — URL 상한에 여유가 있다 */
const REFERENCE_CHUNK = 80

/**
 * 대상 레시피 집합을 가리키는 참조를 전부 센다. **아무것도 쓰지 않는다.**
 *
 * 삭제되지 않은 배지 중 `recipe_first_success.recipe_id`가 대상 집합에 드는 것을 센다.
 * 조회가 하나라도 실패하면 부분 카운트로 «참조 0건»이라 판정하지 않도록 `error`를 채워
 * 돌려준다 — 호출부는 삭제를 막는다(fail-closed).
 */
export async function collectRecipeReferences(
  supabase: ServiceClient,
  recipeIds: string[]
): Promise<RecipeReferenceReport> {
  let badgeCount = 0
  for (let i = 0; i < recipeIds.length; i += REFERENCE_CHUNK) {
    const { count, error } = await supabase
      .from('badges')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .in(BADGE_RECIPE_ID_PATH, recipeIds.slice(i, i + REFERENCE_CHUNK))
    if (error) {
      return { blockingTotal: 0, cascadeTotal: 0, total: 0, error: error.message }
    }
    badgeCount += count ?? 0
  }
  return { blockingTotal: badgeCount, cascadeTotal: 0, total: badgeCount, error: null }
}

export interface RecipeDeletionLookup {
  candidates: Map<string, RecipeDeletionCandidate>
  error: string | null
}

const LOOKUP_CHUNK = 200

/**
 * 일괄 삭제용 — 레시피 id마다 이름과 참조 수를 조회한다(티켓 20260924_0949). 존재하지 않는
 * id는 결과에 없다. 참조 판정은 단건 DELETE와 같은 `collectRecipeReferences` 하나만 쓴다:
 * 전체를 한 번에 세서 0건이면 그대로 통과, 0건이 아니면 어느 레시피가 막혔는지 가리도록
 * 한 건씩 다시 센다. 조회가 실패하면 `error`를 돌려주고 호출부는 삭제를 막는다(fail-closed).
 */
export async function collectRecipeDeletionCandidates(
  supabase: ServiceClient,
  recipeIds: string[]
): Promise<RecipeDeletionLookup> {
  const candidates = new Map<string, RecipeDeletionCandidate>()
  if (recipeIds.length === 0) return { candidates, error: null }

  for (let i = 0; i < recipeIds.length; i += LOOKUP_CHUNK) {
    const { data, error } = await supabase
      .from('combination_recipes')
      .select('id, name')
      .in('id', recipeIds.slice(i, i + LOOKUP_CHUNK))
    if (error) return { candidates, error: error.message }
    for (const row of (data ?? []) as { id: string; name: string | null }[]) {
      candidates.set(row.id, { id: row.id, name: row.name, total: 0 })
    }
  }

  const foundIds = [...candidates.keys()]
  if (foundIds.length === 0) return { candidates, error: null }

  const all = await collectRecipeReferences(supabase, foundIds)
  if (all.error) return { candidates, error: all.error }
  if (all.total === 0) return { candidates, error: null }

  for (const id of foundIds) {
    const single = await collectRecipeReferences(supabase, [id])
    if (single.error) return { candidates, error: single.error }
    const candidate = candidates.get(id)
    if (candidate) candidate.total = single.total
  }
  return { candidates, error: null }
}

export interface BadgeInRecipeReferenceReport {
  /** 이 배지를 슬롯 후보(재료·보유 조건)로 쓰는 레시피 id */
  slotRecipeIds: string[]
  /** 이 배지를 보상으로 주는 레시피 id */
  rewardRecipeIds: string[]
  total: number
  error: string | null
}

/**
 * 배지 하나가 `combination_recipe_slots.allowed_badge_ids` 또는 `combination_recipes.
 * reward_badge_ids`(둘 다 uuid[])에 남아 있는 레시피 수를 센다 (티켓 20260910_1515,
 * 슬롯 이관은 티켓 20260917_1427).
 *
 * `combination_recipes`가 레시피 행을 참조하는 인바운드 참조는 없지만(파일 상단 주석),
 * **반대 방향**(레시피/슬롯이 배지를 참조하는 방향)은 배열 컬럼이라 FK가 걸리지 않는다.
 * 그래서 소프트 삭제(`badges` PATCH)가 이 참조를 막지는 않되, 운영이 탐지할 수 있도록
 * 경고만 남긴다 — `badge-references.ts`가 하드 삭제 차단용으로 이미 세는 것과 같은 컬럼을
 * 보되, 목적은 «차단»이 아니라 «소프트 삭제 시 경고»다.
 *
 * 배열 컬럼 매칭은 PostgREST `.overlaps()`(Postgres `&&` 연산자)로 센다 — 전체 레시피를
 * 메모리로 끌어와 필터링하지 않는다.
 */
export async function countRecipesReferencingBadge(
  supabase: ServiceClient,
  badgeId: string
): Promise<BadgeInRecipeReferenceReport> {
  const [slotResult, rewardResult] = await Promise.all([
    supabase.from('combination_recipe_slots').select('recipe_id').overlaps('allowed_badge_ids', [badgeId]),
    supabase.from('combination_recipes').select('id').overlaps('reward_badge_ids', [badgeId]),
  ])

  if (slotResult.error || rewardResult.error) {
    return {
      slotRecipeIds: [],
      rewardRecipeIds: [],
      total: 0,
      error: (slotResult.error ?? rewardResult.error)?.message ?? '알 수 없는 오류',
    }
  }

  const slotRecipeIds = [
    ...new Set(((slotResult.data ?? []) as { recipe_id: string }[]).map((r) => r.recipe_id)),
  ]
  const rewardRecipeIds = ((rewardResult.data ?? []) as { id: string }[]).map((r) => r.id)

  return {
    slotRecipeIds,
    rewardRecipeIds,
    total: slotRecipeIds.length + rewardRecipeIds.length,
    error: null,
  }
}
