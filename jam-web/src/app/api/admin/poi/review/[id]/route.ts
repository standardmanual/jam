import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { approvePendingPois, rejectPendingPois, UNASSIGNED_POI_CATEGORY_SLUG } from '@/lib/admin/poi-review'

/**
 * POI 검토 큐 단건 액션 (티켓 20260907_1242) — 승인 / 카테고리 변경 후 승인 / 거부.
 * body: { action: 'approve' | 'reject', category?: string }
 * category는 action='approve'일 때만 의미가 있다("카테고리 변경 후 승인") — 거부는 항상
 * unassigned로 이관되므로 category를 받지 않는다(bulk/route.ts와 동일 규칙).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { id } = await params
  const body = await req.json().catch(() => null)
  const action = body?.action
  const category = typeof body?.category === 'string' && body.category.trim() ? body.category.trim() : undefined

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
    action === 'approve' ? await approvePendingPois(service, [id], category) : await rejectPendingPois(service, [id])

  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
  if (result.updatedIds.length === 0) {
    return NextResponse.json({ error: '대상 POI를 찾을 수 없습니다.' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
