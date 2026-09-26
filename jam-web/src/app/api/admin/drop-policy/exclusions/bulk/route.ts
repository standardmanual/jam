import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { readBulkRequest, updateByIdsAllOrNothing, bulkJson, type BulkServiceClient } from '@/lib/admin/bulk/server'
import { splitExclusionResult } from '@/lib/admin/drop-exclusion-list'

/**
 * 드랍 제외 관리 일괄 처리(티켓 20260924_0948, 상위 티켓 §4.4 드랍 제외 행) — 아이템배지·컬렉션의
 * 드랍 제외(`exclude`)·제외 해제(`include`)를 요청 한 번으로 처리한다(단건 PATCH 반복 대체).
 * body: `{ ids, action: 'exclude' | 'include', payload: { entity: 'badge' | 'collection' } }`
 *
 * 등급 1(되돌릴 수 있음, 영향 수치 없음)이라 `dry_run` 미리보기 없이 확인창만 거친다. 200건 이하는
 * `update({ drop_excluded }).in('id', ids)` 한 문장이고, 그 위는 `updateByIdsAllOrNothing`이
 * 200건씩 반영하며 실패하면 되돌린다. 아이템배지는 `type = 'item'`만 대상이다.
 */
const ID_CHUNK_SIZE = 200

// DB 오류 원문은 응답에 싣지 않고 로그에만 남긴다(티켓 20260926_1602). 현상 → 원인 → 해결책 순서.
const ELIGIBLE_READ_ERROR_MESSAGE = '배지 정보를 불러오지 못했어요. 서버에서 조회 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'

export async function POST(req: NextRequest) {
  const result = await readBulkRequest(req, {
    actions: { exclude: {}, include: {} },
    idFormat: 'uuid',
  })
  if (!result.ok) return result.response
  const { admin, body } = result.context
  const { ids, action, payload, dryRun } = body

  const entity = (payload as { entity?: unknown } | undefined)?.entity
  if (entity !== 'badge' && entity !== 'collection') {
    return NextResponse.json({ error: '대상 종류(entity)는 badge 또는 collection이어야 합니다.' }, { status: 400 })
  }

  // 미리보기 요청은 어떤 경우에도 쓰지 않는다 — 영향 수치가 없는 등급 1이라 요청 건수를 그대로 돌려준다.
  if (dryRun) return bulkJson({ processed: ids, skipped: [], dryRun: true }, { admin, action })

  const supabase = createServiceClient()

  let eligibleIds = ids
  let ineligibleReason = ''
  if (entity === 'badge') {
    // 아이템배지(type = 'item')만 대상 — 다른 유형의 배지 id가 섞여도 건드리지 않는다.
    // 삭제된 배지(deleted_at 있음)도 목록 쿼리와 같은 기준으로 대상에서 뺀다(티켓 20260926_1413).
    eligibleIds = []
    for (let i = 0; i < ids.length; i += ID_CHUNK_SIZE) {
      const { data, error } = await supabase
        .from('badges')
        .select('id')
        .in('id', ids.slice(i, i + ID_CHUNK_SIZE))
        .eq('type', 'item')
        .is('deleted_at', null)
      if (error) {
        console.error('[exclusions bulk 대상 조회 오류]', error)
        return NextResponse.json({ error: ELIGIBLE_READ_ERROR_MESSAGE }, { status: 500 })
      }
      eligibleIds.push(...(data ?? []).map((row) => row.id))
    }
    ineligibleReason = '아이템배지가 아닙니다'
  }

  const update = await updateByIdsAllOrNothing(
    supabase as unknown as BulkServiceClient,
    entity === 'badge' ? 'badges' : 'item_books',
    eligibleIds,
    { drop_excluded: action === 'exclude' }
  )
  if (!update.ok) {
    return NextResponse.json({ error: update.error ?? '반영에 실패했습니다.' }, { status: 500 })
  }

  return bulkJson(splitExclusionResult(ids, eligibleIds, update.updatedIds, ineligibleReason), { admin, action })
}
