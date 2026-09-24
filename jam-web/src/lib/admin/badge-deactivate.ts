/**
 * 배지 비활성화(소프트 삭제) 부수효과(티켓 20260924_0944) — 단건 PATCH
 * (`api/admin/badges/[id]/route.ts`)와 목록 일괄 처리(`api/admin/badges/list-bulk/route.ts`)가
 * 같은 함수를 쓴다. `deleted_at` 자체를 바꾸는 것은 호출부의 책임이고, 이 함수는 그 뒤에
 * 따라오는 두 부수효과만 담당한다: 아직 줍지 않은 월드 드랍 무효화, 믹스 레시피에 남은 참조
 * 경고 로그. 둘 다 실패해도 비활성화 요청 자체를 실패시키지 않는다(호출부 로직은
 * `api/admin/badges/[id]/route.ts` PATCH 핸들러에서 그대로 옮겨왔다).
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { invalidateUnclaimedDrops } from './poi-drops'
import { countRecipesReferencingBadge } from './recipe-references'

type ServiceClient = ReturnType<typeof createServiceClient>

/** 레시피 참조 조회(배지당 2쿼리)의 동시 실행 폭 — 일괄 처리에서 badgeIds가 커져도 순차
 *  실행으로 시간이 선형으로 늘지 않게 묶어서 낸다(`badge-references.ts`의 CHUNK_CONCURRENCY,
 *  옛 `bulk-delete/route.ts`의 REFERENCE_CHECK_CONCURRENCY와 같은 이유). */
const RECIPE_CHECK_CONCURRENCY = 5

async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const current = cursor++
      await fn(items[current])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

/**
 * 비활성화된 배지 id 목록에 부수효과를 실행한다. `caller`는 로그 식별용 문자열이다
 * (예: `'admin badges PATCH'`, `'admin badges list-bulk deactivate'`).
 */
export async function runBadgeDeactivationSideEffects(
  supabase: ServiceClient,
  badgeIds: string[],
  caller: string
): Promise<void> {
  await invalidateUnclaimedDrops(supabase, badgeIds, caller)

  // 20260910_1515: 소프트 삭제된 배지가 믹스 레시피의 재료·보상으로 여전히 지정돼 있으면
  // 유저가 그 레시피를 성공시켰을 때 재료만 소각되고 빈손이 되는 사고로 이어진다. 차단하지는
  // 않는다(가역적 토글이라는 기존 성격 유지) — 운영이 탐지할 수 있게 경고 로그만 남긴다.
  await mapWithConcurrency(badgeIds, RECIPE_CHECK_CONCURRENCY, async (badgeId) => {
    const recipeReferences = await countRecipesReferencingBadge(supabase, badgeId)
    if (recipeReferences.error) {
      console.error(`[${caller}] 레시피 참조 조회 실패 — 소프트 삭제는 진행됨:`, recipeReferences.error, { badgeId })
    } else if (recipeReferences.total > 0) {
      console.warn(`[${caller}] 소프트 삭제된 배지가 믹스 레시피에서 여전히 참조되고 있음:`, {
        badgeId,
        slotRecipeIds: recipeReferences.slotRecipeIds,
        rewardRecipeIds: recipeReferences.rewardRecipeIds,
      })
    }
  })
}
