/**
 * 캡슐 열기 결과 → 획득 연출 항목 (티켓 20261018_0054 1회)
 *
 * 열린 채 나온 개체는 이름·그림·등급을, 잠긴 채 나온 개체는 등급과 여는 데 필요한 양만 싣는다(운영 로직 7.3절).
 * 잠긴 개체는 이름·그림을 처음부터 항목에 넣지 않는다 — `BadgeRevealOverlay`가 가린 문구와 잠금 타일로 그린다.
 */
import type { RevealBadge } from '@/components/BadgeRevealOverlay'
import type { CapsuleChapterBadge, CapsuleOpenedItem } from '@/lib/capsule/capsule-contract'
import type { CapsuleResultReward } from '@/lib/capsule/result-overlay-model'

export function toRevealBadges(items: readonly CapsuleOpenedItem[]): RevealBadge[] {
  return items.map((item): RevealBadge => {
    if (item.locked) {
      return { id: item.inventoryItemId, name: '', description: '', rarity: item.rarity, locked: true, unlockRequired: item.unlockRequired }
    }
    return { id: item.inventoryItemId, name: item.name, description: '', imageUrl: item.imageUrl, rarity: item.rarity }
  })
}

/**
 * 챕터 배지 → 획득 연출 항목 (티켓 20261028_1740 3회)
 *
 * 합친 연출의 보상 화면에 싣는 챕터 배지는 서버가 이미 받은 것만 내려준다(`CapsuleChapterBadge`). 이름·설명·그림·등급·레벨을 그대로 옮긴다.
 * 등급과 레벨은 배타적이라 `RevealBadge`의 설명대로 레벨이 있으면 캐러셀이 레벨 칩을 그린다.
 */
export function toChapterRevealBadge(badge: CapsuleChapterBadge): RevealBadge {
  return {
    id: badge.id,
    name: badge.name,
    description: badge.description,
    imageUrl: badge.imageUrl,
    rarity: badge.rarity,
    level: badge.level,
  }
}

/** 합친 연출의 보상 목록(`CapsuleResultView.rewards`)을 순서 그대로 획득 연출 항목으로 옮긴다. 개체는 이벤트 순서, 챕터 배지는 맨 끝이다 */
export function toRevealRewards(rewards: readonly CapsuleResultReward<CapsuleOpenedItem, CapsuleChapterBadge>[]): RevealBadge[] {
  return rewards.flatMap((reward): RevealBadge[] => (reward.kind === 'item' ? toRevealBadges([reward.item]) : [toChapterRevealBadge(reward.badge)]))
}
