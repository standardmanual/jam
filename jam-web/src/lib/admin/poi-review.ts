/**
 * POI 검토 큐 승인/거부 공용 로직 (티켓 20260907_1242)
 *
 * `/admin/poi/review`의 단건 액션(`api/admin/poi/review/[id]`)과 다중선택 일괄 액션
 * (`api/admin/poi/review/bulk`)이 이 두 함수를 공유한다 — 승인/거부 판정 규칙이 두 곳에서
 * 따로 구현되어 어긋나는 일을 막는다(reference-guards.ts와 동일한 이유의 공유 패턴).
 */
import type { createServiceClient } from '@/lib/supabase/server'

type ServiceClient = ReturnType<typeof createServiceClient>

/** 거부된 POI를 삭제 대신 이관해 보관하는 홀딩 카테고리 (마이그레이션 143 시드) */
export const UNASSIGNED_POI_CATEGORY_SLUG = 'unassigned'

interface ActionResult {
  updatedIds: string[]
  error: string | null
}

interface PostgrestFailure {
  message: string
}

/**
 * pending_review는 마이그레이션 143에서 막 추가된 컬럼이라 생성 타입(database.generated.ts)에
 * 아직 없다 — db:types CLI 부재로 재생성 불가(티켓 20260907_1242 완료 보고 참고). `.update()`의
 * 초과 속성 검사가 이 컬럼을 알 수 없는 키로 보고 막으므로, 이 함수가 실제로 쓰는 세 컬럼만
 * 포함한 최소 인터페이스로 빌더를 좁게 캐스팅한다(`lib/engine-log/index.ts`와 동일 기법) —
 * 전체를 `as any`로 덮지 않는다.
 */
interface PoiUpdateWithGateColumns {
  update: (values: { pending_review?: boolean; category?: string; is_active?: boolean }) => {
    in: (column: string, values: string[]) => {
      select: (columns: string) => PromiseLike<{ data: { id: string }[] | null; error: PostgrestFailure | null }>
    }
  }
}

interface PoiSelectCategoryRow {
  id: string
  category: string
}

interface PoiCategoryDisplayRow {
  slug: string
  display_on_map: boolean | null
}

/**
 * 승인 — pending_review 해제. targetCategory가 주어지면 배정 카테고리도 함께 바꾼다
 * ("카테고리 변경 후 승인").
 *
 * 20260911_1343: 노출(is_active)도 함께 확정한다. 자동수집 저장 시점(`api/drops/route.ts`
 * `searchAndPersistCategories`)에서 이번 수정으로 pending_review=true인 행은 무조건
 * is_active=false로 저장되도록 바뀌었다 — 승인이 이 상태를 그대로 두면 승인해도 계속
 * 비노출로 남는 역방향 문제가 생긴다. 그래서 승인 시 배정될 카테고리(targetCategory 우선,
 * 없으면 기존 category)의 `poi_categories.display_on_map`을 조회해 true면 is_active=true로
 * 함께 올려준다(false면 그 카테고리는 원래도 비노출 정책이므로 false 유지).
 */
export async function approvePendingPois(
  service: ServiceClient,
  ids: string[],
  targetCategory?: string
): Promise<ActionResult> {
  // 승인될 각 행의 최종 카테고리(targetCategory가 없으면 기존 category)를 먼저 파악해야
  // display_on_map을 조회할 수 있다.
  let categoriesToCheck: string[]
  let categoryByIdFallback = new Map<string, string>()
  if (targetCategory) {
    categoriesToCheck = [targetCategory]
  } else {
    const { data: rows } = await service.from('poi').select('id, category').in('id', ids)
    const existingRows = (rows ?? []) as PoiSelectCategoryRow[]
    categoryByIdFallback = new Map(existingRows.map((row) => [row.id, row.category]))
    categoriesToCheck = Array.from(new Set(existingRows.map((row) => row.category)))
  }

  const { data: categoryRows } = await service
    .from('poi_categories')
    .select('slug, display_on_map')
    .in('slug', categoriesToCheck)
  const displayOnMapBySlug = new Map(
    ((categoryRows ?? []) as unknown as PoiCategoryDisplayRow[]).map((row) => [row.slug, row.display_on_map ?? true])
  )

  const table = service.from('poi') as unknown as PoiUpdateWithGateColumns

  if (targetCategory) {
    const isActive = displayOnMapBySlug.get(targetCategory) ?? true
    const { data, error } = await table
      .update({ pending_review: false, category: targetCategory, is_active: isActive })
      .in('id', ids)
      .select('id')
    if (error) return { updatedIds: [], error: error.message }
    return { updatedIds: (data ?? []).map((row) => row.id), error: null }
  }

  // targetCategory가 없으면 행마다 기존 category가 다를 수 있어 is_active 값도 갈릴 수
  // 있다 — display_on_map 값별로 id를 묶어 각각 update한다.
  const idsByIsActive = new Map<boolean, string[]>()
  for (const id of ids) {
    const category = categoryByIdFallback.get(id)
    const isActive = category !== undefined ? (displayOnMapBySlug.get(category) ?? true) : true
    idsByIsActive.set(isActive, [...(idsByIsActive.get(isActive) ?? []), id])
  }

  const updatedIds: string[] = []
  for (const [isActive, groupIds] of idsByIsActive) {
    const { data, error } = await table
      .update({ pending_review: false, is_active: isActive })
      .in('id', groupIds)
      .select('id')
    if (error) return { updatedIds: [], error: error.message }
    updatedIds.push(...(data ?? []).map((row) => row.id))
  }
  return { updatedIds, error: null }
}

/**
 * 거부 — 삭제하지 않고 unassigned 카테고리로 이관해 보관한다(판정 기준 보정용 재현 데이터로
 * 재사용, 티켓 요구사항). unassigned는 지도에 노출할 실제 카테고리가 아니므로 is_active도
 * 함께 false로 내려 사용자 노출을 막는다.
 */
export async function rejectPendingPois(service: ServiceClient, ids: string[]): Promise<ActionResult> {
  const updatePayload = {
    category: UNASSIGNED_POI_CATEGORY_SLUG,
    is_active: false,
    pending_review: false,
  }

  const table = service.from('poi') as unknown as PoiUpdateWithGateColumns
  const { data, error } = await table.update(updatePayload).in('id', ids).select('id')
  if (error) return { updatedIds: [], error: error.message }
  return { updatedIds: (data ?? []).map((row) => row.id), error: null }
}
