/**
 * Phase 13: 미션 보상 지급 (서버 사이드 전용)
 *
 * 완료 판정 직후 호출. 배지 타입(badges.type)에 따라 지급 테이블이 갈린다.
 *  - activity 배지 → user_activity_badges
 *  - item 배지     → inventory / inventory_items (슬롯 관리)
 * 배지 자체 포인트(point_reward)와 미션 포인트(reward_points)를 별개 사유로 지급한다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import { awardPoints } from '@/lib/points'
import type { MissionRow } from '@/types/database'

export interface MissionRewardResult {
  awardedBadgeIds: string[]
  awardedBadgeNames: string[]
  /** 배지 자체 포인트 합 + 미션 포인트 — 피드/화면 표시용 */
  totalAwardedPoints: number
}

type RewardMission = Pick<MissionRow, 'id' | 'reward_badge_ids' | 'reward_points'>

/**
 * 미션 완료 시 설정된 보상을 전부 지급.
 * - 배지: 타입별 테이블 분기, 이미 보유(activity) / 슬롯 부족(item) 시 조용히 skip
 * - 포인트: 지급된 배지의 point_reward 개별 지급 + 미션 reward_points 추가 지급
 */
export async function grantMissionRewards(
  userId: string,
  mission: RewardMission
): Promise<MissionRewardResult> {
  const supabase = createServiceClient()

  const badgeIds = mission.reward_badge_ids ?? []
  const awardedBadgeIds: string[] = []
  const awardedBadgeNames: string[] = []
  let totalAwardedPoints = 0

  if (badgeIds.length > 0) {
    // 1. 보상 배지 정보 조회
    const { data: badgesRaw } = await supabase
      .from('badges')
      .select('id, name, type, point_reward')
      .in('id', badgeIds)
    const badges = (badgesRaw ?? []) as { id: string; name: string; type: 'activity' | 'item'; point_reward: number }[]

    // 유저의 기존 활동배지 보유 목록 (중복 지급 방지)
    const { data: ownedRaw } = await supabase
      .from('user_activity_badges')
      .select('badge_id')
      .eq('user_id', userId)
    const ownedActivityBadgeIds = new Set((ownedRaw ?? []).map((r: { badge_id: string }) => r.badge_id))

    // 인벤토리 조회 (아이템배지 지급용) — 필요할 때만
    const hasItemBadge = badges.some((b) => b.type === 'item')
    let inventory: { id: string; used_slots: number; max_slots: number } | null = null
    const ownedInventoryBadgeIds = new Set<string>()
    if (hasItemBadge) {
      const { data: invRaw } = await supabase
        .from('inventory')
        .select('id, used_slots, max_slots, inventory_items(badge_id)')
        .eq('user_id', userId)
        .maybeSingle()
      if (invRaw) {
        const inv = invRaw as { id: string; used_slots: number; max_slots: number; inventory_items?: { badge_id: string }[] }
        inventory = { id: inv.id, used_slots: inv.used_slots, max_slots: inv.max_slots }
        ;(inv.inventory_items ?? []).forEach((it) => ownedInventoryBadgeIds.add(it.badge_id))
      }
    }

    for (const badge of badges) {
      let granted = false

      if (badge.type === 'activity') {
        if (ownedActivityBadgeIds.has(badge.id)) continue // 이미 보유 → skip
        const { error } = await supabase
          .from('user_activity_badges')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({ user_id: userId, badge_id: badge.id, triggered_by: `mission_reward:${mission.id}` } as any)
        if (error) {
          if (error.code === '23505') continue
          console.error(`[grantMissionRewards] 활동배지 지급 오류 (badge: ${badge.id}):`, error)
          continue
        }
        ownedActivityBadgeIds.add(badge.id)
        granted = true
      } else {
        // item 배지 → inventory
        if (!inventory) continue // 인벤토리 없음
        if (ownedInventoryBadgeIds.has(badge.id)) continue // 이미 보유 → skip
        if (inventory.used_slots >= inventory.max_slots) continue // 슬롯 부족 → skip
        const { error } = await supabase
          .from('inventory_items')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({ inventory_id: inventory.id, badge_id: badge.id, obtained_by: 'system_event' } as any)
        if (error) {
          console.error(`[grantMissionRewards] 아이템배지 지급 오류 (badge: ${badge.id}):`, error)
          continue
        }
        await supabase
          .from('inventory')
          .update({ used_slots: inventory.used_slots + 1 } as never)
          .eq('id', inventory.id)
        inventory.used_slots += 1
        ownedInventoryBadgeIds.add(badge.id)
        granted = true
      }

      if (granted) {
        awardedBadgeIds.push(badge.id)
        awardedBadgeNames.push(badge.name)
        // 배지 자체 포인트 지급 (badge-engine/drop-engine과 동일하게 코드에서 명시적 재현)
        const pr = badge.point_reward ?? 0
        if (pr > 0) {
          await awardPoints(userId, pr, 'badge_point_reward', { sourceBadgeId: badge.id })
          totalAwardedPoints += pr
        }
      }
    }
  }

  // 미션 자체 포인트 — 배지 포인트와 별개 사유로 추가 지급
  const missionPoints = mission.reward_points ?? 0
  if (missionPoints > 0) {
    await awardPoints(userId, missionPoints, 'mission_point_reward', { sourceMissionId: mission.id })
    totalAwardedPoints += missionPoints
  }

  return { awardedBadgeIds, awardedBadgeNames, totalAwardedPoints }
}
