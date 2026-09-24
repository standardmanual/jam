import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { readBulkRequest, updateByIdsAllOrNothing, deleteByIds, bulkJson, type BulkServiceClient } from '@/lib/admin/bulk/server'
import { confirmPhraseFor, isPhraseMatch } from '@/lib/admin/bulk/shared'
import {
  collectItemBookReferences,
  ITEM_BOOK_REFERENCE_SOURCES,
  classifyReferenceDeletion,
} from '@/lib/admin/reference-guards'

/**
 * 컬렉션 목록 일괄 처리(티켓 20260924_0945, 상위 티켓 §4.1 컬렉션 행) — 활성화·비활성화(등급 1)·
 * 삭제(등급 3) 3개 동작을 한 라우트에서 다룬다. 옛 `bulk-delete` 라우트의 삭제를 이 라우트로
 * 옮겼다(호출처는 컬렉션 목록 표 하나뿐이었다).
 *
 * 컬렉션 활성/비활성은 소속 아이템배지의 활성 여부와 완전히 독립적이다(티켓 20260914_1729) —
 * 여기서 배지를 건드리지 않는다.
 */
export const maxDuration = 60

/** 삭제는 참조 조회가 `.in()` 한 번에 id를 싣는다 — URL 16KB 상한에 걸리지 않도록 200건으로 둔다 */
const DELETE_MAX_IDS = 200

export async function POST(req: NextRequest) {
  const result = await readBulkRequest(req, {
    actions: {
      activate: {},
      deactivate: {},
      delete: { maxIds: DELETE_MAX_IDS },
    },
    idFormat: 'uuid',
  })
  if (!result.ok) return result.response
  const { admin, body } = result.context
  const { ids, action, dryRun, confirmPhrase } = body

  const supabase = createServiceClient()
  const bulkClient = supabase as unknown as BulkServiceClient

  if (action === 'activate' || action === 'deactivate') {
    if (dryRun) return bulkJson({ processed: ids, skipped: [], dryRun: true }, { admin, action })

    const update = await updateByIdsAllOrNothing(bulkClient, 'item_books', ids, { is_active: action === 'activate' })
    if (!update.ok) {
      return NextResponse.json({ error: update.error ?? '반영에 실패했습니다.' }, { status: 500 })
    }
    return bulkJson({ processed: update.updatedIds, skipped: [] }, { admin, action })
  }

  if (action === 'delete') {
    const { counts, error: refError } = await collectItemBookReferences(supabase, ids)
    if (refError) {
      console.error('[itembooks bulk delete] 참조 카운트 조회 실패 — 하드 삭제를 차단합니다:', refError)
      return NextResponse.json(
        { error: '삭제할 수 없습니다. 이력 조회 중 오류가 발생했어요. 다시 시도해도 같으면 개발자에게 전달해 주세요.' },
        { status: 500 }
      )
    }

    const { deletable, skipped } = classifyReferenceDeletion(
      ids,
      counts,
      ITEM_BOOK_REFERENCE_SOURCES,
      (summary) => `유저 진행 기록 ${summary.blockingTotal}건(${summary.hitLabels})`
    )
    const requiredPhrase = confirmPhraseFor('삭제', deletable.length)

    if (dryRun) {
      return bulkJson({ processed: deletable, skipped, dryRun: true, requiredPhrase }, { admin, action })
    }

    if (!confirmPhrase || !isPhraseMatch(confirmPhrase, requiredPhrase)) {
      return NextResponse.json({ error: '확인 문구가 일치하지 않습니다.', requiredPhrase }, { status: 409 })
    }

    const deleted = await deleteByIds(bulkClient, 'item_books', deletable)
    return bulkJson({ processed: deleted.processed, skipped: [...skipped, ...deleted.skipped] }, { admin, action })
  }

  return NextResponse.json({ error: '지원하지 않는 동작입니다.' }, { status: 400 })
}
