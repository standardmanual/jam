/**
 * 믹스 결과로 받은 아이템 배지의 배지 포인트 (티켓 20261019_1314 2회, 운영 로직 14.1절)
 *
 * 믹스 성공 결과(`combine_grant_results`, 마이그레이션 236)와 받지 않은 결과 받기(`combine_claim_pending`)는 개체만 만들고
 * 포인트는 주지 않는다. 14.1절은 아이템 배지의 포인트를 «열린 상태가 될 때 일련번호마다 한 번»으로 정하므로, 새 개체를 준 직후
 * 이 함수를 불러 열린 개체에 한해 `badges.point_reward`를 준다.
 *
 * - 열린 개체: 받을 때 한 번 준다. 개체의 `point_awarded_at`이 비어 있을 때만 주고, 준 뒤에 적는다
 *   (`lib/missions/itemRewardFollowUp.ts`와 `lib/drop-engine/issueFollowUp.ts`와 같은 패턴).
 * - 잠긴 개체: 주지 않는다. 열 때 `locked_item_open`(마이그레이션 235)이 일련번호당 한 번 준다.
 * - 믹스의 레시피 보상 포인트(`combine_recipe_reward`)와 실패 보상(`combine_fail_reward`)은 이 함수와 무관하다.
 *
 * 지급은 DB 함수가 이미 끝낸 뒤라 여기서 던지지 않는다 — 실패는 로그만 남기고 믹스 응답·받기 응답을 되돌리지 않는다.
 * 포인트가 실패한 개체는 `point_awarded_at`을 적지 않는다(`awardPoints`가 로그와 `engine_decision_log`에 남긴다).
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { awardPoints } from '@/lib/points'

type ServiceClient = ReturnType<typeof createServiceClient>

interface ItemRow {
  id: string
  badge_id: string
  locked: boolean
  point_awarded_at: string | null
}

interface BadgeRow {
  id: string
  point_reward: number | null
}

/** 새로 준 개체(`itemIds`) 가운데 열린 개체의 배지 포인트를 한 번씩 준다. 던지지 않는다. */
export async function followUpCombineResultPoints(
  supabase: ServiceClient,
  userId: string,
  itemIds: string[]
): Promise<void> {
  if (itemIds.length === 0) return

  try {
    const { data: itemRaw, error: itemError } = await supabase
      .from('inventory_items')
      .select('id, badge_id, locked, point_awarded_at')
      .in('id', itemIds)
    if (itemError) {
      console.error(`[combineResultPoints] 개체 조회 실패 (user: ${userId}):`, itemError)
      return
    }

    // 잠긴 개체는 열 때 주므로 읽을 배지에서도 뺀다
    const openItems = ((itemRaw ?? []) as ItemRow[]).filter((i) => !i.locked && i.point_awarded_at === null)
    if (openItems.length === 0) return

    // 삭제된 배지(`deleted_at`)는 지급 함수가 이미 걸렀다. 여기서는 방금 받은 개체의 배지 포인트만 읽으므로 삭제 필터를 걸지 않는다.
    const badgeIds = [...new Set(openItems.map((i) => i.badge_id))]
    const { data: badgeRaw, error: badgeError } = await supabase
      .from('badges')
      .select('id, point_reward')
      .in('id', badgeIds)
    if (badgeError) {
      console.error(`[combineResultPoints] 배지 조회 실패 (user: ${userId}):`, badgeError)
      return
    }
    const pointRewardByBadge = new Map(((badgeRaw ?? []) as BadgeRow[]).map((b) => [b.id, b.point_reward ?? 0]))

    for (const item of openItems) {
      const pointReward = pointRewardByBadge.get(item.badge_id) ?? 0
      if (pointReward <= 0) continue
      const tx = await awardPoints(userId, pointReward, 'badge_point_reward', { sourceBadgeId: item.badge_id })
      if (!tx) continue // 실패는 awardPoints가 로그와 engine_decision_log에 남겼다
      const { error: markError } = await supabase
        .from('inventory_items')
        .update({ point_awarded_at: new Date().toISOString() })
        .eq('id', item.id)
      if (markError) {
        console.error(`[combineResultPoints] 포인트 지급 표시 실패 (item: ${item.id}):`, markError)
      }
    }
  } catch (e) {
    console.error(`[combineResultPoints] 후속 처리 예외 (user: ${userId}):`, e)
  }
}
