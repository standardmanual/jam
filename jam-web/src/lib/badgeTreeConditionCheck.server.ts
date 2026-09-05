import { checkCondition } from '@/lib/badge-engine'
import { crossGateKeysIn } from '@/lib/badge-engine/crossGate'
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
  activities: NormalizedActivity[],
  /**
   * 가입 앵커 — **발급 엔진과 같은 창**을 보기 위해 그대로 넘긴다
   * (v5 B3, 티켓 20260905_0030 §4). 휴식 조건은 「활동이 없는 기간」을 세므로 앵커를
   * 빠뜨리면 화면이 발급보다 넓은 창에서 공백을 계산해 「조건 충족(라임)」으로 뜨는데
   * 엔진은 막는 상태가 된다.
   */
  anchorDate?: string
): Set<string> {
  const result = new Set<string>()
  for (const id of targetIds) {
    const condition = conditionById.get(id)
    if (!condition) continue
    // 2단 교차 게이트가 붙은 배지는 «조건 충족»으로 표시하지 않는다 (티켓 20260905_0031).
    //
    // `checkCondition`(=`evaluateConditionDetailed`)은 교차 게이트를 **보지 않는다** — 게이트는
    // 「유저가 무엇을 보유했는가」를 봐야 해서 그 바깥(`evaluateBadgeGates`)에서 판정되고,
    // 조건 필드 메타에도 `evaluation: 'external'`로 선언돼 fail-closed가 잡지 않는다.
    // 그래서 이 줄이 없으면 수치만 채운 배지가 레일에 「조건 충족(라임)」으로 뜨는데 발급은
    // 게이트가 막는다 — 0030이 «거짓말 중»으로 넘긴 항목이 바로 이것이다. 판정할 수 없으면
    // 보수적으로 「잠김」에 둔다(이 함수가 예외 상황에서 이미 취하는 태도와 같다).
    if (crossGateKeysIn(condition).length > 0) continue
    try {
      if (checkCondition(condition, activities, { anchorDate })) result.add(id)
    } catch (error) {
      console.error('[computeConditionMetBadgeIds] 조건 평가 실패 — 게이트잠김으로 처리', id, error)
    }
  }
  return result
}
