import type { OnboardingQuestStepKey } from '@/types/database'

// 온보딩 퀘스트 기능 스위치 — 티켓 20260927_2124(상위 20260927_2123)
//
// 하위 티켓들이 staging을 거쳐 중간에 프로덕션으로 나가도, 이 값이 true가 되기 전에는
// 신규 유저에게 반쯤 만들어진 퀘스트가 보이지 않아야 한다. 행 생성(T1a)도, 홈 카드
// 노출(T1b)도 이 값을 함께 본다. 스위치는 상위 티켓의 마지막 단계에서 켠다.
export const ONBOARDING_QUEST_ENABLED = false

// 퀘스트 1~7단계 순서(연출용). user_onboarding_quests.step_progress의 키 집합과 같다.
export const ONBOARDING_QUEST_STEPS: readonly OnboardingQuestStepKey[] = [
  'sync',
  'bag',
  'pickup',
  'mix_fail',
  'mix_success',
  'drop',
  'browse',
]
