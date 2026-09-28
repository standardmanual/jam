/**
 * 온보딩 퀘스트 GA4 퍼널 이벤트 계측 공용 헬퍼 (티켓 20260927_2132, 상위 20260927_2123 T9).
 *
 * 시작·단계 완료·건너뛰기 세 이벤트만 보낸다 — 완료·보상은 서버 사건이라 DB 시각
 * (`user_onboarding_quests.completed_at`·`reward_granted_at`)으로 잰다(사용자 결정 1).
 * 관리자 미리보기(`preview: true`) 응답에서는 어떤 이벤트도 보내지 않는다.
 */
import { trackEvent } from '@/lib/analytics/gtag'
import { ONBOARDING_QUEST_STEPS } from './config'
import type { OnboardingQuestStepKey } from '@/types/database'

export const ONBOARDING_QUEST_START_EVENT = 'onboarding_quest_start'
export const ONBOARDING_QUEST_STEP_COMPLETE_EVENT = 'onboarding_quest_step_complete'
export const ONBOARDING_QUEST_SKIP_EVENT = 'onboarding_quest_skip'

/** `POST /api/onboarding-quest/step` 성공 응답 중 판정에 쓰는 필드만. */
interface StepApiResponse {
  alreadyDone?: boolean
  preview?: boolean
}

/** `POST /api/onboarding-quest/skip` 성공 응답 중 판정에 쓰는 필드만. */
interface SkipApiResponse {
  preview?: boolean
}

function stepIndexOf(step: OnboardingQuestStepKey): number {
  return ONBOARDING_QUEST_STEPS.indexOf(step) + 1
}

/** 순수 판정 — 멱등 재요청(`alreadyDone`)과 관리자 미리보기(`preview`)는 집계에서 뺀다. */
export function shouldTrackStepComplete(response: StepApiResponse): boolean {
  return response.alreadyDone !== true && response.preview !== true
}

/** 단계 기록 호출부(홈·인벤토리·드랍·믹서·미션)가 성공 응답을 받은 자리에서 부른다. */
export function trackQuestStepComplete(step: OnboardingQuestStepKey, response: StepApiResponse): void {
  if (!shouldTrackStepComplete(response)) return
  trackEvent(ONBOARDING_QUEST_STEP_COMPLETE_EVENT, { step, step_index: stepIndexOf(step) })
}

/** 건너뛰기 호출부(`OnboardingQuestSkipSheet.tsx`)가 성공 응답을 받은 자리에서 부른다. */
export function trackQuestSkip(step: OnboardingQuestStepKey, response: SkipApiResponse): void {
  if (response.preview === true) return
  trackEvent(ONBOARDING_QUEST_SKIP_EVENT, { step, step_index: stepIndexOf(step) })
}

const QUEST_START_STORAGE_KEY = 'jam_quest_start_tracked'

/**
 * 홈 퀘스트 카드가 0/7 상태로 처음 렌더될 때 1회만 보낸다. `localStorage` 표시로 중복을
 * 막는다 — 접근이 막힌 환경(시크릿 모드 등)이면 표시를 남기지 못해도 이벤트는 보낸다.
 */
export function trackQuestStartOnce(): void {
  try {
    if (window.localStorage.getItem(QUEST_START_STORAGE_KEY) === '1') return
    window.localStorage.setItem(QUEST_START_STORAGE_KEY, '1')
  } catch {
    // localStorage 접근 불가 — 중복 방지만 포기하고 이벤트는 그대로 보낸다.
  }
  trackEvent(ONBOARDING_QUEST_START_EVENT)
}
