/**
 * 보류에서 받은 개체의 후속 처리 (티켓 20261017_1425 2회, 서버 보정 a)
 *
 * 동기화가 바로 지급한 개체는 지급 뒤에 잼 연계 포인트·피드·결산 알림이 이어진다(`lib/drop-engine/syncIssueRun.ts`).
 * 보류에서 고르기로 받은 개체도 같은 처리를 받아야 한다 — 고르기 API(`/api/strava/pending-items` POST)가 성공한 뒤에 부른다.
 *
 * 규칙
 *  - 받은 개체(`itemIds`)마다 `badge.point_reward`가 있으면 `awardPoints`, 피드 이벤트(`item_dropped`)를 남긴다. 잠긴 채 받은 개체는 둘 다 건너뛴다(티켓 20261018_0051)(`recordIssuedRewards`, 바로 지급과 공용).
 *  - 결산 알림은 활동 하나당 한 조각이다(`recordActivityRecap`, 바로 지급과 같은 모양). 잠긴 개체는 이름·등급 없이 `locked: true`로만 담는다. 활동을 모르는 개체는 결산을 만들지 않는다.
 *  - 이 함수는 던지지 않는다. 각 후속 처리의 실패는 로그만 남기고 호출부(고르기 응답)를 바꾸지 않는다.
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { recordIssuedRewards } from '@/lib/drop-engine/issueFollowUp'
import { recordActivityRecap } from '@/lib/notifications/recap'
import type { RecapItemBadge } from '@/lib/notifications/types'

interface ClaimedRow {
  source_activity_id: string | null
  badge_id: string
  rarity: 'common' | 'rare' | 'epic' | 'mystic'
  inventory_item_id: string | null
  /** 보류 때 정한 잠김. 고르기 RPC가 개체로 옮긴 값과 같다 */
  locked: boolean
}

interface BadgeRow {
  id: string
  name: string
  image_url: string | null
  point_reward: number | null
}

interface ActivityRow {
  id: string
  strava_id: number
  start_date: string
}

/** 고르기로 받은 개체(`itemIds`)의 포인트·피드·결산을 처리한다. 던지지 않는다. */
export async function runPendingFollowUps(
  supabase: SupabaseClient,
  userId: string,
  itemIds: readonly string[]
): Promise<void> {
  if (itemIds.length === 0) return
  try {
    const { data: claimedRaw, error: claimedError } = await supabase
      .from('sync_pending_items')
      .select('source_activity_id, badge_id, rarity, inventory_item_id, locked')
      .eq('user_id', userId)
      .in('inventory_item_id', [...itemIds])
    if (claimedError) throw new Error(`보류 기록 조회 실패: ${claimedError.message}`)
    const claimed = ((claimedRaw ?? []) as ClaimedRow[]).filter((r) => r.inventory_item_id)
    if (claimed.length === 0) return

    // 이미 받은 개체의 후속 처리다 — 그 사이 배지가 비활성(deleted_at)이 됐어도 포인트·피드는 남겨야 하므로 deleted_at으로 거르지 않는다.
    const badgeIds = [...new Set(claimed.map((r) => r.badge_id))]
    const { data: badgeRaw, error: badgeError } = await supabase
      .from('badges')
      .select('id, name, image_url, point_reward')
      .in('id', badgeIds)
    if (badgeError) throw new Error(`배지 조회 실패: ${badgeError.message}`)
    const badgeById = new Map(((badgeRaw ?? []) as BadgeRow[]).map((b) => [b.id, b]))

    const activityIds = [...new Set(claimed.map((r) => r.source_activity_id).filter((id): id is string => Boolean(id)))]
    const activityById = new Map<string, ActivityRow>()
    if (activityIds.length > 0) {
      const { data: activityRaw, error: activityError } = await supabase
        .from('strava_activities')
        .select('id, strava_id, start_date')
        .in('id', activityIds)
      // 활동을 읽지 못해도 포인트·피드는 만든다(피드는 현재 시각으로 남는다). 결산만 건너뛴다.
      if (activityError) console.error(`[pendingFollowUps] 활동 조회 실패 (userId: ${userId}):`, activityError)
      for (const a of (activityRaw ?? []) as ActivityRow[]) activityById.set(a.id, a)
    }

    let tribeName = ''
    try {
      const { data: userRow } = await supabase.from('users').select('tribe_id').eq('id', userId).maybeSingle()
      const tribeId = (userRow as { tribe_id?: string | null } | null)?.tribe_id ?? null
      if (tribeId) {
        const { data: tribeRow } = await supabase.from('tribes').select('name').eq('id', tribeId).maybeSingle()
        tribeName = (tribeRow as { name?: string } | null)?.name ?? ''
      }
    } catch (e) {
      console.error(`[pendingFollowUps] 트라이브 조회 실패 (userId: ${userId}):`, e)
    }

    const recapByStravaId = new Map<number, RecapItemBadge[]>()
    for (const row of claimed) {
      const badge = badgeById.get(row.badge_id)
      const itemId = row.inventory_item_id
      if (!badge || !itemId) continue
      const activity = row.source_activity_id ? activityById.get(row.source_activity_id) : undefined

      await recordIssuedRewards({
        userId,
        stravaId: activity?.strava_id ?? null,
        startDate: activity?.start_date ?? null,
        tribeName,
        inventoryItemId: itemId,
        badge,
        rarity: row.rarity,
        locked: row.locked === true,
      })

      if (activity) {
        const list = recapByStravaId.get(activity.strava_id) ?? []
        // 잠긴 채 받은 개체는 결산 알림에 이름·등급을 싣지 않는다(운영 로직 7.3절, 티켓 20261018_0051)
        list.push(
          row.locked === true
            ? { inventory_item_id: itemId, badge_id: '', name: '', rarity: null, locked: true }
            : { inventory_item_id: itemId, badge_id: badge.id, name: badge.name, rarity: row.rarity }
        )
        recapByStravaId.set(activity.strava_id, list)
      }
    }

    for (const [stravaId, itemBadges] of recapByStravaId) {
      try {
        await recordActivityRecap(userId, { activity_ids: [stravaId], item_badges: itemBadges })
      } catch (e) {
        console.error(`[pendingFollowUps] 결산 알림 기록 실패 (userId: ${userId}):`, e)
      }
    }
  } catch (e) {
    console.error(`[pendingFollowUps] 후속 처리 실패 (userId: ${userId}):`, e)
  }
}
