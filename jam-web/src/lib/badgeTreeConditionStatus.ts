import type { BadgeTreeGateGroup } from '@/lib/badgeTree'

/**
 * 배지 트리(`/badges/tree`) 눈금 상태 판정 — 티켓 20260903_2329, 20260905_0037(게이트 그룹화).
 *
 * **클라이언트 세이프 파일이다.** 트리 화면의 'use client' 컴포넌트가 이 파일을 직접
 * import하므로, 서버 전용 코드(`next/headers`를 물고 있는 `@/lib/supabase/server` →
 * `@/lib/badge-engine`)를 여기서 절대 import하지 않는다 — 실제로 처음엔 `checkCondition`
 * (badge-engine)까지 한 파일에 뒀다가 `next build`가 "클라이언트 번들이 next/headers를
 * 물고 있다"로 즉시 잡아냈다. 실제 조건 평가(`checkCondition` 호출)는 서버 컴포넌트에서만
 * 실행되는 `@/lib/badgeTreeConditionCheck.server`로 분리했다 — 이 파일은 그 결과(boolean
 * Set)를 받아 상태만 가른다.
 */
export type BadgeStopStatus = 'earned' | 'ready' | 'locked' | 'not-reached'

/**
 * 게이트가 아직 열리지 않았는지. **그룹 사이는 AND**이므로 하나라도 미충족이면 잠겨 있다
 * (티켓 20260905_0037). 그룹 안 OR 판정은 `badgeTree.ts`가 이미 끝내 `fulfilled`에 담아 둔다 —
 * 여기서 다시 세면 「미션 AND (배지 A OR 배지 B)」에서 판정이 갈린다.
 */
export function hasUnfulfilledGate(gateGroups: BadgeTreeGateGroup[]): boolean {
  return gateGroups.some((g) => !g.fulfilled)
}

/** 눈금 하나(id)의 화면 상태 — earned/ready/locked/not-reached 4종. */
export function computeStopStatus(
  stageId: string,
  gateGroups: BadgeTreeGateGroup[],
  earnedBadgeIds: Set<string>,
  conditionMetBadgeIds: Set<string>
): BadgeStopStatus {
  if (earnedBadgeIds.has(stageId)) return 'earned'
  if (!hasUnfulfilledGate(gateGroups)) return 'not-reached'
  return conditionMetBadgeIds.has(stageId) ? 'ready' : 'locked'
}
