import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

/**
 * 배지 개별 드랍 제외 토글 — 티켓 20260911_2220.
 *
 * `[id]/route.ts`의 PATCH(`{ active }`, `deleted_at` 소프트 삭제 토글)와는 완전히 별개다.
 * 이 토글은 화면 노출·보유 이력은 그대로 두고 드랍엔진 후보 조회에서만 이 배지를
 * 뺀다(`lib/drop-engine/index.ts`의 `droppable` 필터). 되돌릴 수 있는 낮은 위험도의 값이라
 * 소프트 삭제 토글과 달리 확인 다이얼로그·미픽업 드랍 무효화를 거치지 않는다 — 이미 놓인
 * 드랍은 그대로 유지되고, 다음 드랍 시도부터 후보에서 빠진다.
 * body: { drop_excluded: boolean }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { drop_excluded } = body as { drop_excluded?: boolean }

  if (typeof drop_excluded !== 'boolean') {
    return NextResponse.json({ error: 'drop_excluded는 boolean이어야 합니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('badges')
    .update({ drop_excluded })
    .eq('id', id)
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json({ error: '배지를 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.json({ badge: data })
}
