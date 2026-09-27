/**
 * 온보딩 퀘스트 화면 문지기 함수 (티켓 20260928_0134, 상위 20260927_2123 N1)
 *
 * 실제 메뉴 화면(홈·인벤토리·드랍·믹서·미션)은 언제나 존재하고 퀘스트와 무관한 유저도
 * 방문한다. 이 함수는 "지금 이 화면이 이 유저의 퀘스트 차례인가"만 판정한다 — 차례면
 * 해당 단계 키를 돌려주고, 아니면 null을 돌려줘 화면은 평소 그대로 렌더링된다(결정 19).
 *
 * DB 조회(`getOnboardingQuestGate`)와 순수 판정(`resolveOnboardingQuestGate`)을 분리해
 * 후자만 단위 테스트로 고정한다 — `status.ts`의 `getOnboardingQuestCard`/
 * `resolveOnboardingQuestCard` 분리 패턴을 따른다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { OnboardingQuestStepKey } from '@/types/database'
import { ONBOARDING_QUEST_ENABLED } from './config'
import { nextStepOf, type OnboardingQuestProgress } from './progress'

/** 결정 18: 단계가 진행되는 실제 메뉴 화면. */
export type OnboardingQuestScreen = 'home' | 'inventory' | 'drops' | 'combine' | 'missions'

/** 결정 18: 단계 키 → 소속 화면 지도. */
export const STEP_SCREEN_MAP: Record<OnboardingQuestStepKey, OnboardingQuestScreen> = {
  sync: 'home',
  bag: 'inventory',
  pickup: 'drops',
  drop: 'drops',
  mix_fail: 'combine',
  mix_success: 'combine',
  browse: 'missions',
}

type QuestGateRow = { step_progress: OnboardingQuestProgress; skipped_at: string | null }

/**
 * 순수 판정 함수 — DB에 닿지 않는다.
 * - 행 없음 → null
 * - 건너뜀(`skipped_at` 있음) → null
 * - 7단계 완료(`nextStepOf`가 null) → null
 * - 다음 단계가 이 화면 소속이 아님 → null
 * - 그 외 → 다음 단계 키(픽업/드랍, 믹스 실패/성공처럼 한 화면에 단계 두 개가 걸려도
 *   `nextStepOf`가 순서상 정확히 하나만 돌려주므로 화면은 이 키로 자신의 연출 상태를 고른다)
 */
export function resolveOnboardingQuestGate(
  row: QuestGateRow | null,
  screen: OnboardingQuestScreen
): OnboardingQuestStepKey | null {
  if (!row || row.skipped_at) return null

  const next = nextStepOf(row.step_progress)
  if (next === null) return null

  return STEP_SCREEN_MAP[next] === screen ? next : null
}

/**
 * 화면(page.tsx) 진입점. 스위치가 꺼져 있으면 조회 자체를 생략한다. 조회 실패는 카드
 * 판정과 동일하게 null을 돌려주고 화면 렌더를 막지 않는다(콘솔에만 남긴다).
 */
export async function getOnboardingQuestGate(
  userId: string,
  screen: OnboardingQuestScreen
): Promise<OnboardingQuestStepKey | null> {
  if (!ONBOARDING_QUEST_ENABLED) return null

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('user_onboarding_quests')
    .select('step_progress, skipped_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[screen-gate] onboarding_quest 조회 실패', error)
    return null
  }
  if (!data) return null

  return resolveOnboardingQuestGate(
    {
      step_progress: (data.step_progress ?? {}) as OnboardingQuestProgress,
      skipped_at: data.skipped_at,
    },
    screen
  )
}
