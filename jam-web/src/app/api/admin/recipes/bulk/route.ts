import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { readBulkRequest, deleteByIds, bulkJson, type BulkServiceClient } from '@/lib/admin/bulk/server'
import { confirmPhraseFor, isPhraseMatch } from '@/lib/admin/bulk/shared'
import { classifyRecipeDeletion } from '@/lib/admin/recipe-bulk'
import { collectRecipeDeletionCandidates } from '@/lib/admin/recipe-references'

/**
 * 믹스 레시피 목록 일괄 처리(티켓 20260924_0949, 상위 티켓 §4.1 믹스 레시피 행) — 삭제
 * 한 가지다(레시피에는 활성 여부 칸이 없고 공개 시각만 있다 — 예약 중이든 공개됐든 삭제 가드만 통과하면
 * 지운다, 티켓 20261001_1158). 삭제는 등급 3이라 미리보기(`dry_run`)가 영향
 * 수치와 확인 문구를 계산하고, 실행 때 서버가 문구를 다시 대조한다. 슬롯
 * (`combination_recipe_slots`)은 레시피 삭제에 CASCADE로 함께 지워진다.
 */
export const maxDuration = 60

/** `.in()` 목록이 URL 16KB 상한에 걸리지 않도록 POI 삭제와 같은 200건으로 둔다 */
const DELETE_MAX_IDS = 200

export async function POST(req: NextRequest) {
  const result = await readBulkRequest(req, {
    actions: { delete: { maxIds: DELETE_MAX_IDS } },
    idFormat: 'uuid',
  })
  if (!result.ok) return result.response
  const { admin, body } = result.context
  const { ids, action, dryRun, confirmPhrase } = body

  if (action !== 'delete') {
    return NextResponse.json({ error: '지원하지 않는 동작입니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const bulkClient = supabase as unknown as BulkServiceClient

  const lookup = await collectRecipeDeletionCandidates(supabase, ids)
  // fail-closed: 참조 조회가 실패하면 "참조 0건"으로 오판하지 않도록 삭제를 막는다.
  if (lookup.error) {
    console.error('[recipes bulk delete] 참조 카운트 조회 실패 — 하드 삭제를 차단합니다:', lookup.error)
    return NextResponse.json(
      { error: '삭제할 수 없습니다. 이력 조회 중 오류가 발생했어요. 다시 시도해도 같으면 개발자에게 전달해 주세요.' },
      { status: 500 }
    )
  }

  const { deletable, skipped } = classifyRecipeDeletion(ids, lookup.candidates)
  const requiredPhrase = confirmPhraseFor('삭제', deletable.length)

  if (dryRun) {
    let slotCount = 0
    if (deletable.length > 0) {
      const { count, error } = await supabase
        .from('combination_recipe_slots')
        .select('id', { count: 'exact', head: true })
        .in('recipe_id', deletable)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      slotCount = count ?? 0
    }
    return bulkJson(
      {
        processed: deletable,
        skipped,
        dryRun: true,
        requiredPhrase,
        impact: { recipeCount: deletable.length, slotCount, blockedCount: skipped.length },
      },
      { admin, action }
    )
  }

  if (!confirmPhrase || !isPhraseMatch(confirmPhrase, requiredPhrase)) {
    return NextResponse.json({ error: '확인 문구가 일치하지 않습니다.', requiredPhrase }, { status: 409 })
  }

  const deleteResult = await deleteByIds(bulkClient, 'combination_recipes', deletable)
  return bulkJson(
    { processed: deleteResult.processed, skipped: [...skipped, ...deleteResult.skipped] },
    { admin, action }
  )
}
