import type { ComponentType } from 'react'
import type { OnboardingQuestStepKey } from '@/types/database'
import type { OnboardingQuestStepProps } from './StepRunner'
import SyncStep from './steps/SyncStep'
import InventoryStep from './steps/InventoryStep'

/**
 * 단계 키 → 단계 부품 매핑 (티켓 20260928_0058, 상위 20260927_2125에서 옮김).
 * 실제 화면(`page.tsx`)과 관리자 미리보기(`preview/QuestPreviewClient.tsx`)가 함께 쓴다 —
 * 이후 단계(T3~T5)가 부품을 추가하면 이 한곳만 고쳐도 두 화면에 모두 나타난다.
 * 아직 부품이 없는 단계(3~7단계)는 키가 없어 두 화면 모두 빈 자리로 남는다.
 */
export const STEP_COMPONENTS: Partial<
  Record<OnboardingQuestStepKey, ComponentType<OnboardingQuestStepProps>>
> = {
  sync: SyncStep,
  bag: InventoryStep,
}
