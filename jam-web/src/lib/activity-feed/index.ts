import { createServiceClient } from '@/lib/supabase/server'

export type FeedEventType =
  | 'badge_earned'
  | 'item_dropped'
  | 'item_picked_up'
  | 'mission_joined'
  | 'mission_completed'
  | 'mission_cancelled'

export interface FeedEventMeta {
  badge_earned: { badge_id: string; badge_name: string; badge_image_url: string; rarity: string; point_reward?: number }
  item_dropped: {
    badge_id: string
    badge_name: string
    badge_image_url: string
    rarity: string
    poi_name: string
    /** 드랍엔진 v2: 드랍된 배지의 세계관 이름 (레거시 이벤트에는 없음) */
    faction_name?: string
    /** 드랍엔진 v2: 아이템북 마지막 파편 여부 */
    is_last_piece?: boolean
    /** inventory_items.id — 홈/프로필 피드가 inventory_items를 다시 훑어 "레거시" 항목을
     *  합성할 때 이 값으로 이미 실기록된 드랍인지 판별해 중복 표시를 막는다. */
    inventory_item_id?: string
  }
  item_picked_up: {
    badge_id: string
    badge_name: string
    badge_image_url: string
    rarity: string
    poi_name: string
    /** 앰비언트(시스템) 드랍 픽업이면 null */
    dropper_user_id: string | null
    /** poi_drops.id — 홈/프로필 피드의 poi_drops 재구성 중복 방지용 */
    poi_drop_id?: string
  }
  mission_joined: { mission_id: string; mission_title: string }
  mission_completed: {
    mission_id: string
    mission_title: string
    /** 실제 지급된 총 포인트(배지 자체 포인트 + 미션 포인트). null이면 없음 */
    reward_points: number | null
    /** 실제 지급된 배지 id 목록 (Phase13) */
    awarded_badge_ids: string[]
    /** 표시용 배지 이름 목록 (Phase13) */
    awarded_badge_names: string[]
    /** 완료 시점 진행값 — "결과 요약"용 (Phase13) */
    final_progress_value: number
    /** 완료 당시 목표치 스냅샷 (Phase13) */
    target_value: number
  }
  mission_cancelled: { mission_id: string; mission_title: string }
}

export async function recordFeedEvent<T extends FeedEventType>(
  userId: string,
  eventType: T,
  metadata: FeedEventMeta[T]
): Promise<void> {
  try {
    const supabase = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('user_activity_feed').insert({
      user_id: userId,
      event_type: eventType,
      metadata,
    })
  } catch (e) {
    console.error('[activity-feed] 피드 기록 실패:', e)
  }
}
