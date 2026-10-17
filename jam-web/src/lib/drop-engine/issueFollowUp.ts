/**
 * 아이템 배지 지급 뒤의 후속 처리 — 잼 연계 포인트와 피드 (티켓 20261017_1425 2회)
 *
 * 동기화가 바로 지급한 개체(`syncIssueRun.ts`)와 고르기로 보류에서 받은 개체(`lib/strava/pending-followups.ts`)가
 * 같은 규칙으로 처리되도록 한 곳에 둔다. 지급은 이미 끝난 뒤라 여기서 던지지 않는다 — 각 단계의 실패는 로그만 남기고 다음 단계로 간다.
 * 포인트 규칙은 옛 지급과 같다(`badge.point_reward`가 있으면 1회 지급).
 *
 * 서버 전용이다. 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 */
import { recordFeedEvent } from '@/lib/activity-feed'
import { awardPoints } from '@/lib/points'

export interface IssuedRewardsInput {
  userId: string
  /** 피드를 귀속할 Strava 활동. 모르면 null(피드는 현재 시각으로 남는다) */
  stravaId: number | null
  /** 활동 시작 시각(UTC ISO). 모르면 null */
  startDate: string | null
  tribeName: string
  inventoryItemId: string
  badge: { id: string; name: string; image_url: string | null; point_reward: number | null }
  rarity: 'common' | 'rare' | 'epic' | 'mystic'
  /** 잠긴 채 받은 개체인가. 잠긴 채 받으면 포인트를 주지 않는다 — 열린 상태가 될 때 한 번 준다(운영 로직 7.2절, 티켓 20261018_0051). 생략하면 열린 개체다. */
  locked?: boolean
}

/** `badge.point_reward`가 있으면(잠긴 개체는 제외) 포인트를 지급하고, 피드 이벤트(`item_dropped`)를 남긴다. 던지지 않는다. */
export async function recordIssuedRewards(input: IssuedRewardsInput): Promise<void> {
  const { userId, badge } = input

  // 잠긴 채 받은 개체는 포인트를 주지 않는다. 연 때 한 번 주는 것은 3-3이 만든다.
  const pointReward = input.locked ? 0 : (badge.point_reward ?? 0)
  try {
    if (pointReward > 0) await awardPoints(userId, pointReward, 'badge_point_reward', { sourceBadgeId: badge.id })
  } catch (e) {
    console.error(`[syncIssue] 포인트 지급 예외 (badge_id: ${badge.id}):`, e)
  }

  try {
    await recordFeedEvent(
      userId,
      'item_dropped',
      {
        inventory_item_id: input.inventoryItemId,
        badge_id: badge.id,
        badge_name: badge.name,
        badge_image_url: badge.image_url ?? '',
        rarity: input.rarity,
        poi_name: '',
        tribe_name: input.tribeName,
        is_last_piece: false,
        ...(pointReward > 0 ? { point_reward: pointReward } : {}),
      },
      input.startDate ?? undefined,
      input.stravaId
    )
  } catch (e) {
    console.error(`[syncIssue] 피드 기록 예외 (badge_id: ${badge.id}):`, e)
  }
}
