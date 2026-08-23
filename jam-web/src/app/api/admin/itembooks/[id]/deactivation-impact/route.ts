import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

/**
 * 컬렉션 비활성화 확인 모달에 표시할 영향 범위 조회 (20260823_004).
 * - badgeCount: 이 컬렉션에 소속된, 아직 소프트삭제되지 않은 배지 수
 * - holderUserCount: 그 배지들을 하나라도 보유한 distinct 유저 수
 *   (배지 타입별로 이력 테이블이 다르다 — activity/poi는 user_id 컬럼을 직접 갖고,
 *   item은 inventory_items → inventory.user_id를 거쳐야 한다)
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()

  const { data: badges, error: badgesError } = await supabase
    .from('badges')
    .select('id, type')
    .eq('item_book_id', id)
    .is('deleted_at', null)

  if (badgesError) return NextResponse.json({ error: badgesError.message }, { status: 500 })

  const badgeRows = (badges ?? []) as { id: string; type: string }[]
  const badgeCount = badgeRows.length

  const activityBadgeIds = badgeRows.filter((b) => b.type === 'activity').map((b) => b.id)
  const itemBadgeIds = badgeRows.filter((b) => b.type === 'item').map((b) => b.id)
  const poiBadgeIds = badgeRows.filter((b) => b.type === 'poi').map((b) => b.id)

  const holderUserIds = new Set<string>()

  if (activityBadgeIds.length > 0) {
    const { data, error } = await supabase
      .from('user_activity_badges')
      .select('user_id')
      .in('badge_id', activityBadgeIds)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const row of (data ?? []) as { user_id: string }[]) holderUserIds.add(row.user_id)
  }

  if (poiBadgeIds.length > 0) {
    const { data, error } = await supabase
      .from('user_poi_badge_earns')
      .select('user_id')
      .in('badge_id', poiBadgeIds)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const row of (data ?? []) as { user_id: string }[]) holderUserIds.add(row.user_id)
  }

  if (itemBadgeIds.length > 0) {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('badge_id, inventory:inventory_id(user_id)')
      .in('badge_id', itemBadgeIds)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const row of (data ?? []) as { inventory: { user_id: string } | null }[]) {
      if (row.inventory?.user_id) holderUserIds.add(row.inventory.user_id)
    }
  }

  return NextResponse.json({ badgeCount, holderUserCount: holderUserIds.size })
}
