import type { BadgeTreeLock } from '@/lib/badgeTree'

/**
 * 배지 트리(`/badges/tree`) 레일 눈금 상태 판정 — 티켓 20260903_2329 (1차: 구조 전환).
 *
 * **클라이언트 세이프 파일이다.** `BadgeFamilyRailItem.tsx`('use client')가 이 파일을
 * 직접 import하므로, 서버 전용 코드(`next/headers`를 물고 있는 `@/lib/supabase/server` →
 * `@/lib/badge-engine`)를 여기서 절대 import하지 않는다 — 실제로 처음엔 `checkCondition`
 * (badge-engine)까지 한 파일에 뒀다가 `next build`가 "클라이언트 번들이 next/headers를
 * 물고 있다"로 즉시 잡아냈다. 실제 조건 평가(`checkCondition` 호출)는 서버 컴포넌트에서만
 * 실행되는 `@/lib/badgeTreeConditionCheck.server`로 분리했다 — 이 파일은 그 결과(boolean
 * Set)를 받아 상태만 가른다.
 */
export type BadgeStopStatus = 'earned' | 'ready' | 'locked' | 'not-reached'

/**
 * 게이트(미션·선행배지)가 아직 열리지 않았는지. 선행 배지 잠금은 OR 관계라서(엔진 규칙과
 * 동일, badgeTree.ts의 buildLocks 참고) 하나라도 fulfilled면 게이트가 열린 것으로 본다.
 * 미션 잠금은 진행도를 추적하지 않아(항상 fulfilled=false) 미션 락이 하나라도 있으면
 * 항상 "안 열림"으로 취급한다 — badgeTree.ts의 buildLocks는 미션 락이 있으면 배지 락과
 * 섞지 않고 그 하나만 반환하므로 분기가 겹치지 않는다.
 */
export function hasUnfulfilledGate(locks: BadgeTreeLock[]): boolean {
  if (locks.length === 0) return false
  if (locks.some((l) => l.kind === 'mission')) return true
  return !locks.some((l) => l.fulfilled)
}

/** 눈금 하나(id)의 화면 상태 — earned/ready/locked/not-reached 4종만 반환한다(1차 범위). */
export function computeStopStatus(
  stageId: string,
  locks: BadgeTreeLock[],
  earnedBadgeIds: Set<string>,
  conditionMetBadgeIds: Set<string>
): BadgeStopStatus {
  if (earnedBadgeIds.has(stageId)) return 'earned'
  if (!hasUnfulfilledGate(locks)) return 'not-reached'
  return conditionMetBadgeIds.has(stageId) ? 'ready' : 'locked'
}
