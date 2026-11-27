/**
 * 챕터 오름 보상 지급 뒤 후속 처리 (티켓 20261127_1731 C3a)
 *
 * 지급(인벤토리에 넣기)이 확정된 뒤에 개체마다 `recordIssuedRewards`(포인트)를 부른다. 호출은 C3b(지급 연결)가 한다.
 * 잠긴 개체는 포인트에서 빠진다(`locked`를 넘긴다). **보상으로 나온 아이템 배지는 피드에 올리지 않는다** — 캡슐과 같은 규칙으로 `skipFeed: true`다.
 * 후속 처리가 던져도 지급은 유지하고 로그만 남긴다. 던지지 않는다.
 * 옛 캡슐의 `recordOpenedItems`에서 응답 모양 변환을 뺀 것이다. 이 파일은 `lib/capsule/*`를 가져오지 않는다. 서버 전용이다.
 */
import { recordIssuedRewards } from '@/lib/drop-engine/issueFollowUp'
import type { RolledChapterRewardItem } from './roll'
import type { ChapterRewardBadge } from './stored'

/** DB 함수가 돌려준 지급 결과 한 칸 — 추첨 결과와 같은 순서다 */
export interface GrantedChapterRewardItem {
  inventoryItemId?: string
  serialNumber?: number | null
}

export async function recordChapterRewardItems(
  userId: string,
  tribes: readonly { id: string; name: string }[],
  items: readonly RolledChapterRewardItem<ChapterRewardBadge>[],
  dbItems: readonly GrantedChapterRewardItem[]
): Promise<void> {
  const tribeNameOf = new Map(tribes.map((t) => [t.id, t.name]))
  for (const [index, planned] of items.entries()) {
    const db = dbItems[index] ?? {}
    if (!db.inventoryItemId) continue
    try {
      await recordIssuedRewards({
        userId,
        stravaId: null,
        startDate: null,
        tribeName: tribeNameOf.get(planned.tribeId) ?? '',
        inventoryItemId: db.inventoryItemId,
        badge: planned.badge,
        rarity: planned.rarity,
        locked: planned.lock.locked,
        skipFeed: true,
      })
    } catch (e) {
      console.error(`[chapter-reward] 후속 처리 실패 — 지급은 유지한다 (userId: ${userId}, badge_id: ${planned.badge.id}):`, e)
    }
  }
}
