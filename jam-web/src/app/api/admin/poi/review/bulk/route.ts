import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { readBulkRequest, bulkJson } from '@/lib/admin/bulk/server'
import {
  approvePendingPois,
  rejectPendingPois,
  splitReviewResult,
  UNASSIGNED_POI_CATEGORY_SLUG,
} from '@/lib/admin/poi-review'

/**
 * POI 검토 큐 다중선택 일괄 액션 (티켓 20260907_1242, 표준 응답 전환 20260924_0948) — 순차 단건
 * PATCH 반복이 아니라 배치 쿼리(`.update().in('id', ids)`) 하나로 처리한다.
 * body: `{ ids, action: 'approve' | 'reject', payload?: { category? } }` (`lib/admin/bulk/shared.ts`)
 *
 * 응답은 표준 `{ processed, skipped }`다. 요청한 id 중 실제로 갱신되지 않은 것(그 사이 다른
 * 어드민이 이미 처리한 POI — `pending_review = true` 조건에 걸리지 않음)은 "이미 처리됨"으로
 * 건너뛴다. 활성화·거부는 모두 등급 1이라 영향 수치(`dry_run` 미리보기)가 없다.
 */
export async function POST(req: NextRequest) {
  const result = await readBulkRequest(req, {
    actions: { approve: {}, reject: {} },
    idFormat: 'uuid',
  })
  if (!result.ok) return result.response
  const { admin, body } = result.context
  const { ids, action, payload, dryRun } = body

  const rawCategory = (payload as { category?: unknown } | undefined)?.category
  const category = typeof rawCategory === 'string' && rawCategory.trim() ? rawCategory.trim() : undefined

  if (action === 'approve' && category === UNASSIGNED_POI_CATEGORY_SLUG) {
    return NextResponse.json(
      { error: '미분류(거부됨) 카테고리로는 활성화할 수 없습니다. 거부 동작을 사용해주세요.' },
      { status: 400 }
    )
  }

  // 미리보기 요청은 어떤 경우에도 쓰지 않는다 — 영향 수치가 없는 등급 1이라 요청 건수를 그대로 돌려준다.
  if (dryRun) return bulkJson({ processed: ids, skipped: [], dryRun: true }, { admin, action })

  const service = createServiceClient()
  const update =
    action === 'approve' ? await approvePendingPois(service, ids, category) : await rejectPendingPois(service, ids)

  if (update.error) {
    return NextResponse.json({ error: `처리 중 오류가 발생했습니다: ${update.error}` }, { status: 500 })
  }
  return bulkJson(splitReviewResult(ids, update.updatedIds), { admin, action })
}
