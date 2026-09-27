/**
 * 관리자 미리보기 전용 상태 전이 순수 함수 (티켓 20260928_0058).
 *
 * DB에 닿지 않는다 — 화면 안 상태(단계 인덱스)만 다룬다. `preview/QuestPreviewClient.tsx`가
 * 이 함수로 "다음 단계"·"처음부터 다시"·완료 판정을 계산한다.
 */
import { ONBOARDING_QUEST_STEPS } from './config'

/** 처음부터 다시 눌렀을 때, 그리고 화면 최초 진입 시의 인덱스. */
export const PREVIEW_INITIAL_INDEX = 0

/**
 * 다음 단계로 넘어간 인덱스. 이미 마지막 단계였으면 총 단계 수를 그대로 반환한다
 * (그 값이 곧 "모든 단계를 마쳤다"는 뜻 — {@link isPreviewDone} 참조).
 */
export function nextPreviewIndex(currentIndex: number): number {
  return Math.min(currentIndex + 1, ONBOARDING_QUEST_STEPS.length)
}

/** 인덱스가 총 단계 수 이상이면 7단계까지 모두 마친 완료 상태다. */
export function isPreviewDone(index: number): boolean {
  return index >= ONBOARDING_QUEST_STEPS.length
}

/** 「처음부터 다시」— 항상 최초 인덱스로 되돌린다. */
export function resetPreviewIndex(): number {
  return PREVIEW_INITIAL_INDEX
}
