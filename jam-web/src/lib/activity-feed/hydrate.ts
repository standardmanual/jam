/**
 * 피드 배지 정보 실시간 리프레시 (서버 전용)
 *
 * user_activity_feed.metadata는 기록 시점의 배지 스냅샷(이름·이미지·등급)을
 * 그대로 저장한다. 이후 배지 이미지를 일괄 재배정하거나 이름을 고쳐도 이미
 * 기록된 과거 피드 항목은 그 스냅샷을 계속 보여줘 "피드만 개선사항이 반영되지
 * 않는" 문제가 반복됐다 (실사례: 배지 이미지 일괄 배정 후에도 피드는 여전히 404).
 *
 * 근본 해결: badge_id는 절대 바뀌지 않으므로, 렌더링 직전 badge_id로 badges를
 * 다시 조인해 name/image_url/rarity를 항상 최신값으로 덮어쓴다. 이후 어떤
 * 배지 수정이든 백필 마이그레이션 없이 다음 페이지 로드부터 자동 반영된다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { ActivityFeedRow, ActivityFeedEventType } from '@/types/database'

const BADGE_METADATA_EVENTS = new Set<ActivityFeedEventType>(['badge_earned', 'item_dropped', 'item_picked_up'])

export async function hydrateFeedBadgeInfo(items: ActivityFeedRow[]): Promise<ActivityFeedRow[]> {
  const badgeIds = new Set<string>()
  for (const item of items) {
    if (!BADGE_METADATA_EVENTS.has(item.event_type)) continue
    const id = (item.metadata as Record<string, unknown>).badge_id
    if (typeof id === 'string') badgeIds.add(id)
  }
  if (badgeIds.size === 0) return items

  const supabase = createServiceClient()
  const { data } = await supabase.from('badges').select('id, name, image_url, rarity').in('id', [...badgeIds])

  const badgeMap = new Map(
    ((data ?? []) as { id: string; name: string; image_url: string | null; rarity: string }[]).map((b) => [b.id, b])
  )
  if (badgeMap.size === 0) return items

  return items.map((item) => {
    if (!BADGE_METADATA_EVENTS.has(item.event_type)) return item
    const meta = item.metadata as Record<string, unknown>
    const badgeId = meta.badge_id
    const live = typeof badgeId === 'string' ? badgeMap.get(badgeId) : undefined
    if (!live) return item
    return {
      ...item,
      metadata: {
        ...meta,
        badge_name: live.name,
        badge_image_url: live.image_url ?? '',
        rarity: live.rarity,
      },
    }
  })
}
