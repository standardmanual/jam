import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { readBulkRequest, updateByIdsAllOrNothing, deleteByIds, bulkJson, type BulkServiceClient } from '@/lib/admin/bulk/server'
import { confirmPhraseFor, isPhraseMatch } from '@/lib/admin/bulk/shared'
import {
  collectTribeReferences,
  TRIBE_REFERENCE_SOURCES,
  classifyReferenceDeletion,
} from '@/lib/admin/reference-guards'

/**
 * 트라이브 목록 일괄 처리(티켓 20260924_0945, 상위 티켓 §4.1 트라이브 행) — 활성화(등급 1)·
 * 비활성화(등급 2)·삭제(등급 3). 옛 `bulk-delete` 라우트의 삭제를 이 라우트로 옮겼다.
 *
 * 비활성화의 실제 영향은 온보딩 선택지와 추천 후보에서 빠지는 것이다. 드랍 엔진은 트라이브의 활성
 * 여부를 읽지 않는다(`lib/drop-engine/index.ts`) — 그래서 미리보기(`dry_run`)의 영향 수치도
 * 이 컬렉션·배지·유저 수만 돌려준다(의미 확장은 티켓 20260924_0938).
 */
export const maxDuration = 60

/** 트라이브는 10건대라 200건이면 충분하다 — 참조 조회의 `.in()`이 URL 16KB 상한에 걸리지 않게 한다 */
const MAX_IDS = 200

export async function POST(req: NextRequest) {
  const result = await readBulkRequest(req, {
    actions: {
      activate: { maxIds: MAX_IDS },
      deactivate: { maxIds: MAX_IDS },
      delete: { maxIds: MAX_IDS },
    },
    idFormat: 'uuid',
  })
  if (!result.ok) return result.response
  const { admin, body } = result.context
  const { ids, action, dryRun, confirmPhrase } = body

  const supabase = createServiceClient()
  const bulkClient = supabase as unknown as BulkServiceClient

  if (action === 'activate') {
    if (dryRun) return bulkJson({ processed: ids, skipped: [], dryRun: true }, { admin, action })

    const update = await updateByIdsAllOrNothing(bulkClient, 'tribes', ids, { is_active: true })
    if (!update.ok) {
      return NextResponse.json({ error: update.error ?? '반영에 실패했습니다.' }, { status: 500 })
    }
    return bulkJson({ processed: update.updatedIds, skipped: [] }, { admin, action })
  }

  if (action === 'deactivate') {
    if (dryRun) {
      // 이 트라이브의 활성 컬렉션 수·삭제되지 않은 배지 수·이 트라이브를 고른 유저 수.
      const [books, badges, users] = await Promise.all([
        supabase
          .from('item_books')
          .select('id', { count: 'exact', head: true })
          .in('tribe_id', ids)
          .eq('is_active', true),
        supabase.from('badges').select('id', { count: 'exact', head: true }).in('tribe_id', ids).is('deleted_at', null),
        supabase.from('users').select('id', { count: 'exact', head: true }).in('tribe_id', ids),
      ])
      const failed = books.error ?? badges.error ?? users.error
      if (failed) return NextResponse.json({ error: failed.message }, { status: 500 })

      return bulkJson(
        {
          processed: ids,
          skipped: [],
          dryRun: true,
          impact: { activeBookCount: books.count ?? 0, badgeCount: badges.count ?? 0, userCount: users.count ?? 0 },
        },
        { admin, action }
      )
    }

    const update = await updateByIdsAllOrNothing(bulkClient, 'tribes', ids, { is_active: false })
    if (!update.ok) {
      return NextResponse.json({ error: update.error ?? '반영에 실패했습니다.' }, { status: 500 })
    }
    return bulkJson({ processed: update.updatedIds, skipped: [] }, { admin, action })
  }

  if (action === 'delete') {
    const { counts, error: refError } = await collectTribeReferences(supabase, ids)
    if (refError) {
      console.error('[tribes bulk delete] 참조 카운트 조회 실패 — 하드 삭제를 차단합니다:', refError)
      return NextResponse.json(
        { error: '삭제할 수 없습니다. 이력 조회 중 오류가 발생했어요. 다시 시도해도 같으면 개발자에게 전달해 주세요.' },
        { status: 500 }
      )
    }

    const { deletable, skipped } = classifyReferenceDeletion(
      ids,
      counts,
      TRIBE_REFERENCE_SOURCES,
      (summary) => `연결된 참조 ${summary.blockingTotal}건(${summary.hitLabels})`
    )
    const requiredPhrase = confirmPhraseFor('삭제', deletable.length)

    if (dryRun) {
      return bulkJson({ processed: deletable, skipped, dryRun: true, requiredPhrase }, { admin, action })
    }

    if (!confirmPhrase || !isPhraseMatch(confirmPhrase, requiredPhrase)) {
      return NextResponse.json({ error: '확인 문구가 일치하지 않습니다.', requiredPhrase }, { status: 409 })
    }

    const deleted = await deleteByIds(bulkClient, 'tribes', deletable)
    return bulkJson({ processed: deleted.processed, skipped: [...skipped, ...deleted.skipped] }, { admin, action })
  }

  return NextResponse.json({ error: '지원하지 않는 동작입니다.' }, { status: 400 })
}
