import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { readBulkRequest, updateByIdsAllOrNothing, deleteByIds, bulkJson, type BulkServiceClient } from '@/lib/admin/bulk/server'
import { confirmPhraseFor, isPhraseMatch } from '@/lib/admin/bulk/shared'
import { validatePoiCategoryExists } from '@/lib/admin/poi-category-validation'
import { buildPoiCategoryPatch, classifyPoiDeletion } from '@/lib/admin/poi-bulk'
import { collectPoiReferencesById } from '@/lib/admin/poi-references'

/**
 * POI 목록 일괄 처리(티켓 20260924_0941, 상위 티켓 §4.1 체크인 관리 행) — 활성화·비활성화·
 * 카테고리 변경·삭제 4개 동작을 한 라우트에서 다룬다. 참조 카운트 조회(삭제 미리보기)가
 * 여러 왕복을 필요로 할 수 있어 `badges/list-bulk`의 삭제와 동일하게 실행 시간을 늘려둔다.
 */
export const maxDuration = 60

const DELETE_MAX_IDS = 200

export async function POST(req: NextRequest) {
  const result = await readBulkRequest(req, {
    actions: {
      activate: {},
      deactivate: {},
      category: {},
      delete: { maxIds: DELETE_MAX_IDS },
    },
    idFormat: 'uuid',
  })
  if (!result.ok) return result.response
  const { admin, body } = result.context
  const { ids, action, payload, dryRun, confirmPhrase } = body

  const supabase = createServiceClient()
  const bulkClient = supabase as unknown as BulkServiceClient

  if (action === 'activate') {
    if (dryRun) return bulkJson({ processed: ids, skipped: [], dryRun: true }, { admin, action })

    const update = await updateByIdsAllOrNothing(bulkClient, 'poi', ids, { is_active: true })
    if (!update.ok) {
      return NextResponse.json({ error: update.error ?? '반영에 실패했습니다.' }, { status: 500 })
    }
    return bulkJson({ processed: update.updatedIds, skipped: [] }, { admin, action })
  }

  if (action === 'deactivate') {
    if (dryRun) {
      const { count, error } = await supabase
        .from('poi')
        .select('id', { count: 'exact', head: true })
        .in('id', ids)
        .eq('is_active', true)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return bulkJson(
        { processed: ids, skipped: [], dryRun: true, impact: { activeCount: count ?? 0 } },
        { admin, action }
      )
    }

    const update = await updateByIdsAllOrNothing(bulkClient, 'poi', ids, { is_active: false })
    if (!update.ok) {
      return NextResponse.json({ error: update.error ?? '반영에 실패했습니다.' }, { status: 500 })
    }
    return bulkJson({ processed: update.updatedIds, skipped: [] }, { admin, action })
  }

  if (action === 'category') {
    const category = typeof (payload as { category?: unknown } | undefined)?.category === 'string'
      ? (payload as { category: string }).category.trim()
      : ''
    if (!category) return NextResponse.json({ error: '카테고리를 선택해주세요.' }, { status: 400 })

    const categoryValidation = await validatePoiCategoryExists(supabase, category)
    if (!categoryValidation.valid) {
      return NextResponse.json({ error: categoryValidation.error }, { status: categoryValidation.status })
    }

    if (dryRun) return bulkJson({ processed: ids, skipped: [], dryRun: true }, { admin, action })

    const categoryPatch = buildPoiCategoryPatch(category) as unknown as Record<string, unknown>
    const update = await updateByIdsAllOrNothing(bulkClient, 'poi', ids, categoryPatch)
    if (!update.ok) {
      return NextResponse.json({ error: update.error ?? '반영에 실패했습니다.' }, { status: 500 })
    }
    return bulkJson({ processed: update.updatedIds, skipped: [] }, { admin, action })
  }

  if (action === 'delete') {
    const lookup = await collectPoiReferencesById(supabase, ids)
    if (lookup.error) {
      console.error('[poi bulk delete] 참조 카운트 조회 실패 — 하드 삭제를 차단합니다:', lookup.error)
      return NextResponse.json(
        { error: '삭제할 수 없습니다. 이력 조회 중 오류가 발생했어요. 다시 시도해도 같으면 개발자에게 전달해 주세요.' },
        { status: 500 }
      )
    }

    const { deletable, skipped } = classifyPoiDeletion(ids, lookup.candidates)
    const requiredPhrase = confirmPhraseFor('삭제', deletable.length)

    if (dryRun) {
      return bulkJson({ processed: deletable, skipped, dryRun: true, requiredPhrase }, { admin, action })
    }

    if (!confirmPhrase || !isPhraseMatch(confirmPhrase, requiredPhrase)) {
      return NextResponse.json({ error: '확인 문구가 일치하지 않습니다.', requiredPhrase }, { status: 409 })
    }

    const deleteResult = await deleteByIds(bulkClient, 'poi', deletable)
    return bulkJson(
      { processed: deleteResult.processed, skipped: [...skipped, ...deleteResult.skipped] },
      { admin, action }
    )
  }

  return NextResponse.json({ error: '지원하지 않는 동작입니다.' }, { status: 400 })
}
