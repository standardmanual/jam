/**
 * 미션 아이템 배지 보상을 준 뒤의 후속 처리 — 배지 포인트와 남은 칸 알림 (티켓 20261019_1313, 운영 로직 13.2절·14.1절)
 *
 * 보상 지급(`rewards.ts`)과 받지 않은 보상 받기(`/api/missions/[id]/claim`)가 같은 규칙으로 처리되도록 한 곳에 둔다.
 * 지급은 DB 함수(`mission_grant_item_rewards`·`mission_claim_item_rewards`)가 이미 끝낸 뒤라 여기서 던지지 않는다 —
 * 각 단계의 실패는 로그만 남기고 다음 단계로 간다.
 *
 * - 배지 포인트: 열린 개체는 받을 때 한 번 준다. 잠긴 개체는 주지 않는다 — 열 때 `locked_item_open`이 준다(14.1절).
 *   개체당 한 번만 주도록 개체의 `point_awarded_at`을 따른다(이미 있으면 건너뛰고, 준 뒤에 적는다).
 *   `sourceMissionId`를 함께 넘긴다: 미션 완료 소식(#22)이 보상을 이미 서술하므로 #5를 만들지 않고, 원장에서 미션 귀속이 살아난다.
 * - 남은 칸 알림: 개체를 준 직후 한 번 부른다(`notifyInventorySlotsLow`, 티켓 20261018_0056).
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { awardPoints } from '@/lib/points'
import { notifyInventorySlotsLow } from '@/lib/inventory/slotAlert'

type ServiceClient = ReturnType<typeof createServiceClient>

export interface ItemRewardFollowUpInput {
  userId: string
  missionId: string
  /** 이번에 새로 준 개체 id (`itemIds`). 비어 있으면 아무것도 하지 않는다 */
  itemIds: string[]
}

export interface ItemRewardFollowUpResult {
  /** 받은 개체 가운데 열린 것의 배지 — 이름까지 공개해도 되는 보상. 잠긴 개체는 싣지 않는다(7.3절 가림 규칙) */
  openBadges: { id: string; name: string }[]
  /** 이번 후속에서 실제로 지급한 배지 포인트 합 */
  awardedPoints: number
}

interface ItemRow {
  id: string
  badge_id: string
  locked: boolean
  point_awarded_at: string | null
}

interface BadgeRow {
  id: string
  name: string
  point_reward: number | null
}

/** 새 개체를 준 뒤 열린 개체의 배지 포인트를 주고 남은 칸 알림을 검사한다. 던지지 않는다. */
export async function followUpItemRewards(
  supabase: ServiceClient,
  input: ItemRewardFollowUpInput
): Promise<ItemRewardFollowUpResult> {
  const { userId, missionId, itemIds } = input
  const result: ItemRewardFollowUpResult = { openBadges: [], awardedPoints: 0 }
  if (itemIds.length === 0) return result

  try {
    const { data: itemRaw, error: itemError } = await supabase
      .from('inventory_items')
      .select('id, badge_id, locked, point_awarded_at')
      .in('id', itemIds)
    if (itemError) {
      console.error(`[missionItemRewardFollowUp] 개체 조회 실패 (mission: ${missionId}):`, itemError)
    } else {
      const items = (itemRaw ?? []) as ItemRow[]
      const badgeIds = [...new Set(items.map((i) => i.badge_id))]
      const { data: badgeRaw, error: badgeError } =
        badgeIds.length > 0
          ? await supabase.from('badges').select('id, name, point_reward').in('id', badgeIds)
          : { data: [], error: null }
      if (badgeError) {
        console.error(`[missionItemRewardFollowUp] 배지 조회 실패 (mission: ${missionId}):`, badgeError)
      } else {
        const badgeById = new Map(((badgeRaw ?? []) as BadgeRow[]).map((b) => [b.id, b]))
        for (const item of items) {
          // 잠긴 개체는 포인트를 주지 않고 이름도 싣지 않는다 — 열 때 한 번 주는 것은 `locked_item_open`이다
          if (item.locked) continue
          const badge = badgeById.get(item.badge_id)
          if (!badge) continue
          result.openBadges.push({ id: badge.id, name: badge.name })

          const pointReward = badge.point_reward ?? 0
          if (pointReward <= 0 || item.point_awarded_at !== null) continue
          const tx = await awardPoints(userId, pointReward, 'badge_point_reward', {
            sourceBadgeId: badge.id,
            sourceMissionId: missionId,
          })
          if (!tx) continue // 실패는 awardPoints가 로그와 engine_decision_log에 남겼다
          result.awardedPoints += pointReward
          const { error: markError } = await supabase
            .from('inventory_items')
            .update({ point_awarded_at: new Date().toISOString() })
            .eq('id', item.id)
          if (markError) {
            console.error(`[missionItemRewardFollowUp] 포인트 지급 표시 실패 (item: ${item.id}):`, markError)
          }
        }
      }
    }
  } catch (e) {
    console.error(`[missionItemRewardFollowUp] 후속 처리 예외 (mission: ${missionId}):`, e)
  }

  // 개체를 준 직후라 포인트 처리가 실패했어도 남은 칸은 줄었다. 던지지 않는다.
  await notifyInventorySlotsLow(userId, supabase)
  return result
}
