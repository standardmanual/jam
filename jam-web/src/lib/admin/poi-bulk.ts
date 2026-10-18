/**
 * POI 일괄 처리 전용 순수 판정(티켓 20260924_0941) — 서버 API 라우트가 그대로 쓴다.
 */
import type { BulkSkip } from './bulk/shared'
import { EXACT_MATCH_RADIUS_BY_CATEGORY } from '@/lib/poi/radius-policy'
import { POI_REFERENCE_SOURCES, type PoiDeletionCandidate } from './poi-references'

export interface PoiCategoryPatch {
  category: string
  radius_meters?: number
}

/**
 * 카테고리 일괄 변경 patch를 만든다. 대상 카테고리에 정확 매칭 반경 정책이 있으면 그 값을
 * `radius_meters`에 함께 담아 모든 대상 POI에 동일하게 적용한다(단건 PATCH의
 * `resolvePoiRadiusMeters(category, existing.radius_meters)`가 정책이 있을 때 항상 그 값으로
 * 덮어쓰는 것과 같은 결과). 정책이 없으면 `radius_meters` 키 자체를 넣지 않는다 — `.update()`가
 * 그 컬럼을 건드리지 않아 POI마다 다른 기존 반경이 그대로 유지된다(정책이 없을 때
 * `resolvePoiRadiusMeters`가 기존 값을 그대로 돌려주는 것과 같은 결과).
 */
export function buildPoiCategoryPatch(category: string): PoiCategoryPatch {
  const exactRadius = EXACT_MATCH_RADIUS_BY_CATEGORY[category]
  return exactRadius !== undefined ? { category, radius_meters: exactRadius } : { category }
}

export interface PoiDeletionClassification {
  deletable: string[]
  skipped: BulkSkip[]
}

/**
 * 삭제 대상을 "삭제 가능"과 "건너뜀"으로 나눈다 — 참조가 하나라도 있거나(단건 DELETE와
 * 동일 기준, `PoiReferenceReport.total > 0`) 애초에 존재하지 않는 id는 건너뛴다. 건너뜀
 * 사유 문구는 단건 DELETE(`api/admin/poi/[id]/route.ts`)의 409 응답과 같은 형식이다.
 */
export function classifyPoiDeletion(
  ids: string[],
  candidates: Map<string, PoiDeletionCandidate>
): PoiDeletionClassification {
  const deletable: string[] = []
  const skipped: BulkSkip[] = []

  for (const id of ids) {
    const candidate = candidates.get(id)
    if (!candidate) {
      skipped.push({ id, reason: '장소를 찾을 수 없습니다.' })
      continue
    }

    if (candidate.total > 0) {
      const hitLabels = POI_REFERENCE_SOURCES.filter((s) => candidate.counts[s.key] > 0)
        .map((s) => `${s.label} ${candidate.counts[s.key]}건`)
        .join(', ')
      skipped.push({
        id,
        label: candidate.name ?? undefined,
        reason: `이미 ${candidate.total}건의 드랍·체크인·조회 이력이 있는 장소입니다(${hitLabels}). 비활성화를 이용해주세요.`,
      })
      continue
    }

    deletable.push(id)
  }

  return { deletable, skipped }
}
