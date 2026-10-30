/**
 * 온보딩 퀘스트 완료 판정 + 완료 보상 지급 (티켓 20260927_2129 T6, 20260927_2130 T7b,
 * 상위 20260927_2123, 개편 20261021_1248 6-2, 2단계로 축소 20261028_1738 1회, 운영 로직 2.2절)
 *
 * 퀘스트는 연출 7단계와 실제 2단계(첫 동기화·잠긴 아이템 배지 열기, `real-steps.ts`)로 이뤄진다.
 * 1~7단계는 연출용 데이터라 실제 배지·아이템·포인트를 만들지 않는다. 실제 2단계는 유저의 기록에서 읽는다
 * (`users.initial_sync_done`은 활동이 0건이어도 true가 되므로 쓰지 않는다).
 *
 * 두 가지를 따로 정한다(사용자 결정 1).
 *  - **챕터 1 시작**: 실제 2단계가 끝난 순간 바로 한다. 연출 7단계가 끝났는지·건너뛰었는지와 무관하다
 *    (`ensureChapterStarted` — 멱등이라 챕터가 있으면 DB 함수를 부르지 않는다). 건너뛴 유저도 같다.
 *  - **완료(`completed_at`)와 보상**: «연출 7단계를 마쳤거나 건너뜀» **그리고** «실제 2단계 완료»가 **둘 다** 된 뒤 한 번 기록한다.
 *    완료가 이번 호출에서 실제로 확정됐고(건너뛰지 않았으면) T7a가 등록한 완료 배지 1개(「JAM!」)와 그 `point_reward`를
 *    `grantOnboardingQuestReward`가 이어서 지급한다(T7b). 연출을 건너뛴 유저는 챕터 1만 받는다.
 *
 * 시작이 일시 오류로 실패해도 다음 호출이 다시 시도한다: 완료 전에는 실제 2단계가 끝난 호출마다 `ensureChapterStarted`를 부르고,
 * `completed_at`이 이미 있는 유저가 들어올 때마다(보상 재시도 분기 포함)도 같은 함수를 부른다. 옛 퀘스트 완료자도 다음 호출에서 챕터 1을 받는다.
 *
 * 호출 지점: 동기화(정산 1건 이상) · 연출의 마지막 단계 기록 · 건너뛰기 · **잠긴 개체 열기가 확정된 뒤**(②가 여기서 끝난다).
 * 캡슐 열기는 더 이상 단계가 아니라 호출하지 않는다(티켓 20261028_1738). 잠긴 개체 열기 쪽 호출은 서비스 활동 잼 지급(`awardServiceJam`) 다음이다.
 *
 * DB 조회(`recordOnboardingQuestCompletion`)와 순수 판정(`shouldRecordQuestCompletion`,
 * `shouldGrantQuestReward`)을 분리해 후자만 단위 테스트로 고정한다 —
 * `status.ts`/`screen-gate.ts`와 같은 패턴.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserOnboardingQuestRow } from '@/types/database'
import { ONBOARDING_QUEST_ENABLED, ONBOARDING_COMPLETION_BADGE_ID } from './config'
import { nextStepOf } from './progress'
import { isRealStepsDone, readRealSteps } from './real-steps'
import { awardPoints } from '@/lib/points'
import { awardBadgeReceiveScore } from '@/lib/chapter/badgeReceive'
import { ensureChapterStarted } from '@/lib/chapter/start'
import { recordFeedEvent } from '@/lib/activity-feed'

type QuestCompletionRow = Pick<UserOnboardingQuestRow, 'step_progress' | 'skipped_at' | 'completed_at'>

/**
 * 순수 판정 함수 — DB에 닿지 않는다. 완료(`completed_at`)를 이번에 기록할지 정한다.
 * - 행 없음 → false
 * - 이미 `completed_at`이 있음 → false (멱등)
 * - 연출 7단계를 아직 안 마쳤고 건너뛰지도 않음 → false (연출 도중엔 기록하지 않는다 — 실제 2단계를 먼저 마쳤어도 연출이 끝나야 완료다)
 * - 실제 2단계가 아직 안 끝남 → false
 * - 그 외(연출 완료 또는 건너뜀 + 실제 2단계 완료) → true
 */
export function shouldRecordQuestCompletion(
  row: QuestCompletionRow | null,
  realStepsDone: boolean
): boolean {
  if (!row) return false
  if (row.completed_at) return false
  if (nextStepOf(row.step_progress) !== null && !row.skipped_at) return false
  if (!realStepsDone) return false
  return true
}

/**
 * 이미 완료가 기록됐는데 보상이 아직 나가지 않은 유저인지 판정하는 순수 함수(티켓 20260929_1634).
 * `completed_at`을 먼저 기록한 뒤 지급하므로, 지급이 일시 오류로 실패해 `reward_granted_at`이
 * 롤백되면 이 상태가 남는다. 건너뛴 유저는 애초에 보상 대상이 아니라 제외한다. 이 판정이 true여도
 * 실제 1회 지급은 `grantOnboardingQuestReward`의 `reward_granted_at` 조건부 선점이 보장한다.
 */
export function shouldRetryQuestReward(
  completedAt: string | null,
  skippedAt: string | null,
  rewardGrantedAt: string | null
): boolean {
  return Boolean(completedAt) && !skippedAt && !rewardGrantedAt
}

/**
 * 완료 시 보상(완료 배지 1개 + 배지의 point_reward)을 지급할지 판정하는 순수 함수.
 * `completionUpdated`는 `completed_at` 갱신이 이번 호출에서 실제로 행을 바꿨는지(=
 * `.is('completed_at', null)` 조건부 갱신에 걸린 행 수 > 0)를 뜻한다. 건너뛴 유저
 * (`skippedAt` 있음)는 완료 시각만 기록되고 보상은 받지 않는다(상위 결정 24).
 */
export function shouldGrantQuestReward(completionUpdated: boolean, skippedAt: string | null): boolean {
  return completionUpdated && !skippedAt
}

/**
 * 완료 배지(T7a, `ONBOARDING_COMPLETION_BADGE_ID`)와 그 `point_reward`를 1회만 지급한다.
 * `usageBadges.ts`(L211~243)와 같은 부수효과 순서 — 배지 발급 → 포인트 지급 → 피드 기록.
 *
 * 멱등: 지급 전에 `reward_granted_at`을 조건부 갱신으로 선점한다. 이미 선점돼 있으면(바뀐
 * 행 없음) 조용히 중단한다. 배지 insert가 23505(이미 보유)면 포인트·피드는 건너뛴다.
 * 23505가 아닌 오류(배지 행이 아직 없어 FK 위반이 나는 경우 포함)면 `reward_granted_at`을
 * 다시 NULL로 되돌려 다음 호출에서 재시도할 수 있게 한다(`recordOnboardingQuestCompletion`이
 * `completed_at`이 있어도 `reward_granted_at`이 NULL이면 이 함수를 다시 부른다). 절대 throw하지 않는다.
 *
 * 배지는 발급됐는데 포인트만 실패한 경우(배지 insert와 `awardPoints`는 한 트랜잭션이 아니다)는
 * 재시도하지 않는다 — `reward_granted_at`을 유지해 다음 호출이 지급을 되풀이하지 않게 한다.
 * `awardPoints`는 실패 시 `engine_decision_log`에 `point_award_failed`(sourceBadgeId 포함)를
 * 남기므로 그 기록을 근거로 운영진이 수동 재지급한다. 자동 재시도는 "배지 있음 + 원장 없음"을
 * 원장 조회로 판별해야 하고, RPC가 커밋된 뒤 응답만 유실된 경우 이중 지급될 수 있어 멱등성을
 * 우선해 넣지 않았다.
 *
 * @returns 지급(또는 이미 보유 확인)한 배지 id, 지급하지 않았으면 null.
 */
async function grantOnboardingQuestReward(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  try {
    const { data: preempted, error: preemptError } = await supabase
      .from('user_onboarding_quests')
      .update({ reward_granted_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('reward_granted_at', null)
      .select('user_id')

    if (preemptError) {
      console.error('[grantOnboardingQuestReward] reward_granted_at 선점 실패:', preemptError.message)
      return null
    }
    if (!preempted || preempted.length === 0) return null // 이미 지급됨(멱등)

    const { error: insertError } = await supabase
      .from('user_activity_badges')
      .insert({ user_id: userId, badge_id: ONBOARDING_COMPLETION_BADGE_ID, triggered_by: 'onboarding_quest' })

    if (insertError) {
      if (insertError.code !== '23505') {
        console.error('[grantOnboardingQuestReward] 배지 발급 오류:', insertError.message)
        const { error: releaseError } = await supabase
          .from('user_onboarding_quests')
          .update({ reward_granted_at: null })
          .eq('user_id', userId)
        if (releaseError) {
          console.error('[grantOnboardingQuestReward] reward_granted_at 롤백 실패:', releaseError.message)
        }
      }
      return null
    }

    const { data: badge, error: badgeError } = await supabase
      .from('badges')
      .select('name, image_url, rarity, point_reward, type, is_hidden, condition_json')
      .eq('id', ONBOARDING_COMPLETION_BADGE_ID)
      .is('deleted_at', null)
      .maybeSingle()

    if (badgeError || !badge) {
      // 배지는 이미 발급됐다 — 포인트·피드만 생략하고 지급 자체는 성공으로 본다.
      console.error('[grantOnboardingQuestReward] 배지 정보 조회 실패:', badgeError?.message ?? '행 없음')
      return ONBOARDING_COMPLETION_BADGE_ID
    }

    // 챕터 점수 «배지 받기» (티켓 20261019_1315 2a회, 운영 로직 12.2절). 새 행을 실제로 넣은 경우만 여기 온다(23505는 위에서 null 반환).
    // 위 배지 정보 조회가 실패하면 유형·숨김·조건을 알 수 없어 점수를 세지 않는다(발급은 그대로다). 던지지 않아 완료 보상 결과를 바꾸지 않는다.
    await awardBadgeReceiveScore(supabase, {
      userId,
      badge: { id: ONBOARDING_COMPLETION_BADGE_ID, type: badge.type, is_hidden: badge.is_hidden, condition_json: badge.condition_json },
      origin: { triggeredBy: 'onboarding_quest' },
    })

    const pointReward = badge.point_reward ?? 0
    if (pointReward > 0) {
      await awardPoints(userId, pointReward, 'badge_point_reward', { sourceBadgeId: ONBOARDING_COMPLETION_BADGE_ID })
    }

    await recordFeedEvent(userId, 'badge_earned', {
      badge_id: ONBOARDING_COMPLETION_BADGE_ID,
      badge_name: badge.name,
      badge_image_url: badge.image_url ?? '',
      rarity: badge.rarity,
      ...(pointReward > 0 ? { point_reward: pointReward } : {}),
    })

    return ONBOARDING_COMPLETION_BADGE_ID
  } catch (err) {
    console.error('[grantOnboardingQuestReward] 예외:', err)
    return null
  }
}

/**
 * 실제 2단계가 끝나면 챕터 1을 시작하고(연출과 무관), 연출까지 끝났으면 `completed_at`을 기록한 뒤, 이번 호출에서 실제로 완료가 확정된
 * (건너뛰지 않은) 유저에게만 완료 배지·포인트를 지급한다. 절대 throw하지 않는다 — 동기화·열기·단계 기록 흐름을 막지 않기 위해
 * 오류는 `console.error`만 남기고 `null`을 돌려준다. 실제 단계를 읽지 못하면 «마쳤다»로 보지 않아 챕터도 시작하지 않는다.
 *
 * 호출 지점: ① `syncStravaActivities`에서 처리된 활동이 1건 이상일 때(연동 직후·수동 공통)
 * ② `POST /api/onboarding-quest/step`이 7단계(`browse`)를 기록한 직후 ③ `POST /api/onboarding-quest/skip` 직후
 * ④ 잠긴 개체 열기(`lib/inventory/lockedItemFill.ts`)가 확정된 직후.
 *
 * @returns 이번 호출에서 지급한 완료 배지 id, 지급하지 않았으면 null. 보상은 두 조건이 모두 된 호출에서 나가므로 동기화가 아닌
 *          호출(열기·단계 기록·건너뛰기)에서 지급될 수 있다. 호출부가 이 값을 응답에 싣지 않으면 배지 획득 카드는 뜨지 않는다
 *          (열기 응답에는 싣지 않는다 — 배지는 피드 기록과 포인트 변동으로 남고, 카드 문구가 알린다).
 */
export async function recordOnboardingQuestCompletion(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  if (!ONBOARDING_QUEST_ENABLED) return null

  try {
    const { data: row, error: rowError } = await supabase
      .from('user_onboarding_quests')
      .select('step_progress, skipped_at, completed_at, reward_granted_at')
      .eq('user_id', userId)
      .maybeSingle()

    if (rowError) {
      console.error('[recordOnboardingQuestCompletion] 행 조회 실패:', rowError.message)
      return null
    }
    if (!row) return null

    const progressRow: QuestCompletionRow = {
      step_progress: row.step_progress ?? {},
      skipped_at: row.skipped_at,
      completed_at: row.completed_at,
    }

    // 완료 기록이 이미 있는 유저 — 실제 단계는 이미 끝났다. 챕터 1이 비어 있으면(이전 시작이 실패했거나 옛 완료자) 다시 시작한다. 챕터가 있으면 RPC를 부르지 않는다.
    // 던지지 않아 아래 보상 재시도 분기의 결과를 바꾸지 않는다(티켓 20261019_1316 사용자 결정 4).
    if (progressRow.completed_at) {
      await ensureChapterStarted(supabase, userId)
      // 완료는 기록됐는데 보상이 안 나간 상태(이전 호출의 지급 실패·롤백) — 실제 단계 조회 없이 지급만 다시 시도한다.
      if (shouldRetryQuestReward(progressRow.completed_at, progressRow.skipped_at, row.reward_granted_at)) {
        return await grantOnboardingQuestReward(supabase, userId)
      }
      return null
    }

    // 실제 2단계 — 읽지 못하면 던져서 아래 catch가 «마쳤다»로 보지 않고 끝낸다(티켓 20261021_1248).
    const realStepsDone = isRealStepsDone(await readRealSteps(supabase, userId))
    if (!realStepsDone) return null

    // 챕터 1은 실제 2단계가 끝난 순간 시작한다. 연출 7단계가 끝났는지·건너뛰었는지와 무관하다(티켓 20261021_1248 사용자 결정 1).
    // 멱등(챕터가 있으면 RPC를 부르지 않는다)이라 연출이 끝나기 전에 여러 번 지나도 안전하고, 실패하면 다음 호출이 다시 시도한다. 던지지 않는다.
    await ensureChapterStarted(supabase, userId)

    // 연출이 아직 남았으면 완료도 보상도 아직이다. 연출 마지막 단계 기록이나 건너뛰기가 이 함수를 다시 부르면 그때 기록한다.
    if (!shouldRecordQuestCompletion(progressRow, realStepsDone)) return null

    const { data: updatedRows, error: updateError } = await supabase
      .from('user_onboarding_quests')
      .update({ completed_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('completed_at', null)
      .select('user_id')

    if (updateError) {
      console.error('[recordOnboardingQuestCompletion] completed_at 갱신 실패:', updateError.message)
      return null
    }

    // 동시 호출에 져서 바뀐 행이 없으면(completionUpdated false) 보상은 이긴 호출이 지급한다. 챕터 시작은 위에서 둘 다 멱등으로 지났다.
    const completionUpdated = (updatedRows?.length ?? 0) > 0
    if (!shouldGrantQuestReward(completionUpdated, progressRow.skipped_at)) return null

    return await grantOnboardingQuestReward(supabase, userId)
  } catch (err) {
    console.error('[recordOnboardingQuestCompletion] 예외:', err)
    return null
  }
}
