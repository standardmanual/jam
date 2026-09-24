/**
 * 믹스 레시피 일괄 처리 전용 순수 판정(티켓 20260924_0949) — 서버 API 라우트가 그대로 쓴다.
 * `poi-bulk.ts`의 `classifyPoiDeletion`과 같은 형태다.
 */
import type { BulkSkip } from './bulk/shared'

export interface RecipeDeletionCandidate {
  id: string
  name: string | null
  /** 이 레시피를 가리키는 참조 수 — 하나라도 있으면 삭제를 막는다 */
  total: number
}

export interface RecipeDeletionClassification {
  deletable: string[]
  skipped: BulkSkip[]
}

/**
 * 삭제 대상을 "삭제 가능"과 "건너뜀"으로 나눈다 — 존재하지 않는 id와 참조가 하나라도 있는
 * 레시피는 건너뛴다. 참조 사유 문구는 단건 DELETE(`api/admin/recipes/[id]/route.ts`)의
 * 409 응답과 같은 형식이다.
 */
export function classifyRecipeDeletion(
  ids: string[],
  candidates: Map<string, RecipeDeletionCandidate>
): RecipeDeletionClassification {
  const deletable: string[] = []
  const skipped: BulkSkip[] = []

  for (const id of ids) {
    const candidate = candidates.get(id)
    if (!candidate) {
      skipped.push({ id, reason: '레시피를 찾을 수 없습니다.' })
      continue
    }
    if (candidate.total > 0) {
      skipped.push({
        id,
        label: candidate.name ?? undefined,
        reason: `삭제할 수 없습니다. 이 레시피를 가리키는 참조가 ${candidate.total}건 있습니다.`,
      })
      continue
    }
    deletable.push(id)
  }

  return { deletable, skipped }
}
