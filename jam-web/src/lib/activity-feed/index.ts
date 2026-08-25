import { createServiceClient } from '@/lib/supabase/server'

export type FeedEventType =
  | 'badge_earned'
  | 'item_dropped'
  | 'item_picked_up'
  | 'mission_joined'
  | 'mission_completed'
  | 'mission_cancelled'

export interface FeedEventMeta {
  badge_earned: {
    badge_id: string
    badge_name: string
    badge_image_url: string
    rarity: string
    point_reward?: number
    /**
     * 체크인 배지에서만 채워짐 — 체크인한 지점 이름.
     *
     * 체크인 배지는 별도 feed_event_type이 아니라 badge_earned로 기록된다.
     * `poi_name` + `visit_count`가 둘 다 있으면 "이 badge_earned는 체크인"이라는 뜻이고,
     * FeedSection이 그때만 문장형 문구("체크인 했어요")로 분기한다(20260826_004).
     * 활동 배지 등 체크인과 무관한 badge_earned에는 없다.
     */
    poi_name?: string
    /** 체크인 배지에서만 채워짐 — 이 유저가 이 badge_id를 총 몇 번째 획득했는지.
     *  1이면 "체크인 했어요", 2 이상이면 "{N}번째 체크인 했어요". */
    visit_count?: number
  }
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
  metadata: FeedEventMeta[T],
  eventAt?: string
): Promise<void> {
  try {
    const supabase = createServiceClient()
    const q = supabase.from('user_activity_feed')
    const payload = {
      user_id: userId,
      event_type: eventType,
      metadata,
      ...(eventAt ? { event_at: eventAt } : {}),
    }
    // @ts-expect-error Supabase insert/update/upsert 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 UserActivityFeedRow와 일치
    await q.insert(payload)
  } catch (e) {
    console.error('[activity-feed] 피드 기록 실패:', e)
  }
}
