import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import type { InventoryRow } from '@/types/database'

/**
 * 유저 전체 초기화 (시뮬레이터 반복 테스트용)
 * 유지: users 계정, strava_connections 행(토큰·연동 상태)
 * 삭제: 활동·배지·아이템·미션·피드·POI드랍·팔로우·드랍상태·아이템북완성 전체
 * 초기화: initial_sync_done=false + strava last_synced_at=NULL
 *         → 다음 싱크가 "최초 연동"처럼 과거 이력 전체를 다시 불러온다 (연동은 유지)
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: userId } = await params
  const supabase = createServiceClient()

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('id, initial_sync_done')
    .eq('id', userId)
    .maybeSingle()

  if (userError) return NextResponse.json({ error: userError.message }, { status: 500 })
  if (!userRow) return NextResponse.json({ error: '유저를 찾을 수 없습니다.' }, { status: 404 })

  // ── 1단계: 인벤토리 아이템 먼저 삭제 (poi_drops.id를 drop_id FK로 참조하므로 선행 필요) ──
  const { data: inventoryRaw, error: inventoryError } = await supabase
    .from('inventory')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (inventoryError) return NextResponse.json({ error: inventoryError.message }, { status: 500 })

  const inventory = inventoryRaw as Pick<InventoryRow, 'id'> | null
  let deletedItemCount = 0

  if (inventory) {
    const [{ count, error: itemErr }, { error: slotErr }] = await Promise.all([
      supabase.from('inventory_items').delete({ count: 'exact' }).eq('inventory_id', inventory.id),
      // @ts-expect-error Supabase 타입 추론 제한 우회
      supabase.from('inventory').update({ used_slots: 0 }).eq('id', inventory.id),
    ])
    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 })
    if (slotErr) return NextResponse.json({ error: slotErr.message }, { status: 500 })
    deletedItemCount = count ?? 0
  }

  // ── 2단계: 병렬 삭제 (inventory_items 제거 후 poi_drops 삭제 안전) ─────────
  const [
    { count: deletedBadgeCount, error: e1 },
    { error: e2 },
    { error: e3 },
    { error: e4 },
    { error: e5 },
    { error: e6 },
    { error: e7 },
    { error: e8 },
  ] = await Promise.all([
    // 배지 기록
    supabase.from('user_activity_badges').delete({ count: 'exact' }).eq('user_id', userId),
    // 활동 피드 전체
    supabase.from('user_activity_feed').delete().eq('user_id', userId),
    // 이 유저가 드랍한 POI 배지 행 삭제
    supabase.from('poi_drops').delete().eq('dropper_user_id', userId),
    // 이 유저가 픽업한 POI 배지 → 픽업 정보 초기화 (행은 유지)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('poi_drops').update({ picked_up_by: null, picked_up_at: null, is_available: true }).eq('picked_up_by', userId),
    // 미션 완료 기록
    supabase.from('user_mission_completions').delete().eq('user_id', userId),
    // 미션 참여 기록
    supabase.from('user_mission_participations').delete().eq('user_id', userId),
    // 이 유저가 팔로우한 관계
    supabase.from('user_follows').delete().eq('follower_id', userId),
    // 이 유저를 팔로우한 관계
    supabase.from('user_follows').delete().eq('following_id', userId),
  ])

  const parallelError = e1 ?? e2 ?? e3 ?? e4 ?? e5 ?? e6 ?? e7 ?? e8
  if (parallelError) return NextResponse.json({ error: parallelError.message }, { status: 500 })

  // ── 3단계: 드랍엔진 v2 상태 + 아이템북 완성 기록 삭제 ─────────
  // (user_item_book_slots는 inventory_items ON DELETE CASCADE로 이미 정리됨)
  const [{ error: e9 }, { error: e10 }] = await Promise.all([
    supabase.from('user_drop_state').delete().eq('user_id', userId),
    supabase.from('user_item_book_completions').delete().eq('user_id', userId),
  ])
  const stateError = e9 ?? e10
  if (stateError) return NextResponse.json({ error: stateError.message }, { status: 500 })

  // ── 4단계: 싱크 이력 초기화 (연동 자체는 유지) ─────────
  // initial_sync_done=false + last_synced_at=NULL → 다음 싱크가 최초 연동처럼 전체 이력 재수집
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('users') as any).update({ initial_sync_done: false }).eq('id', userId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: stravaError } = await (supabase.from('strava_connections') as any)
    .update({ last_synced_at: null, backfill_completed: false })
    .eq('user_id', userId)
  if (stravaError) return NextResponse.json({ error: stravaError.message }, { status: 500 })

  console.info(
    `[admin/users/reset] userId: ${userId}, 배지: ${deletedBadgeCount ?? 0}개, 아이템: ${deletedItemCount}개 (by admin: ${admin.email})`
  )

  return NextResponse.json({
    deletedActivityBadges: deletedBadgeCount ?? 0,
    deletedInventoryItems: deletedItemCount,
  })
}
