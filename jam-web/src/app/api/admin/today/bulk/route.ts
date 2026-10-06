import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  readBulkRequest,
  updateByIdsAllOrNothing,
  deleteByIds,
  bulkJson,
  type BulkServiceClient,
} from '@/lib/admin/bulk/server'
import { confirmPhraseFor, isPhraseMatch } from '@/lib/admin/bulk/shared'
import { classifyTodayEndPeriod, type TodayCardPeriodRow } from '@/lib/admin/today-bulk'

/**
 * 투데이 콘텐츠 일괄 처리(티켓 20260924_0947, 상위 티켓 §4.1 투데이 행) — 활성화·비활성화·기간
 * 종료(등급 1)와 삭제(등급 3). 옛 `bulk-delete/route.ts`(삭제만, 확인 문구 없음)를 대체한다.
 *
 * 삭제에 참조 보호를 두지 않는다: 카드는 다른 콘텐츠가 참조하는 대상이 아니라 참조하는 쪽이다
 * (`mission_id`·`item_book_id`·`badge_ids`·`ranking_mode_id`·`recipe_id`가 모두 today_cards → 다른 엔티티
 * 방향, 옛 `bulk-delete` 주석과 같은 조사 결과).
 */
const READ_CHUNK_SIZE = 200

async function fetchCardPeriods(
  bulkClient: BulkServiceClient,
  ids: string[]
): Promise<{ cards: TodayCardPeriodRow[]; error: string | null }> {
  const cards: TodayCardPeriodRow[] = []
  for (let i = 0; i < ids.length; i += READ_CHUNK_SIZE) {
    const { data, error } = await bulkClient
      .from('today_cards')
      .select('id, title, starts_at, ends_at')
      .in('id', ids.slice(i, i + READ_CHUNK_SIZE))
    if (error) return { cards, error: error.message }
    cards.push(...((data ?? []) as unknown as TodayCardPeriodRow[]))
  }
  return { cards, error: null }
}

export async function POST(req: NextRequest) {
  const result = await readBulkRequest(req, {
    actions: { activate: {}, deactivate: {}, end_period: {}, delete: {} },
    idFormat: 'uuid',
  })
  if (!result.ok) return result.response
  const { admin, body } = result.context
  const { ids, action, dryRun, confirmPhrase } = body

  const supabase = createServiceClient()
  const bulkClient = supabase as unknown as BulkServiceClient

  if (action === 'activate' || action === 'deactivate') {
    if (dryRun) return bulkJson({ processed: ids, skipped: [], dryRun: true }, { admin, action })

    const update = await updateByIdsAllOrNothing(bulkClient, 'today_cards', ids, {
      is_active: action === 'activate',
    })
    if (!update.ok) {
      return NextResponse.json({ error: update.error ?? '반영에 실패했어요.' }, { status: 500 })
    }
    return bulkJson({ processed: update.updatedIds, skipped: [] }, { admin, action })
  }

  if (action === 'end_period') {
    const lookup = await fetchCardPeriods(bulkClient, ids)
    if (lookup.error) return NextResponse.json({ error: lookup.error }, { status: 500 })

    const now = new Date()
    const { endable, skipped } = classifyTodayEndPeriod(ids, lookup.cards, now)
    if (dryRun) return bulkJson({ processed: endable, skipped, dryRun: true }, { admin, action })

    const update = await updateByIdsAllOrNothing(bulkClient, 'today_cards', endable, {
      ends_at: now.toISOString(),
    })
    if (!update.ok) {
      return NextResponse.json({ error: update.error ?? '반영에 실패했어요.' }, { status: 500 })
    }
    return bulkJson({ processed: update.updatedIds, skipped }, { admin, action })
  }

  if (action === 'delete') {
    const lookup = await fetchCardPeriods(bulkClient, ids)
    if (lookup.error) return NextResponse.json({ error: lookup.error }, { status: 500 })

    const existingIds = new Set(lookup.cards.map((c) => c.id))
    const deletable = ids.filter((id) => existingIds.has(id))
    const skipped = ids
      .filter((id) => !existingIds.has(id))
      .map((id) => ({ id, reason: '이미 삭제된 카드예요.' }))
    const requiredPhrase = confirmPhraseFor('삭제', deletable.length)

    if (dryRun) {
      return bulkJson({ processed: deletable, skipped, dryRun: true, requiredPhrase }, { admin, action })
    }

    if (!confirmPhrase || !isPhraseMatch(confirmPhrase, requiredPhrase)) {
      return NextResponse.json({ error: '확인 문구가 일치하지 않아요.', requiredPhrase }, { status: 409 })
    }

    const deleted = await deleteByIds(bulkClient, 'today_cards', deletable)
    return bulkJson(
      { processed: deleted.processed, skipped: [...skipped, ...deleted.skipped] },
      { admin, action }
    )
  }

  return NextResponse.json({ error: '지원하지 않는 동작이에요.' }, { status: 400 })
}
