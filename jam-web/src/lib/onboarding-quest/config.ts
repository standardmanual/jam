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

// 온보딩 퀘스트 완료 보상 배지 '퀘스트 클리어'의 고정 id — 티켓 20260928_1212(T7a)
// 마이그레이션 196_onboarding_completion_badge.sql이 넣는 행과 같은 값이다. 지급 로직(T7b,
// 티켓 20260927_2130)이 이 상수로 user_activity_badges에 행을 넣는다.
export const ONBOARDING_COMPLETION_BADGE_ID = 'cd20f271-9445-42cc-ac51-d8a96b25e1c3'
