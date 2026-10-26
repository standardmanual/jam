/**
 * 아이템 배지 지급 뒤의 후속 처리 — 잼 연계 포인트와 피드 (티켓 20261017_1425 2회)
 *
 * 피드(`item_dropped`)의 칸은 `recordItemDroppedFeed` 한 곳이 정한다. 열린 채 받은 개체는 여기서, 잠긴 채 받은 개체는 연 때
 * `lib/inventory/lockedItemFill.ts`의 열기 경로가 같은 칸으로 올린다(티켓 20261026_1031).
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
  /** 잠긴 채 받은 개체인가. 잠긴 채 받으면 포인트를 주지 않고 피드에도 올리지 않는다 — 열린 상태가 될 때 한 번 준다(운영 로직 7.2절, 티켓 20261018_0051). 생략하면 열린 개체다. */
  locked?: boolean
  /**
   * 피드(`item_dropped`)를 올리지 않는다. 포인트는 그대로 준다. 캡슐을 열어 나온 아이템 배지가 쓴다 —
   * 운영 로직 15.3절 «캡슐을 열어 나온 아이템 배지는 피드에 올리지 않는다»(2026-10-10 사용자 결정, 티켓 20261021_1249 6-3 5회). 생략하면 올린다.
   */
  skipFeed?: boolean
}

/**
 * `badge.point_reward`가 있으면 포인트를 지급하고, 피드 이벤트(`item_dropped`)를 남긴다. 던지지 않는다.
 * 잠긴 채 받은 개체는 둘 다 건너뛴다 — 피드는 배지 이름·그림을 싣는 공개 기록이라 7.3절 가림 원칙에 어긋난다(티켓 20261018_0051 2회, 사용자 결정 2026-10-18).
 * 연 때의 포인트와 피드는 이 함수가 아니라 열기 경로(`openLockedItem`)가 낸다 — 포인트는 DB 함수 `locked_item_open` 안에서 주고, 피드는 `recordItemDroppedFeed`로
 * 올린다(티켓 20261026_1031). 피드는 동기화로 받은 잠긴 개체만 올린다 — 캡슐에서 나온 잠긴 개체는 열어도 올리지 않는다(발급 기록 `item_issue_log.route`로 가른다, 사용자 결정 2026-10-26).
 * `skipFeed`가 참이면 열린 개체여도 피드를 올리지 않는다(포인트는 그대로 준다).
 */
export async function recordIssuedRewards(input: IssuedRewardsInput): Promise<void> {
  const { userId, badge } = input

  // 잠긴 채 받은 개체는 포인트를 주지 않는다. 연 때 한 번 주는 것은 열기 경로(`openLockedItem`)다.
  const pointReward = input.locked ? 0 : (badge.point_reward ?? 0)
  try {
    if (pointReward > 0) await awardPoints(userId, pointReward, 'badge_point_reward', { sourceBadgeId: badge.id })
  } catch (e) {
    console.error(`[syncIssue] 포인트 지급 예외 (badge_id: ${badge.id}):`, e)
  }

  if (input.locked || input.skipFeed) return

  try {
    await recordItemDroppedFeed({
      userId,
      inventoryItemId: input.inventoryItemId,
      badge,
      rarity: input.rarity,
      tribeName: input.tribeName,
      pointReward,
      eventAt: input.startDate ?? undefined,
      stravaId: input.stravaId,
    })
  } catch (e) {
    console.error(`[syncIssue] 피드 기록 예외 (badge_id: ${badge.id}):`, e)
  }
}

export interface ItemDroppedFeedInput {
  userId: string
  inventoryItemId: string
  badge: { id: string; name: string; image_url: string | null }
  /** `badges.rarity`. 등급이 없는 배지는 null */
  rarity: string | null
  tribeName: string
  /** 이 때 실제로 지급한 포인트. 0이면 `point_reward` 칸을 싣지 않는다 */
  pointReward: number
  /** 피드 시각(UTC ISO). 생략하면 DB 기본값(지금)이다 */
  eventAt?: string
  /** 피드를 귀속할 Strava 활동. 생략하거나 null이면 활동에 묶이지 않는다 */
  stravaId?: number | null
}

/**
 * 피드 이벤트(`item_dropped`) 한 건을 올린다. 칸 이름과 값은 열린 채 받은 개체의 피드(`recordIssuedRewards`)와 잠긴 개체를 연 때의 피드(`openLockedItem`, 동기화 출처만)가 같다.
 * 포인트는 주지 않고 잠김도 보지 않는다 — 호출하는 쪽이 정한다. `recordFeedEvent`가 실패를 삼키므로 보통 던지지 않는다.
 */
export async function recordItemDroppedFeed(input: ItemDroppedFeedInput): Promise<void> {
  await recordFeedEvent(
    input.userId,
    'item_dropped',
    {
      inventory_item_id: input.inventoryItemId,
      badge_id: input.badge.id,
      badge_name: input.badge.name,
      badge_image_url: input.badge.image_url ?? '',
      rarity: input.rarity,
      poi_name: '',
      tribe_name: input.tribeName,
      is_last_piece: false,
      ...(input.pointReward > 0 ? { point_reward: input.pointReward } : {}),
    },
    input.eventAt,
    input.stravaId
  )
}
