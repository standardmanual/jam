/**
 * 온보딩 퀘스트 홈 카드 진행 상태 계산 (티켓 20260927_2133, 상위 20260927_2123 T1b)
 *
 * `user_onboarding_quests` 행 하나를 카드가 그릴 수 있는 세 가지 상태 중 하나로 접는다.
 * DB 조회(`getOnboardingQuestCard`)와 순수 판정(`resolveOnboardingQuestCard`)을 분리해
 * 후자만 단위 테스트로 고정한다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { OnboardingQuestStepKey, UserOnboardingQuestRow } from '@/types/database'
import { ONBOARDING_QUEST_ENABLED, ONBOARDING_QUEST_STEPS } from './config'
import { getAdminQuestPreview, resolvePreviewCard } from './preview'

export type OnboardingQuestCardState =
  | {
      kind: 'in_progress'
      done: number
      total: number
      nextStep: OnboardingQuestStepKey
      /** 관리자 미리보기(N5a)로 만든 상태면 true. `resolvePreviewCard`(preview.ts)만 채운다. */
      preview?: true
    }
  | { kind: 'awaiting_sync'; stravaConnected: boolean; skipped: boolean; preview?: true }
  | null

type QuestProgressRow = Pick<UserOnboardingQuestRow, 'step_progress' | 'skipped_at' | 'completed_at'>

/**
 * 순수 판정 함수 — DB에 닿지 않는다. 세 상태:
 * - `completed_at` 있음 → null(숨김)
 * - 건너뛰지 않았고 7단계를 다 채우지 못함 → 'in_progress'(다음 단계로 이어 하기)
 * - 7단계를 다 채웠거나 건너뜀 → 'awaiting_sync'(실제 Strava 연동/첫 활동 대기)
 */
export function resolveOnboardingQuestCard(
  row: QuestProgressRow | null,
  { stravaConnected }: { stravaConnected: boolean }
): OnboardingQuestCardState {
  if (!row || row.completed_at) return null

  const total = ONBOARDING_QUEST_STEPS.length
  const done = ONBOARDING_QUEST_STEPS.filter((step) => Boolean(row.step_progress[step])).length
  const skipped = Boolean(row.skipped_at)

  if (!skipped && done < total) {
    const nextStep = ONBOARDING_QUEST_STEPS.find((step) => !row.step_progress[step])
    // done < total이라 반드시 하나는 남아 있다.
    return { kind: 'in_progress', done, total, nextStep: nextStep as OnboardingQuestStepKey }
  }

  return { kind: 'awaiting_sync', stravaConnected, skipped }
}

/**
 * 홈 페이지 진입점. 스위치가 꺼져 있으면 조회 자체를 생략하고, 조회 실패는 카드를
 * 숨기고 오류만 남긴다(홈 렌더를 막지 않는다). `stravaConnected`는 page.tsx가 이미
 * 조회해 둔 strava_connections 결과를 그대로 받는다 — 같은 테이블을 두 번 조회하지 않는다.
 * `stravaConnected`는 행의 유무가 아니라 연결 상태 판정(`connected`)이다(티켓 20261017_1422).
 *
 * 관리자 미리보기 쿠키가 있으면(N5a, 티켓 20260928_1335) 스위치·DB 행을 보지 않고
 * 쿠키 기준으로만 판정한다.
 */
export async function getOnboardingQuestCard(
  userId: string,
  options: { stravaConnected: boolean }
): Promise<OnboardingQuestCardState> {
  const preview = await getAdminQuestPreview()
  if (preview) return resolvePreviewCard(preview, options)

  if (!ONBOARDING_QUEST_ENABLED) return null

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('user_onboarding_quests')
    .select('step_progress, skipped_at, completed_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[home/page] onboarding_quest 조회 실패', error)
    return null
  }
  if (!data) return null

  return resolveOnboardingQuestCard(
    {
      step_progress: (data.step_progress ?? {}) as Partial<Record<OnboardingQuestStepKey, string>>,
      skipped_at: data.skipped_at,
      completed_at: data.completed_at,
    },
    options
  )
}
