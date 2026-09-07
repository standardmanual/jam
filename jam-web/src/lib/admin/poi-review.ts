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

/**
 * 승인 — pending_review 해제. targetCategory가 주어지면 배정 카테고리도 함께 바꾼다
 * ("카테고리 변경 후 승인"). 노출(is_active)은 건드리지 않는다 — 검토 대기 중에도 이미
 * 노출되고 있었으므로 승인은 그 상태를 그대로 확정할 뿐이다.
 */
export async function approvePendingPois(
  service: ServiceClient,
  ids: string[],
  targetCategory?: string
): Promise<ActionResult> {
  const updatePayload: { pending_review: boolean; category?: string } = { pending_review: false }
  if (targetCategory) updatePayload.category = targetCategory

  const table = service.from('poi') as unknown as PoiUpdateWithGateColumns
  const { data, error } = await table.update(updatePayload).in('id', ids).select('id')
  if (error) return { updatedIds: [], error: error.message }
  return { updatedIds: (data ?? []).map((row) => row.id), error: null }
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
