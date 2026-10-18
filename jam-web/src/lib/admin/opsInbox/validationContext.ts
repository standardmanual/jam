/**
 * 운영 묶음 검증이 밖에서 받는 재료를 한 번에 읽는다 (티켓 20261007_1745).
 *
 * 검증 함수(`validate.ts`)는 순수 함수라 DB를 부르지 않는다. 제출 라우트(`route.ts`)와 직접 수정(`decide.ts`)이 이 함수로 트라이브·
 * 패턴 사전 번호·지점 카테고리 목록을 읽어 `ctx`로 넘긴다. 두 곳이 같은 목록·같은 규칙으로 판정해야 하므로 조회는 이 한 곳에만 둔다.
 * 하나라도 조회가 실패하면 예외를 던진다 — 부르는 쪽이 저장하지 않고 500으로 돌려준다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { loadOpsPatternNos } from '@/lib/admin/opsPatterns/read'
import { loadTribeIds } from '@/lib/admin/opsInbox/tribes'
import type { OpsValidationContext } from '@/lib/admin/opsInbox/validate'

type ServiceClient = ReturnType<typeof createServiceClient>

/** `poi_categories`에 있는 지점 카테고리 slug 전체. 조회가 실패하면 예외를 던진다. */
export async function loadPoiCategorySlugs(service: ServiceClient): Promise<Set<string>> {
  const { data, error } = await service.from('poi_categories').select('slug')
  if (error) throw new Error(`장소 카테고리 목록 조회 실패: ${error.message}`)
  return new Set((data ?? []).map((row) => row.slug))
}

export async function loadOpsValidationContext(service: ServiceClient): Promise<Required<OpsValidationContext>> {
  const [tribeIds, patternNos, poiCategorySlugs] = await Promise.all([
    loadTribeIds(service),
    loadOpsPatternNos(service),
    loadPoiCategorySlugs(service),
  ])
  return { tribeIds, patternNos, poiCategorySlugs }
}
