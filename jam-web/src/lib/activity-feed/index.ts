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
    /**
     * 이 드랍으로 실제 지급된 포인트 (20260827_018).
     *
     * 드랍엔진은 예전부터 아이템배지의 `point_reward`를 awardPoints로 지급했지만
     * 피드 metadata에는 남기지 않았다. 그래서 프로필 묶음 카드가 포인트를 합산할 때
     * 아이템 배지 몫이 빠져 **알림 결산이 말한 총액보다 작은 숫자**가 나왔다
     * (RECAP_CASEBOOK R6의 착지가 알림과 어긋나는 지점).
     *
     * `badge_earned`의 동명 필드와 같은 규약이다 — 0이면 아예 싣지 않는다.
     * 이 필드가 없는 과거 행은 0으로 계산된다(백필 없음 — 컬럼과 같은 graceful degradation).
     */
    point_reward?: number
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

/**
 * 피드 이벤트 1건 기록.
 *
 * @param eventAt **4번째 인자** — Strava 활동 시작 시각(진짜 UTC인 startDate만 넣는다).
 *                생략하면 DB DEFAULT NOW().
 * @param stravaActivityId **5번째 인자**(20260827_018) — 이 이벤트가 어느 활동에서
 *                나왔는지. 프로필 피드가 같은 활동의 이벤트를 한 카드로 묶는 유일한 키다.
 *                활동 단위가 아닌 이벤트(미션 참가·픽업·미션 완료)는 넘기지 않는다 —
 *                NULL로 남아 서로 묶이지 않고 단건으로 렌더된다.
 *
 * ⚠️ 인자 순서를 바꾸거나 옵션 객체로 리팩터링하지 말 것. `types/database.ts`·
 *    `api/badges/recent-earned/route.ts`·마이그레이션 093 주석이 모두
 *    "recordFeedEvent()의 4번째 인자"라고 명시하고 있다.
 */
export async function recordFeedEvent<T extends FeedEventType>(
  userId: string,
  eventType: T,
  metadata: FeedEventMeta[T],
  eventAt?: string,
  stravaActivityId?: number | null
): Promise<void> {
  try {
    const supabase = createServiceClient()
    const q = supabase.from('user_activity_feed')
    const payload = {
      user_id: userId,
      event_type: eventType,
      metadata,
      ...(eventAt ? { event_at: eventAt } : {}),
      ...(typeof stravaActivityId === 'number' ? { strava_activity_id: stravaActivityId } : {}),
    }
    // @ts-expect-error Supabase insert/update/upsert 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 UserActivityFeedRow와 일치
    const { error } = await q.insert(payload)
    // `supabase-js`는 insert 실패에 예외를 던지지 않으므로 아래 catch로는 아무것도 잡히지
    // 않았다 — 반환 error를 직접 확인해야 한다 (티켓 20260831_1149).
    // 피드 기록 실패가 배지·드랍 발급 본 흐름을 깨뜨리면 안 되므로 흡수는 유지한다.
    if (error) {
      console.error(`[activity-feed] 피드 기록 실패 — userId: ${userId}, event: ${eventType}:`, error)
    }
  } catch (e) {
    console.error('[activity-feed] 피드 기록 중 예외:', e)
  }
}
