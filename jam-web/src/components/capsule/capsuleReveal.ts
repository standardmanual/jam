/**
 * 캡슐 열기 결과 → 획득 연출 항목 (티켓 20261018_0054 1회)
 *
 * 열린 채 나온 개체는 이름·그림·등급을, 잠긴 채 나온 개체는 등급과 여는 데 필요한 양만 싣는다(운영 로직 7.3절).
 * 잠긴 개체는 이름·그림을 처음부터 항목에 넣지 않는다 — `BadgeRevealOverlay`가 가린 문구와 잠금 타일로 그린다.
 */
import type { RevealBadge } from '@/components/BadgeRevealOverlay'
import type { CapsuleOpenedItem } from '@/lib/capsule/capsule-contract'

export function toRevealBadges(items: readonly CapsuleOpenedItem[]): RevealBadge[] {
  return items.map((item): RevealBadge => {
    if (item.locked) {
      return { id: item.inventoryItemId, name: '', description: '', rarity: item.rarity, locked: true, unlockRequired: item.unlockRequired }
    }
    return { id: item.inventoryItemId, name: item.name, description: '', imageUrl: item.imageUrl, rarity: item.rarity }
  })
}
