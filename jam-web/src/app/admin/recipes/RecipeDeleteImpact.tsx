import type { BulkRunResponse } from '@/components/admin/data-table/admin-fetch'
import { recipeCardNoticeMessage } from '@/lib/admin/recipe-bulk'

interface RecipeDeleteImpactProps {
  /** 실제로 지워질 레시피 수(건너뜀 제외) */
  processedCount: number
  /** 함께 지워질 슬롯 수 */
  slotCount: number
  /** 삭제 대상을 가리키는 홈 카드 수 — 0보다 크면 안내를 더한다(삭제는 막지 않는다) */
  cardCount: number
  /** 참조 등으로 삭제 대상에서 빠진 항목 */
  skipped: BulkRunResponse['skipped']
}

/** 건너뜀 사유를 몇 건까지 보여줄지 — 나머지는 「외 N개」로 줄인다 */
const SKIPPED_PREVIEW_LIMIT = 3

/**
 * 레시피 일괄 삭제 확인창의 영향 안내(티켓 20261006_1405) — 레시피·슬롯 수, 홈 카드 안내, 건너뜀 목록.
 * 카드 수는 지울 레시피 전체의 합이라 안내가 「지울 레시피를」 표현이다. 미리보기 값만 받는 표시 컴포넌트라
 * jsdom 없이 `renderToStaticMarkup`으로 테스트한다.
 */
export function RecipeDeleteImpact({ processedCount, slotCount, cardCount, skipped }: RecipeDeleteImpactProps) {
  const cardNotice = recipeCardNoticeMessage(cardCount, 'bulk')

  return (
    <>
      <p>
        레시피 {processedCount}개와 슬롯 {slotCount}개가 함께 삭제됩니다. 되돌릴 수 없습니다.
      </p>
      {cardNotice && <p className="mt-1">{cardNotice}</p>}
      {skipped.length > 0 && (
        <>
          <p className="mt-1">선택한 레시피 중 {skipped.length}개는 삭제 대상에서 제외됩니다.</p>
          <p className="mt-1">
            {skipped
              .slice(0, SKIPPED_PREVIEW_LIMIT)
              .map((s) => `${s.label ?? s.id.slice(0, 8)}: ${s.reason}`)
              .join(' / ')}
            {skipped.length > SKIPPED_PREVIEW_LIMIT ? ` 외 ${skipped.length - SKIPPED_PREVIEW_LIMIT}개` : ''}
          </p>
        </>
      )}
    </>
  )
}
