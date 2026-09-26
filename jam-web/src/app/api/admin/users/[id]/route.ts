import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser, isAdminAccount } from '@/lib/admin/auth'
import { hardDeleteUser } from '@/lib/admin/user-actions'

/**
 * 유저 계정 강제 완전 삭제 (티켓 20260909_0911) — 삭제 절차는
 * `lib/admin/user-actions.ts`의 `hardDeleteUser`가 갖는다(유저 일괄 삭제와 같은 함수).
 *
 * 티켓 20260926_1413: 일괄 삭제·단건 초기화와 같은 안전장치 — 실행 어드민 본인이나 다른 어드민
 * 계정은 403으로 거부한다.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '어드민 권한이 필요합니다.' }, { status: 403 })

  const { id: userId } = await params

  const supabase = createServiceClient()

  const { data: target, error: targetError } = await supabase
    .from('users')
    .select('id, email, is_admin')
    .eq('id', userId)
    .maybeSingle()

  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 })
  if (!target) return NextResponse.json({ error: '유저를 찾을 수 없습니다.' }, { status: 404 })

  if (admin.id === userId) {
    return NextResponse.json({ error: '자기 자신의 계정은 삭제할 수 없습니다.' }, { status: 403 })
  }
  if (isAdminAccount(target)) {
    return NextResponse.json({ error: '어드민 계정은 삭제할 수 없습니다.' }, { status: 403 })
  }

  const result = await hardDeleteUser(supabase, userId, admin.email)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({
    deletedEmail: result.deletedEmail,
    deletedActivityBadges: result.deletedActivityBadges,
    deletedInventoryItems: result.deletedInventoryItems,
  })
}
