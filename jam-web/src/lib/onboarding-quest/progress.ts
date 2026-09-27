/**
 * 온보딩 퀘스트 단계 진행 순서 판정 (티켓 20260927_2330, 상위 20260927_2123 T2a)
 *
 * DB에 닿지 않는 순수 함수만 담는다 — `POST /api/onboarding-quest/step`(route.ts)이
 * 행 조회 뒤 이 함수로 판정하고, 그 결과에 따라 service_role로 `step_progress`를 갱신한다.
 */
import type { OnboardingQuestStepKey } from '@/types/database'
import { ONBOARDING_QUEST_STEPS } from './config'

export type OnboardingQuestProgress = Partial<Record<OnboardingQuestStepKey, string>>

/** `ONBOARDING_QUEST_STEPS` 순서대로 아직 안 끝난 첫 단계. 7단계를 다 마쳤으면 null. */
export function nextStepOf(progress: OnboardingQuestProgress): OnboardingQuestStepKey | null {
  return ONBOARDING_QUEST_STEPS.find((step) => !progress[step]) ?? null
}

export type StepAdvanceResult =
  | { ok: true; alreadyDone: boolean }
  | { ok: false; reason: 'ALL_DONE' | 'OUT_OF_ORDER' }

/**
 * 요청한 단계를 기록해도 되는지 판정한다.
 * - 아직 안 끝난 첫 단계와 같음 → 기록 대상(`alreadyDone: false`)
 * - 이미 끝낸 단계 → 멱등 성공(`alreadyDone: true`), 호출부는 아무것도 바꾸지 않는다
 * - 7단계를 이미 다 마침 → 거부(`ALL_DONE`)
 * - 그 외(아직 안 끝난 첫 단계보다 뒤 단계를 먼저 보냄) → 거부(`OUT_OF_ORDER`)
 */
export function validateStepAdvance(
  progress: OnboardingQuestProgress,
  step: OnboardingQuestStepKey
): StepAdvanceResult {
  const next = nextStepOf(progress)
  if (next === null) return { ok: false, reason: 'ALL_DONE' }
  if (step === next) return { ok: true, alreadyDone: false }
  if (progress[step]) return { ok: true, alreadyDone: true }
  return { ok: false, reason: 'OUT_OF_ORDER' }
}
