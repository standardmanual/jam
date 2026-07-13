import { createServiceClient } from '@/lib/supabase/server'

export type FeedEventType =
  | 'badge_earned'
  | 'item_dropped'
  | 'item_picked_up'
  | 'mission_joined'
  | 'mission_completed'
  | 'mission_cancelled'

export interface FeedEventMeta {
  badge_earned: { badge_id: string; badge_name: string; badge_image_url: string; rarity: string }
  item_dropped: { badge_id: string; badge_name: string; badge_image_url: string; rarity: string; poi_name: string }
  item_picked_up: { badge_id: string; badge_name: string; badge_image_url: string; rarity: string; poi_name: string; dropper_user_id: string }
  mission_joined: { mission_id: string; mission_title: string }
  mission_completed: { mission_id: string; mission_title: string; reward_type: string; reward_points: number | null }
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
