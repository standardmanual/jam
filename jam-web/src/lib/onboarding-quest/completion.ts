/**
 * 온보딩 퀘스트 완료 판정 (티켓 20260927_2129, 상위 20260927_2123 T6)
 *
 * 완료(`completed_at`)는 "실제 첫 활동이 들어온 시점"에만 기록한다. 1~7단계는 연출용
 * 데이터라 실제 배지·아이템·포인트를 만들지 않으므로, 완료 판정은 `strava_activities`에
 * 실제로 처리된 행이 있는지로만 결정한다(`users.initial_sync_done`은 활동이 0건이어도
 * true가 되므로 쓰지 않는다 — 배경은 티켓 본문 참고).
 *
 * DB 조회(`recordOnboardingQuestCompletion`)와 순수 판정(`shouldRecordQuestCompletion`)을
 * 분리해 후자만 단위 테스트로 고정한다 — `status.ts`/`screen-gate.ts`와 같은 패턴.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserOnboardingQuestRow } from '@/types/database'
import { ONBOARDING_QUEST_ENABLED } from './config'
import { nextStepOf } from './progress'

type QuestCompletionRow = Pick<UserOnboardingQuestRow, 'step_progress' | 'skipped_at' | 'completed_at'>

/**
 * 순수 판정 함수 — DB에 닿지 않는다.
 * - 행 없음 → false
 * - 이미 `completed_at`이 있음 → false (멱등)
 * - 7단계를 아직 안 마쳤고 건너뛰지도 않음 → false (사용자 결정 2 — 연출 도중엔 기록하지 않는다)
 * - 처리된 실제 활동이 0건 → false
 * - 그 외(7단계 완료 또는 건너뜀 + 활동 1건 이상) → true
 */
export function shouldRecordQuestCompletion(
  row: QuestCompletionRow | null,
  hasProcessedActivity: boolean
): boolean {
  if (!row) return false
  if (row.completed_at) return false
  if (nextStepOf(row.step_progress) !== null && !row.skipped_at) return false
  if (!hasProcessedActivity) return false
  return true
}

/**
 * 완료 조건을 확인하고 맞으면 `completed_at`을 기록한다. 절대 throw하지 않는다 — 동기화·
 * 단계 기록 흐름을 막지 않기 위해 오류는 `console.error`만 남긴다.
 *
 * 호출 지점: ① `syncStravaActivities`에서 처리된 활동이 1건 이상일 때(연동 직후·수동 공통)
 * ② `POST /api/onboarding-quest/step`이 7단계(`browse`)를 기록한 직후.
 */
export async function recordOnboardingQuestCompletion(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  if (!ONBOARDING_QUEST_ENABLED) return

  try {
    const { data: row, error: rowError } = await supabase
      .from('user_onboarding_quests')
      .select('step_progress, skipped_at, completed_at')
      .eq('user_id', userId)
      .maybeSingle()

    if (rowError) {
      console.error('[recordOnboardingQuestCompletion] 행 조회 실패:', rowError.message)
      return
    }
    if (!row) return

    const progressRow: QuestCompletionRow = {
      step_progress: row.step_progress ?? {},
      skipped_at: row.skipped_at,
      completed_at: row.completed_at,
    }

    // 활동 조회 전에 다른 조건부터 걸러 — 불필요한 조회를 줄인다.
    if (nextStepOf(progressRow.step_progress) !== null && !progressRow.skipped_at) return
    if (progressRow.completed_at) return

    const { data: activityRow, error: activityError } = await supabase
      .from('strava_activities')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()

    if (activityError) {
      console.error('[recordOnboardingQuestCompletion] 활동 조회 실패:', activityError.message)
      return
    }

    if (!shouldRecordQuestCompletion(progressRow, Boolean(activityRow))) return

    const { error: updateError } = await supabase
      .from('user_onboarding_quests')
      .update({ completed_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('completed_at', null)

    if (updateError) {
      console.error('[recordOnboardingQuestCompletion] completed_at 갱신 실패:', updateError.message)
    }
  } catch (err) {
    console.error('[recordOnboardingQuestCompletion] 예외:', err)
  }
}
