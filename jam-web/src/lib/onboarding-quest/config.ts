import type { OnboardingQuestStepKey } from '@/types/database'

// 온보딩 퀘스트 기능 스위치 — 티켓 20260927_2124(상위 20260927_2123)
//
// 하위 티켓들이 staging을 거쳐 중간에 프로덕션으로 나가도, 이 값이 true가 되기 전에는
// 신규 유저에게 반쯤 만들어진 퀘스트가 보이지 않아야 한다. 행 생성(T1a)도, 홈 카드
// 노출(T1b)도 이 값을 함께 본다. 상위 티켓 후속 범위로 2026-09-28 켰다.
export const ONBOARDING_QUEST_ENABLED = true

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

// 결정 18: 단계가 진행되는 실제 메뉴 화면. `screen-gate.ts`·`preview.ts`가 함께 쓴다
// (티켓 20260928_1335) — 이 파일에 두어 두 모듈이 서로를 임포트하지 않게 한다.
export type OnboardingQuestScreen = 'home' | 'inventory' | 'drops' | 'combine' | 'missions'

// 결정 18: 단계 키 → 소속 화면 지도.
export const STEP_SCREEN_MAP: Record<OnboardingQuestStepKey, OnboardingQuestScreen> = {
  sync: 'home',
  bag: 'inventory',
  pickup: 'drops',
  drop: 'drops',
  mix_fail: 'combine',
  mix_success: 'combine',
  browse: 'missions',
}

// 온보딩 퀘스트 완료 보상 배지 「JAM!」(처음 이름은 '퀘스트 클리어', 마이그레이션 256이 바꾼다 — 티켓 20261021_1248)의 고정 id — 티켓 20260928_1212(T7a)
// 마이그레이션 196_onboarding_completion_badge.sql이 넣는 행과 같은 값이다. 지급 로직(T7b,
// 티켓 20260927_2130)이 이 상수로 user_activity_badges에 행을 넣는다. 배지를 이름이 아니라 이 id로 찾으므로 이름이 바뀌어도 지급은 그대로다.
export const ONBOARDING_COMPLETION_BADGE_ID = 'cd20f271-9445-42cc-ac51-d8a96b25e1c3'
