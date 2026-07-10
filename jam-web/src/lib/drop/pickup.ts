/**
 * Phase 6: 드랍 픽업 로직
 * Strava 활동 경로와 활성 드랍 이벤트를 교차 검증하여 픽업 처리
 */
import { createServiceClient } from '@/lib/supabase/server'
import { isRouteNearPoi } from '@/lib/poi/matcher'
import type { DropEventRow } from '@/types/database'

/**
 * Strava 활동 경로와 활성 드랍 이벤트를 교차 검증하여 픽업 처리
 * @param userId - 유저 ID
 * @param route - [[lat, lng], ...] 경로 배열
 * @param stravaActivityId - Strava 활동 ID (기록용)
 * @returns 픽업된 드랍 이벤트 이름 목록
 */
export async function processDropPickups(
  userId: string,
  route: Array<[number, number]>,
  stravaActivityId: string
): Promise<{ picked: string[] }> {
  if (route.length === 0) return { picked: [] }

  const supabase = createServiceClient()

  // 1. 활성 드랍 이벤트 조회
  const now = new Date().toISOString()
  const { data: eventsRaw, error: eventsError } = await supabase
    .from('drop_events')
    .select('*')
    .eq('is_active', true)
    .lte('starts_at', now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)

  if (eventsError) {
    console.error('[processDropPickups] 드랍 이벤트 조회 오류:', eventsError)
    return { picked: [] }
  }

  const events = (eventsRaw ?? []) as DropEventRow[]
  // claimed_quantity < total_quantity 필터 (DB 필터 대신 코드 필터)
  const activeEvents = events.filter((e) => e.claimed_quantity < e.total_quantity)

  const picked: string[] = []

  for (const event of activeEvents) {
    // 2. 경로 교차 검증
    const inRange = isRouteNearPoi(route, event.latitude, event.longitude, event.radius_meters)
    if (!inRange) continue

    // 3. drop_claims INSERT (UNIQUE 충돌 = 이미 픽업, 무시)
    const { error: claimError } = await supabase
      .from('drop_claims')
      .insert({
        drop_event_id: event.id,
        user_id: userId,
        strava_activity_id: stravaActivityId,
      })

    if (claimError) {
      if (claimError.code === '23505') continue // 이미 픽업 — 무시
      console.error(`[processDropPickups] drop_claims INSERT 오류 (event: ${event.id}):`, claimError)
      continue
    }

    // 4. claimed_quantity += 1
    const newClaimed = event.claimed_quantity + 1
    const { error: quantityError } = await supabase
      .from('drop_events')
      .update({ claimed_quantity: newClaimed } as never)
      .eq('id', event.id)

    if (quantityError) {
      console.error(`[processDropPickups] claimed_quantity 업데이트 오류:`, quantityError)
    }

    // 4a. 수량 소진 시 비활성화
    if (newClaimed >= event.total_quantity) {
      await supabase
        .from('drop_events')
        .update({ is_active: false } as never)
        .eq('id', event.id)
    }

    // 4b. inventory_items INSERT
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    // inventory 조회
    const { data: inventoryRaw } = await supabase
      .from('inventory')
      .select('id, used_slots, max_slots')
      .eq('user_id', userId)
      .single()

    if (!inventoryRaw) {
      console.warn(`[processDropPickups] 인벤토리 없음 — userId: ${userId}`)
      picked.push(event.name)
      continue
    }

    const inv = inventoryRaw as { id: string; used_slots: number; max_slots: number }

    if (inv.used_slots >= inv.max_slots) {
      console.warn(`[processDropPickups] 인벤토리 슬롯 부족 — userId: ${userId}`)
      picked.push(event.name)
      continue
    }

    const { error: itemError } = await supabase
      .from('inventory_items')
      .insert({
        inventory_id: inv.id,
        badge_id: event.badge_id,
        obtained_by: 'drop_event',
        expires_at: expiresAt,
      })

    if (itemError) {
      console.error(`[processDropPickups] inventory_items INSERT 오류:`, itemError)
    } else {
      // inventory.used_slots += 1
      await supabase
        .from('inventory')
        .update({ used_slots: inv.used_slots + 1 } as never)
        .eq('id', inv.id)
    }

    picked.push(event.name)
    console.info(`[processDropPickups] 드랍 픽업 — userId: ${userId}, event: ${event.name}`)
  }

  return { picked }
}
