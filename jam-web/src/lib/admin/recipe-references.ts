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
 * 투데이 카드의 레시피 칸 `today_cards.recipe_id`(마이그레이션 217, 티켓 20261006_1218)는 `ON DELETE SET NULL`
 * FK다 — 레시피를 지우면 카드는 남고 레시피 줄만 빈다(미션·컬렉션·랭킹모드 칸과 같다). 그래서 어드민의 삭제를 막지
 * 않는다(`blocksDelete: false`, 건수는 `noticeTotal`로 알린다). 운영툴의 공개 전 취소만 이 건수로 막는다
 * (운영툴 밖 카드가 가리키면 409, `execute/recipe.ts`의 `cancel`, 운영툴 PRD §8.7).
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

export type RecipeReferenceKey = 'badges_recipe_first_success' | 'today_cards_recipe_id'

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
  {
    key: 'today_cards_recipe_id',
    label: '레시피 공개 카드',
    location: 'today_cards.recipe_id',
    blocksDelete: false,
    cascades: false,
  },
]

export interface RecipeReferenceReport {
  blockingTotal: number
  cascadeTotal: number
  /** 삭제를 막는 참조의 합(`blockingTotal + cascadeTotal`). 안내만 하는 참조(`noticeTotal`)는 들어 있지 않다 — 호출부가 `total > 0`으로 삭제를 막는다. */
  total: number
  /** 삭제를 막지 않고 지우면 칸만 비는 참조(`blocksDelete: false`)의 합 — 지금은 레시피 공개 카드 수다. */
  noticeTotal: number
  error: string | null
}

/**
 * `badges` 조건 JSON에서 레시피 id를 꺼내는 PostgREST 두 단계 경로(`->` 다음 `->>`). 같은 모양의
 * `.in()` 조회가 라이브에서 SQL 집계와 같은 건수를 돌려주는 것을 확인했다(2026-10-01, 티켓 20261001_1200).
 */
const BADGE_RECIPE_ID_PATH = 'condition_json->recipe_first_success->>recipe_id'

/** `.in()` 한 번에 넣는 id 개수. 80 × uuid 37자 ≈ 3KB — URL 상한에 여유가 있다 */
const REFERENCE_CHUNK = 80

/**
 * 대상 레시피 집합을 가리키는 참조를 전부 센다. **아무것도 쓰지 않는다.**
 *
 * 삭제되지 않은 배지 중 `recipe_first_success.recipe_id`가 대상 집합에 드는 것(삭제를 막는다)과,
 * `recipe_id`가 대상 집합에 드는 투데이 카드(삭제를 막지 않는다, `noticeTotal`)를 센다.
 * 조회가 하나라도 실패하면 부분 카운트로 «참조 0건»이라 판정하지 않도록 `error`를 채워
 * 돌려준다 — 호출부는 삭제를 막는다(fail-closed).
 */
export async function collectRecipeReferences(
  supabase: ServiceClient,
  recipeIds: string[]
): Promise<RecipeReferenceReport> {
  // 배지 조건의 recipe_id는 text로 비교되므로, 주소로 들어온 대문자 uuid도 소문자로 맞춰 센다.
  const ids = recipeIds.map((id) => id.toLowerCase())
  let badgeCount = 0
  let cardCount = 0
  for (let i = 0; i < ids.length; i += REFERENCE_CHUNK) {
    const chunk = ids.slice(i, i + REFERENCE_CHUNK)
    const [badges, cards] = await Promise.all([
      supabase.from('badges').select('id', { count: 'exact', head: true }).is('deleted_at', null).in(BADGE_RECIPE_ID_PATH, chunk),
      supabase.from('today_cards').select('id', { count: 'exact', head: true }).in('recipe_id', chunk),
    ])
    const failed = badges.error ?? cards.error
    if (failed) {
      return { blockingTotal: 0, cascadeTotal: 0, total: 0, noticeTotal: 0, error: failed.message }
    }
    badgeCount += badges.count ?? 0
    cardCount += cards.count ?? 0
  }
  return { blockingTotal: badgeCount, cascadeTotal: 0, total: badgeCount, noticeTotal: cardCount, error: null }
}

export interface RecipeDeletionLookupCandidate extends RecipeDeletionCandidate {
  /**
   * 이 레시피를 가리키는 안내용 참조 수(홈 카드, `noticeTotal`). 막는 참조가 있어 한 건씩 다시 센 경우에만
   * 채운다 — 전체를 한 번에 센 경우는 레시피별로 나눌 수 없어 0이고, `RecipeDeletionLookup.allNoticeTotal`을 쓴다.
   */
  noticeTotal: number
}

export interface RecipeDeletionLookup {
  candidates: Map<string, RecipeDeletionLookupCandidate>
  /**
   * 찾은 레시피 전체를 한 번에 센 안내용 참조 수. 막는 참조가 0건이라 전원이 삭제 대상일 때만 값이 있다
   * (이때 삭제 대상 = 찾은 전체라 호출부가 그대로 쓴다). 막힌 레시피가 있으면 `null`이고 호출부는
   * 후보별 `noticeTotal`에서 삭제 대상만 더한다(티켓 20261006_1406).
   */
  allNoticeTotal: number | null
  error: string | null
}

const LOOKUP_CHUNK = 200

/**
 * 일괄 삭제용 — 레시피 id마다 이름과 참조 수를 조회한다(티켓 20260924_0949). 존재하지 않는
 * id는 결과에 없다. 참조 판정은 단건 DELETE와 같은 `collectRecipeReferences` 하나만 쓴다:
 * 전체를 한 번에 세서 0건이면 그대로 통과, 0건이 아니면 어느 레시피가 막혔는지 가리도록
 * 한 건씩 다시 센다. 조회가 실패하면 `error`를 돌려주고 호출부는 삭제를 막는다(fail-closed).
 *
 * 홈 카드 수(`noticeTotal`)는 같은 조회에서 함께 돌려준다 — 미리보기가 카드 수를 세려고 참조를 한 번 더
 * 조회하지 않게 한다(티켓 20261006_1406).
 */
export async function collectRecipeDeletionCandidates(
  supabase: ServiceClient,
  recipeIds: string[]
): Promise<RecipeDeletionLookup> {
  const candidates = new Map<string, RecipeDeletionLookupCandidate>()
  if (recipeIds.length === 0) return { candidates, allNoticeTotal: null, error: null }

  for (let i = 0; i < recipeIds.length; i += LOOKUP_CHUNK) {
    const { data, error } = await supabase
      .from('combination_recipes')
      .select('id, name')
      .in('id', recipeIds.slice(i, i + LOOKUP_CHUNK))
    if (error) return { candidates, allNoticeTotal: null, error: error.message }
    for (const row of (data ?? []) as { id: string; name: string | null }[]) {
      candidates.set(row.id, { id: row.id, name: row.name, total: 0, noticeTotal: 0 })
    }
  }

  const foundIds = [...candidates.keys()]
  if (foundIds.length === 0) return { candidates, allNoticeTotal: null, error: null }

  const all = await collectRecipeReferences(supabase, foundIds)
  if (all.error) return { candidates, allNoticeTotal: null, error: all.error }
  if (all.total === 0) return { candidates, allNoticeTotal: all.noticeTotal, error: null }

  for (const id of foundIds) {
    const single = await collectRecipeReferences(supabase, [id])
    if (single.error) return { candidates, allNoticeTotal: null, error: single.error }
    const candidate = candidates.get(id)
    if (candidate) {
      candidate.total = single.total
      candidate.noticeTotal = single.noticeTotal
    }
  }
  return { candidates, allNoticeTotal: null, error: null }
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
 * 레시피 행을 가리키는 참조는 배지 조건과 투데이 카드의 `recipe_id`(마이그레이션 217) 둘이고(파일 상단 주석, `collectRecipeReferences`),
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
