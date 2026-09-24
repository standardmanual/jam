import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser, isAdminAccount } from '@/lib/admin/auth'
import { resetUserData } from '@/lib/admin/user-actions'

/**
 * 유저 전체 초기화 (시뮬레이터 반복 테스트용) — 실제 삭제 순서·유지 대상은
 * `lib/admin/user-actions.ts`의 `resetUserData`가 갖는다(유저 일괄 초기화와 같은 함수).
 *
 * 티켓 20260924_0951: 일괄 초기화가 어드민·본인 계정을 대상에서 빼는 것과 같은 안전장치를
 * 단건에도 둔다 — 실행 어드민 본인이나 다른 어드민 계정은 403으로 거부한다.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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
    return NextResponse.json({ error: '자기 자신의 계정은 초기화할 수 없습니다.' }, { status: 403 })
  }
  if (isAdminAccount(target)) {
    return NextResponse.json({ error: '어드민 계정은 초기화할 수 없습니다.' }, { status: 403 })
  }

  const result = await resetUserData(supabase, userId, admin.email)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({
    deletedActivityBadges: result.deletedActivityBadges,
    deletedInventoryItems: result.deletedInventoryItems,
  })
}
