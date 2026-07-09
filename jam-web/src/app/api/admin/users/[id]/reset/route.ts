import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import type { InventoryRow } from '@/types/database'

/**
 * 유저가 보유한 배지·아이템 전체 초기화 (시뮬레이터 반복 테스트용)
 * - user_activity_badges 전체 삭제 (아이템북 보상 배지 포함)
 * - inventory_items 전체 삭제 + inventory.used_slots 0으로 리셋
 * - users, strava_connections 등 계정/연동 정보는 건드리지 않음
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: userId } = await params
  const supabase = createServiceClient()

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (userError) return NextResponse.json({ error: userError.message }, { status: 500 })
  if (!userRow) return NextResponse.json({ error: '유저를 찾을 수 없습니다.' }, { status: 404 })

  // 1. 액티비티 배지 전체 삭제 (아이템북 보상 배지 포함)
  const { count: deletedBadgeCount, error: badgeDeleteError } = await supabase
    .from('user_activity_badges')
    .delete({ count: 'exact' })
    .eq('user_id', userId)

  if (badgeDeleteError) {
    return NextResponse.json({ error: badgeDeleteError.message }, { status: 500 })
  }

  // 2. 인벤토리 아이템 전체 삭제 + 슬롯 리셋
  const { data: inventoryRaw, error: inventoryError } = await supabase
    .from('inventory')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  const inventory = inventoryRaw as Pick<InventoryRow, 'id'> | null

  if (inventoryError) return NextResponse.json({ error: inventoryError.message }, { status: 500 })

  let deletedItemCount = 0

  if (inventory) {
    const { count, error: itemDeleteError } = await supabase
      .from('inventory_items')
      .delete({ count: 'exact' })
      .eq('inventory_id', inventory.id)

    if (itemDeleteError) return NextResponse.json({ error: itemDeleteError.message }, { status: 500 })
    deletedItemCount = count ?? 0

    const { error: updateError } = await supabase
      .from('inventory')
      // @ts-expect-error Supabase 타입 추론 제한 우회
      .update({ used_slots: 0 })
      .eq('id', inventory.id)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  console.info(
    `[admin/users/reset] userId: ${userId}, 삭제된 배지: ${deletedBadgeCount ?? 0}개, 삭제된 아이템: ${deletedItemCount}개 (by admin: ${admin.email})`
  )

  return NextResponse.json({
    deletedActivityBadges: deletedBadgeCount ?? 0,
    deletedInventoryItems: deletedItemCount,
  })
}
