import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { approvePendingPois, rejectPendingPois, UNASSIGNED_POI_CATEGORY_SLUG } from '@/lib/admin/poi-review'

/**
 * POI 검토 큐 다중선택 일괄 액션 (티켓 20260907_1242) — 순차 단건 PATCH 반복이 아니라
 * 진짜 배치 쿼리(`.update().in('id', ids)`) 하나로 처리한다(missions bulk-delete와 동일 패턴).
 * body: { ids: string[], action: 'approve' | 'reject', category?: string }
 */
export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json().catch(() => null)
  const ids = Array.isArray(body?.ids)
    ? (body.ids as unknown[]).filter((id): id is string => typeof id === 'string')
    : []
  const action = body?.action
  const category = typeof body?.category === 'string' && body.category.trim() ? body.category.trim() : undefined

  if (ids.length === 0) {
    return NextResponse.json({ error: '처리할 POI를 선택해주세요.' }, { status: 400 })
  }
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action은 approve 또는 reject여야 합니다.' }, { status: 400 })
  }
  if (action === 'approve' && category === UNASSIGNED_POI_CATEGORY_SLUG) {
    return NextResponse.json(
      { error: '미분류(거부됨) 카테고리로는 승인할 수 없습니다. 거부 액션을 사용해주세요.' },
      { status: 400 }
    )
  }

  const service = createServiceClient()
  const result =
    action === 'approve' ? await approvePendingPois(service, ids, category) : await rejectPendingPois(service, ids)

  if (result.error) {
    return NextResponse.json({ error: `처리 중 오류가 발생했습니다: ${result.error}` }, { status: 500 })
  }
  return NextResponse.json({ updated: result.updatedIds })
}
