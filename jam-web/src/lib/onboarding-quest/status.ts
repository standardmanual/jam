/**
 * «JAM! 시작하기» 홈 카드 진행 상태 계산 (티켓 20260927_2133, 상위 20260927_2123 T1b · 실제 3단계 20261021_1248 2회)
 *
 * `user_onboarding_quests` 행 하나와 실제 3단계 보기(`real-view.ts`)를 카드가 그릴 수 있는 상태 하나로 접는다.
 * DB 조회(`getOnboardingQuestCard`)와 순수 판정(`resolveOnboardingQuestCard`)을 분리해 후자만 단위 테스트로 고정한다.
 *
 * 카드는 연출 구역(연출 7단계)과 실제 구역(내 활동으로 3단계)을 한 카드에 둔다.
 * - 연출 진행 중: `in_progress` — 연출 구역이 위, 실제 3단계 체크 목록이 아래. 실제 단계 기록만 못 읽으면 `real`이 null이라 연출 구역만 그린다.
 * - 연출 끝 또는 건너뜀, 실제 3단계는 남음: `real` — 실제 구역이 처음부터 위에 있다.
 * - 연출 끝 또는 건너뜀 **그리고** 실제 3단계 완료, 또는 `completed_at`이 있음: 카드가 없다(null). 완료 상태 구역은 두지 않는다(사용자 결정 4, 챕터 1은 소식 한 건으로 알린다).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import type { CapsuleStatus } from '@/lib/capsule/capsule-contract'
import type { OnboardingQuestStepKey, UserOnboardingQuestRow } from '@/types/database'
import { ONBOARDING_QUEST_ENABLED, ONBOARDING_QUEST_STEPS } from './config'
import { readLockedOpenTarget, type LockedOpenTarget } from './locked-target'
import { getAdminQuestPreview, resolvePreviewCard } from './preview'
import { readRealSteps, type RealStepsProgress } from './real-steps'
import { isRealViewDone, needsLockedTarget, resolveRealStepsView, type RealStepsView } from './real-view'

export type OnboardingQuestCardState =
  | {
      kind: 'in_progress'
      done: number
      total: number
      nextStep: OnboardingQuestStepKey
      /** 실제 3단계 보기. 실제 단계 기록을 읽지 못했으면 null — 틀린 체크를 보이지 않으려고 목록을 그리지 않는다 */
      real: RealStepsView | null
      /** 관리자 미리보기(N5a)로 만든 상태면 true. `resolvePreviewCard`(preview.ts)만 채운다. */
      preview?: true
    }
  | {
      /** 연출 7단계를 끝냈거나 건너뛰었고 실제 3단계가 남았다 */
      kind: 'real'
      real: RealStepsView
      preview?: true
    }
  | null

type QuestProgressRow = Pick<UserOnboardingQuestRow, 'step_progress' | 'skipped_at' | 'completed_at'>

/**
 * 순수 판정 함수 — DB에 닿지 않는다.
 * - 행이 없거나 `completed_at`이 있음 → null(숨김)
 * - 건너뛰지 않았고 7단계를 다 채우지 못함 → 'in_progress'(연출 구역 + 실제 3단계 목록)
 * - 7단계를 다 채웠거나 건너뜀: 실제 3단계를 읽지 못했으면 null(숨김), 3단계를 모두 마쳤으면 null(숨김), 아니면 'real'
 */
export function resolveOnboardingQuestCard(row: QuestProgressRow | null, real: RealStepsView | null): OnboardingQuestCardState {
  if (!row || row.completed_at) return null

  const total = ONBOARDING_QUEST_STEPS.length
  const done = ONBOARDING_QUEST_STEPS.filter((step) => Boolean(row.step_progress[step])).length
  const skipped = Boolean(row.skipped_at)

  if (!skipped && done < total) {
    const nextStep = ONBOARDING_QUEST_STEPS.find((step) => !row.step_progress[step])
    // done < total이라 반드시 하나는 남아 있다.
    return { kind: 'in_progress', done, total, nextStep: nextStep as OnboardingQuestStepKey, real }
  }

  // 연출은 끝났다(또는 건너뛰었다). 남은 것은 실제 3단계뿐이다.
  // 읽지 못했으면 그릴 것이 없다. 모두 마쳤으면 카드는 사라진다(완료 처리가 `completed_at`을 적는 것과 같은 조건).
  if (!real || isRealViewDone(real)) return null
  return { kind: 'real', real }
}

interface RealViewReadInput {
  stravaConnected: boolean
  /** 홈이 이미 시작해 둔 캡슐 상태 조회 — 카드가 같은 값을 다시 읽지 않는다. 실패했거나 읽지 못했으면 null */
  capsule?: Promise<CapsuleStatus | null> | CapsuleStatus | null
}

/**
 * 실제 3단계 보기를 읽는다. 실제 단계 기록을 읽지 못하면 null(오류만 남긴다) — 틀린 체크를 보이지 않는다.
 * 캡슐 상태나 열러 갈 잠긴 개체를 읽지 못한 것은 그 부분만 «모름»으로 접고 목록은 그린다.
 */
async function readRealStepsView(
  supabase: SupabaseClient,
  userId: string,
  { stravaConnected, capsule }: RealViewReadInput
): Promise<RealStepsView | null> {
  let steps: RealStepsProgress
  try {
    steps = await readRealSteps(supabase, userId)
  } catch (e) {
    console.error('[home/page] 실제 3단계 읽기 실패 — 실제 목록을 그리지 않는다', e)
    return null
  }

  let capsuleStatus: CapsuleStatus | null = null
  try {
    capsuleStatus = (await capsule) ?? null
  } catch (e) {
    console.error('[home/page] 퀘스트 카드용 캡슐 상태 읽기 실패 — 잼 안내를 생략한다', e)
  }

  let lockedTarget: LockedOpenTarget | null = null
  if (needsLockedTarget(steps)) {
    try {
      lockedTarget = await readLockedOpenTarget(supabase, userId)
    } catch (e) {
      console.error('[home/page] 열러 갈 잠긴 개체 읽기 실패 — 일반 길로 둔다', e)
    }
  }

  return resolveRealStepsView({ steps, stravaConnected, capsule: capsuleStatus, lockedTarget })
}

/**
 * 홈 페이지 진입점. 스위치가 꺼져 있으면 조회 자체를 생략하고, 조회 실패는 카드를
 * 숨기고 오류만 남긴다(홈 렌더를 막지 않는다). `stravaConnected`는 page.tsx가 이미
 * 조회해 둔 strava_connections 결과를 그대로 받는다 — 같은 테이블을 두 번 조회하지 않는다.
 * `stravaConnected`는 행의 유무가 아니라 연결 상태 판정(`connected`)이다(티켓 20261017_1422).
 * 캡슐 상태(`capsule`)도 page.tsx가 이미 시작한 조회를 받는다(잼 모자람·빈칸 모자람 안내, 티켓 20261021_1248).
 *
 * 완료한 유저(`completed_at`)는 실제 단계를 읽지 않는다. 그 밖의 유저는 카드가 그릴 실제 3단계를 읽는다(연출 중에도 체크 목록이 있다).
 *
 * 관리자 미리보기 쿠키가 있으면(N5a, 티켓 20260928_1335) 스위치·DB 행을 보지 않고
 * 쿠키 기준으로만 판정한다.
 */
export async function getOnboardingQuestCard(userId: string, options: RealViewReadInput): Promise<OnboardingQuestCardState> {
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

  const row: QuestProgressRow = {
    step_progress: (data.step_progress ?? {}) as Partial<Record<OnboardingQuestStepKey, string>>,
    skipped_at: data.skipped_at,
    completed_at: data.completed_at,
  }
  if (row.completed_at) return null

  const real = await readRealStepsView(supabase, userId, options)
  return resolveOnboardingQuestCard(row, real)
}
