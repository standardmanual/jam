import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { readBulkRequest, updateByIdsAllOrNothing, bulkJson, type BulkServiceClient } from '@/lib/admin/bulk/server'
import { confirmPhraseFor, isPhraseMatch, type BulkSkip } from '@/lib/admin/bulk/shared'
import { BADGE_REFERENCE_SOURCES, collectBadgeReferences, chunkBadgeIds } from '@/lib/admin/badge-references'
import { classifyBadgeTribeAssignment, type BadgeTribeAssignmentCandidate } from '@/lib/admin/badge-list-bulk'
import { runBadgeDeactivationSideEffects } from '@/lib/admin/badge-deactivate'
import { invalidateUnclaimedDrops } from '@/lib/admin/poi-drops'
import type { BadgeType } from '@/types/database'

/**
 * 배지 목록 일괄 처리(티켓 20260924_0944, 상위 티켓 §4.1 배지 행) — 활성화·비활성화·트라이브
 * 지정·삭제 4개 동작을 한 라우트에서 다룬다. `POST /api/admin/badges/bulk`(배지 일괄 변경
 * 도구)와 이름이 겹치지 않도록 `list-bulk`로 둔다 — 그쪽은 바뀌지 않는다.
 *
 * 삭제는 배지 한 건마다 참조를 세는 `collectBadgeReferences`를 그대로 쓴다(옛
 * `bulk-delete/route.ts`에서 이전) — 그래서 다른 동작보다 상한을 낮게 둔다(100).
 */
export const maxDuration = 60

const DELETE_MAX_IDS = 100
const REFERENCE_CHECK_CONCURRENCY = 5
/** `.in()` 한 번에 넣는 id 개수 — badges 테이블 200건 청크(상위 티켓 §2)와 동일 기준 */
const READ_CHUNK_SIZE = 200

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const current = cursor++
      results[current] = await fn(items[current])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function fetchBadgeTribeCandidates(
  supabase: ReturnType<typeof createServiceClient>,
  ids: string[]
): Promise<{ candidates: Map<string, BadgeTribeAssignmentCandidate>; error: string | null }> {
  const candidates = new Map<string, BadgeTribeAssignmentCandidate>()
  for (const idsChunk of chunkBadgeIds(ids, READ_CHUNK_SIZE)) {
    const { data, error } = await supabase.from('badges').select('id, type, item_book_id').in('id', idsChunk)
    if (error) return { candidates, error: error.message }
    for (const row of (data ?? []) as { id: string; type: BadgeType; item_book_id: string | null }[]) {
      candidates.set(row.id, { type: row.type, item_book_id: row.item_book_id })
    }
  }
  return { candidates, error: null }
}

export async function POST(req: NextRequest) {
  const result = await readBulkRequest(req, {
    actions: {
      activate: {},
      deactivate: {},
      assign_tribe: {},
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

    const update = await updateByIdsAllOrNothing(bulkClient, 'badges', ids, { deleted_at: null })
    if (!update.ok) {
      return NextResponse.json({ error: update.error ?? '반영에 실패했습니다.' }, { status: 500 })
    }
    return bulkJson({ processed: update.updatedIds, skipped: [] }, { admin, action })
  }

  if (action === 'deactivate') {
    if (dryRun) {
      // 무효화될 월드 드랍 수 — `poi-drops.ts`의 무효화 조건(is_available=true,
      // picked_up_at is null)과 같은 조건으로 센다.
      const { count, error } = await supabase
        .from('poi_drops')
        .select('id', { count: 'exact', head: true })
        .in('badge_id', ids)
        .eq('is_available', true)
        .is('picked_up_at', null)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return bulkJson(
        { processed: ids, skipped: [], dryRun: true, impact: { droppableCount: count ?? 0 } },
        { admin, action }
      )
    }

    const update = await updateByIdsAllOrNothing(bulkClient, 'badges', ids, { deleted_at: new Date().toISOString() })
    if (!update.ok) {
      return NextResponse.json({ error: update.error ?? '반영에 실패했습니다.' }, { status: 500 })
    }
    // 모든 묶음 반영이 성공한 뒤에만 부수효과를 실행한다(상위 티켓 §2).
    await runBadgeDeactivationSideEffects(supabase, update.updatedIds, 'admin badges list-bulk deactivate')
    return bulkJson({ processed: update.updatedIds, skipped: [] }, { admin, action })
  }

  if (action === 'assign_tribe') {
    const tribeId =
      typeof (payload as { tribe_id?: unknown } | undefined)?.tribe_id === 'string'
        ? (payload as { tribe_id: string }).tribe_id.trim()
        : ''
    if (!tribeId) return NextResponse.json({ error: '트라이브를 선택해주세요.' }, { status: 400 })

    const { data: tribeRow, error: tribeError } = await supabase
      .from('tribes')
      .select('id')
      .eq('id', tribeId)
      .maybeSingle()
    if (tribeError) return NextResponse.json({ error: tribeError.message }, { status: 500 })
    if (!tribeRow) return NextResponse.json({ error: '존재하지 않는 트라이브입니다.' }, { status: 400 })

    const lookup = await fetchBadgeTribeCandidates(supabase, ids)
    if (lookup.error) return NextResponse.json({ error: lookup.error }, { status: 500 })

    // 컬렉션 수(운영 DB 기준 100건대)가 적어 전량 조회가 더 간단하고 안전하다 — 대상
    // item_book_id만 추려 `.in()`으로 좁히면 최대 1,000개 id를 다시 청크해야 한다.
    const { data: booksRaw, error: booksError } = await supabase.from('item_books').select('id, tribe_id')
    if (booksError) return NextResponse.json({ error: booksError.message }, { status: 500 })
    const tribeIdByItemBookId = new Map<string, string | null>(
      ((booksRaw ?? []) as { id: string; tribe_id: string | null }[]).map((b) => [b.id, b.tribe_id])
    )

    const { assignable, skipped } = classifyBadgeTribeAssignment(ids, lookup.candidates, tribeIdByItemBookId, tribeId)

    if (dryRun) return bulkJson({ processed: assignable, skipped, dryRun: true }, { admin, action })

    const update = await updateByIdsAllOrNothing(bulkClient, 'badges', assignable, { tribe_id: tribeId })
    if (!update.ok) {
      return NextResponse.json({ error: update.error ?? '반영에 실패했습니다.' }, { status: 500 })
    }
    return bulkJson({ processed: update.updatedIds, skipped }, { admin, action })
  }

  if (action === 'delete') {
    const perId = await mapWithConcurrency(ids, REFERENCE_CHECK_CONCURRENCY, async (id) => {
      const references = await collectBadgeReferences(supabase, [id])
      return { id, references }
    })

    // 한 배지라도 참조 조회가 실패하면 fail-closed로 전체를 중단한다(단건 DELETE·옛
    // bulk-delete와 동일 원칙).
    const failed = perId.find((p) => p.references.error)
    if (failed) {
      console.error('[badges list-bulk delete] 참조 카운트 조회 실패 — 하드 삭제를 차단합니다:', failed.references.error)
      return NextResponse.json(
        { error: '삭제할 수 없습니다. 이력 조회 중 오류가 발생했어요. 다시 시도해도 같으면 개발자에게 전달해 주세요.' },
        { status: 500 }
      )
    }

    const deletable: string[] = []
    const skipped: BulkSkip[] = []
    for (const { id, references } of perId) {
      const hitLabels = BADGE_REFERENCE_SOURCES.filter((s) => references.counts[s.key] > 0)
        .map((s) => `${s.label} ${references.counts[s.key]}건`)
        .join(', ')
      const hardBlocking = references.blockingTotal + references.cascadeTotal
      if (hardBlocking > 0) {
        skipped.push({ id, reason: `발급·드랍·지점 연결 이력 ${hardBlocking}건(${hitLabels})` })
      } else if (references.total > 0) {
        skipped.push({ id, reason: `콘텐츠 참조 ${references.total}건 남음(${hitLabels}) — 참조 정리 먼저 필요` })
      } else {
        deletable.push(id)
      }
    }

    const requiredPhrase = confirmPhraseFor('삭제', deletable.length)

    if (dryRun) {
      return bulkJson({ processed: deletable, skipped, dryRun: true, requiredPhrase }, { admin, action })
    }

    if (!confirmPhrase || !isPhraseMatch(confirmPhrase, requiredPhrase)) {
      return NextResponse.json({ error: '확인 문구가 일치하지 않습니다.', requiredPhrase }, { status: 409 })
    }

    let deleted: string[] = []
    if (deletable.length > 0) {
      const { data, error } = await supabase.from('badges').delete().in('id', deletable).select('id')
      if (error) {
        console.error('[badges list-bulk delete] 삭제 실패:', error.message)
        return NextResponse.json({ error: `삭제 중 오류가 발생했습니다: ${error.message}` }, { status: 500 })
      }
      deleted = (data ?? []).map((row) => row.id)
      await invalidateUnclaimedDrops(supabase, deleted, 'admin badges list-bulk delete')
    }

    return bulkJson({ processed: deleted, skipped }, { admin, action })
  }

  return NextResponse.json({ error: '지원하지 않는 동작입니다.' }, { status: 400 })
}
