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

/**
 * 레시피 삭제 거부 문구 — 단건 DELETE 409 응답과 일괄 삭제 건너뜀 사유가 같은 문장을 쓴다
 * (티켓 20261001_1200). 참조 소스가 배지 조건(`recipe_first_success`) 하나뿐이라 `count`는
 * 가리키는 배지 수다(`recipe-references.ts` 머리 주석).
 */
export function recipeDeleteBlockedMessage(count: number): string {
  return `삭제할 수 없어요. 이 레시피를 가리키는 배지가 ${count}개 있어요. 배지 조건에서 이 레시피를 먼저 바꿔 주세요.`
}

/**
 * 레시피를 지우기 전 확인 단계에 덧붙이는 안내 — 이 레시피를 가리키는 홈 카드(`today_cards.recipe_id`)가 있을 때만
 * 나온다(티켓 20261006_1342). 카드는 `ON DELETE SET NULL`이라 지워도 남고 레시피 줄만 빈다. 삭제를 막지 않고 알리기만
 * 한다(어드민의 삭제·예약 취소는 카드가 가리켜도 막지 않는다, 티켓 20261006_1218 가정 B). 일괄 삭제 확인창과 편집
 * 화면의 예약 취소 확인 문구가 같은 문장을 쓴다. 0장이면 `null`이다.
 */
export function recipeCardNoticeMessage(cardCount: number): string | null {
  if (!(cardCount > 0)) return null
  return `홈 카드 ${cardCount}장이 이 레시피를 가리켜요. 지우면 그 카드는 레시피 정보 없이 남아요.`
}

export interface RecipeDeletionClassification {
  deletable: string[]
  skipped: BulkSkip[]
}

/**
 * 삭제 대상을 "삭제 가능"과 "건너뜀"으로 나눈다 — 존재하지 않는 id와 참조가 하나라도 있는
 * 레시피는 건너뛴다. 참조 사유 문구는 단건 DELETE(`api/admin/recipes/[id]/route.ts`)의
 * 409 응답과 같은 `recipeDeleteBlockedMessage`다.
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
        reason: recipeDeleteBlockedMessage(candidate.total),
      })
      continue
    }
    deletable.push(id)
  }

  return { deletable, skipped }
}
