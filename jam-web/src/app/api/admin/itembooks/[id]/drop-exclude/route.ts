import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

/**
 * 컬렉션 전체 드랍 제외 토글 — 티켓 20260911_2220.
 *
 * `[id]/route.ts`의 PATCH(`{ is_active }`, 화면 노출 자체를 끄고 소속 배지를 연쇄
 * 소프트삭제하는 강한 토글)와는 완전히 별개다. 이 토글은 화면 노출·보유 이력을 그대로 두고
 * 드랍엔진의 컬렉션 조회(`item_books.drop_excluded = false` 조건, `lib/drop-engine/index.ts`)에서만
 * 이 컬렉션과 소속 배지 전체를 뺀다. 배지 개별 `drop_excluded`와는 별개 축이라 소속 배지의
 * 값은 건드리지 않는다. 되돌릴 수 있는 낮은 위험도의 값이라 확인 다이얼로그·캐스케이드
 * 소프트삭제를 거치지 않는다.
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
    .from('item_books')
    .update({ drop_excluded })
    .eq('id', id)
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json({ error: '컬렉션을 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.json({ itemBook: data })
}
