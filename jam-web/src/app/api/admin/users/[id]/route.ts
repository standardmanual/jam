import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import type { InventoryRow, UserRow } from '@/types/database'

/**
 * 유저 계정 강제 완전 삭제 (티켓 20260909_0911)
 * 초기화(`reset`)와 달리 계정 자체를 지운다. `public.users.id`는 `auth.users(id)`를
 * `ON DELETE CASCADE`로 참조하므로(001_initial_schema), Admin API로 `auth.users` 행을
 * 지우면 `public.users`와 그 아래 모든 참조 테이블(strava_connections, inventory,
 * user_activity_badges 등)이 한 번의 DB 트랜잭션으로 연쇄 삭제된다. `public.users`를
 * 먼저 지우고 `auth.users`를 뒤이어 지우는 2단계 방식은 그 사이 상태가 갈라지는 창이
 * 생길 수 있어 채택하지 않았다.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '어드민 권한이 필요합니다.' }, { status: 403 })

  const { id: userId } = await params

  if (admin.id === userId) {
    return NextResponse.json({ error: '자기 자신의 계정은 이 화면에서 삭제할 수 없습니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('id, email, username')
    .eq('id', userId)
    .maybeSingle()

  if (userError) return NextResponse.json({ error: userError.message }, { status: 500 })
  if (!userRow) return NextResponse.json({ error: '유저를 찾을 수 없습니다.' }, { status: 404 })

  const targetUser = userRow as Pick<UserRow, 'id' | 'email' | 'username'>

  // 삭제 전 주요 보유 수량을 집계해 감사 로그·응답에 남긴다(연쇄 삭제로 이후엔 조회 불가).
  const { count: deletedActivityBadges } = await supabase
    .from('user_activity_badges')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  const { data: inventoryRow } = await supabase
    .from('inventory')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  let deletedInventoryItems = 0
  const inventory = inventoryRow as Pick<InventoryRow, 'id'> | null
  if (inventory) {
    const { count } = await supabase
      .from('inventory_items')
      .select('*', { count: 'exact', head: true })
      .eq('inventory_id', inventory.id)
    deletedInventoryItems = count ?? 0
  }

  const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId)
  if (deleteAuthError) {
    return NextResponse.json({ error: deleteAuthError.message }, { status: 500 })
  }

  console.info(
    `[admin/users/delete] userId: ${userId}, email: ${targetUser.email}, 배지: ${deletedActivityBadges ?? 0}개, 아이템: ${deletedInventoryItems}개 (by admin: ${admin.email})`
  )

  return NextResponse.json({
    deletedEmail: targetUser.email,
    deletedActivityBadges: deletedActivityBadges ?? 0,
    deletedInventoryItems,
  })
}
