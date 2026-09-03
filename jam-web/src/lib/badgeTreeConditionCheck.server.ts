import { checkCondition } from '@/lib/badge-engine'
import { hasUnfulfilledGate } from '@/lib/badgeTreeConditionStatus'
import type { BadgeCondition } from '@/types/database'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeTreeLock } from '@/lib/badgeTree'

/**
 * 배지 트리(`/badges/tree`) "조건 충족" 판정 — 서버 전용. 티켓 20260903_2329 (1차: 구조 전환).
 *
 * `@/lib/badge-engine`을 import하므로(`next/headers`를 물고 있는 `@/lib/supabase/server`
 * 의존) **서버 컴포넌트(`page.tsx`)에서만 import한다** — 클라이언트 컴포넌트가 이 파일을
 * (직접이든 간접이든) import하면 next build가 막는다. 순수 상태 판정 로직(`computeStopStatus`)은
 * 클라이언트 세이프한 `@/lib/badgeTreeConditionStatus`에 따로 있다.
 *
 * "단계 분리 근거"(티켓 본문)가 명시한 대로, 이 파일은 새 진행 계산 모듈이 아니라
 * **기존 `checkCondition`(=`evaluateConditionDetailed(...).pass`) pass/fail**만 재사용한다.
 */

/** 게이트가 아직 안 열린(=조건충족/게이트잠김 판정이 필요한) 미획득 배지 id만 추린다. */
export function collectConditionCheckTargets(
  stagesById: Iterable<{ id: string; locks: BadgeTreeLock[] }>,
  earnedBadgeIds: Set<string>
): string[] {
  const ids: string[] = []
  for (const stage of stagesById) {
    if (earnedBadgeIds.has(stage.id)) continue
    if (hasUnfulfilledGate(stage.locks)) ids.push(stage.id)
  }
  return ids
}

/**
 * `collectConditionCheckTargets`가 추린 대상 각각에 대해 기존 `checkCondition`을 돌려
 * 수치 조건 pass/fail을 얻는다. 평가 중 예외가 나도(예측 못한 condition_json 형태) 페이지
 * 전체가 죽지 않도록 개별적으로 방어한다 — 실패한 배지는 "게이트잠김"(보수적 기본값)으로
 * 처리된다.
 */
export function computeConditionMetBadgeIds(
  targetIds: string[],
  conditionById: Map<string, BadgeCondition | null>,
  activities: NormalizedActivity[]
): Set<string> {
  const result = new Set<string>()
  for (const id of targetIds) {
    const condition = conditionById.get(id)
    if (!condition) continue
    try {
      if (checkCondition(condition, activities)) result.add(id)
    } catch (error) {
      console.error('[computeConditionMetBadgeIds] 조건 평가 실패 — 게이트잠김으로 처리', id, error)
    }
  }
  return result
}
