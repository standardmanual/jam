import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { readBulkRequest, bulkJson } from '@/lib/admin/bulk/server'
import { confirmPhraseFor, isPhraseMatch } from '@/lib/admin/bulk/shared'
import {
  DESTROY_ERROR_LABEL,
  ORPHANED_REASSIGN_MAX_IDS,
  REASSIGN_ERROR_LABEL,
  classifyOwnerless,
  destroyOrphanedItems,
  fetchOrphanedItemInfos,
  reassignOrphanedItems,
  summarizeDestroyImpact,
  summarizeReassignImpact,
  toBulkResult,
  type OrphanedItemInfo,
} from '@/lib/admin/orphaned-item-actions'

/**
 * 미소유 아이템배지 일괄 처리(티켓 20260924_0950, 상위 티켓 §4.3) — 폐기(등급 3)와 재배정
 * (등급 2, 한 번에 200건까지) 두 동작을 한 라우트에서 다룬다. 폐기·재배정을 각각
 * 따로 받던 예전 라우트 두 개를 대체한다. 개체마다 RPC를 부르므로 실행 시간을 늘려둔다.
 *
 * 결과는 원자적이지 않다 — 개체별로 처리·건너뜀을 돌려준다(`lib/admin/orphaned-item-actions.ts`).
 */
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const result = await readBulkRequest(req, {
    actions: {
      destroy: {},
      reassign: { maxIds: ORPHANED_REASSIGN_MAX_IDS },
    },
    idFormat: 'uuid',
  })
  if (!result.ok) return result.response
  const { admin, body } = result.context
  const { ids, action, payload, dryRun, confirmPhrase } = body

  const supabase = createServiceClient()

  let infos: Map<string, OrphanedItemInfo>
  try {
    infos = await fetchOrphanedItemInfos(supabase, ids)
  } catch (error) {
    console.error('[admin/item-badges/orphaned/bulk] 개체 조회 실패:', error)
    return NextResponse.json({ error: '개체 상태를 확인하지 못했습니다. 잠시 뒤 다시 시도해주세요.' }, { status: 500 })
  }
  const { eligible, skipped } = classifyOwnerless(ids, infos)

  if (action === 'destroy') {
    const requiredPhrase = confirmPhraseFor('폐기', eligible.length)

    if (dryRun) {
      return bulkJson(
        {
          processed: eligible,
          skipped,
          dryRun: true,
          requiredPhrase,
          impact: summarizeDestroyImpact(eligible, infos),
        },
        { admin, action }
      )
    }

    if (!confirmPhrase || !isPhraseMatch(confirmPhrase, requiredPhrase)) {
      return NextResponse.json({ error: '확인 문구가 일치하지 않습니다.', requiredPhrase }, { status: 409 })
    }

    const outcomes = await destroyOrphanedItems(supabase, eligible, admin.id)
    const destroyed = toBulkResult(outcomes, infos, DESTROY_ERROR_LABEL)
    return bulkJson(
      { processed: destroyed.processed, skipped: [...skipped, ...destroyed.skipped] },
      { admin, action }
    )
  }

  if (action === 'reassign') {
    const targetUserId = (payload as { targetUserId?: unknown } | undefined)?.targetUserId
    if (typeof targetUserId !== 'string' || !UUID_RE.test(targetUserId)) {
      return NextResponse.json({ error: '재배정 대상 유저를 지정해주세요.' }, { status: 400 })
    }

    if (dryRun) {
      const { data: inventory, error } = await supabase
        .from('inventory')
        .select('max_slots, used_slots')
        .eq('user_id', targetUserId)
        .maybeSingle()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      return bulkJson(
        {
          processed: eligible,
          skipped,
          dryRun: true,
          impact: summarizeReassignImpact(eligible.length, inventory),
        },
        { admin, action }
      )
    }

    const outcomes = await reassignOrphanedItems(supabase, eligible, admin.id, targetUserId)
    const reassigned = toBulkResult(outcomes, infos, REASSIGN_ERROR_LABEL)
    return bulkJson(
      { processed: reassigned.processed, skipped: [...skipped, ...reassigned.skipped] },
      { admin, action }
    )
  }

  return NextResponse.json({ error: '지원하지 않는 동작입니다.' }, { status: 400 })
}
