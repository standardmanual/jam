/**
 * 가입 완료(트라이브 선택) 시점의 완료 배지 «JAM!» 지급 (티켓 20261115_2056, 상위 20261115_2055)
 *
 * 챕터 1 시작과 이 배지는 가입 2단계(`POST /api/onboarding/complete`)가 트라이브 저장에 성공한 순간 이 함수로 나간다.
 *
 * 1회 보장은 배지 insert의 23505(이미 보유)가 맡는다.
 * 같은 유저가 다시 불러도 포인트·피드는 나가지 않는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { awardPoints } from '@/lib/points'
import { awardBadgeReceiveScore } from '@/lib/chapter/badgeReceive'
import { recordFeedEvent } from '@/lib/activity-feed'
import { SIGNUP_COMPLETION_BADGE_ID } from './signup-badge-id'

export { SIGNUP_COMPLETION_BADGE_ID }

/**
 * 가입 완료 배지와 그 `point_reward`를 1회만 지급한다. `usageBadges.ts`와 같은 부수효과 순서 —
 * 배지 발급 → 배지 정보 조회 → 챕터 점수 → 포인트 → 피드.
 *
 * - 배지 insert가 23505(이미 보유)면 포인트·피드를 건너뛴다(멱등).
 * - 그 밖의 insert 오류는 기록만 남기고 null을 돌려준다 — 가입 응답을 막지 않는다.
 * - 배지는 들어갔는데 포인트만 실패한 경우는 재시도하지 않는다(`awardPoints`가 `engine_decision_log`에 `point_award_failed`를 남긴다).
 * - `triggered_by`는 기존 행·집계와 같게 `'onboarding_quest'`를 유지한다(값 이름 정리는 하지 않는다).
 * 절대 던지지 않는다.
 *
 * @returns 이번 호출에서 새로 지급한 배지 id, 이미 보유했거나 지급하지 못했으면 null.
 */
export async function grantSignupBadge(supabase: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { error: insertError } = await supabase
      .from('user_activity_badges')
      .insert({ user_id: userId, badge_id: SIGNUP_COMPLETION_BADGE_ID, triggered_by: 'onboarding_quest' })

    if (insertError) {
      if (insertError.code !== '23505') {
        console.error('[grantSignupBadge] 배지 발급 오류:', insertError.message)
      }
      return null
    }

    const { data: badge, error: badgeError } = await supabase
      .from('badges')
      .select('name, image_url, rarity, point_reward, type, is_hidden, condition_json')
      .eq('id', SIGNUP_COMPLETION_BADGE_ID)
      .is('deleted_at', null)
      .maybeSingle()

    if (badgeError || !badge) {
      // 배지는 이미 발급됐다 — 포인트·피드만 생략하고 지급 자체는 성공으로 본다.
      console.error('[grantSignupBadge] 배지 정보 조회 실패:', badgeError?.message ?? '행 없음')
      return SIGNUP_COMPLETION_BADGE_ID
    }

    // 챕터 점수 «배지 받기»(운영 로직 12.2절). 새 행을 실제로 넣은 경우만 여기 온다. 던지지 않는다.
    await awardBadgeReceiveScore(supabase, {
      userId,
      badge: { id: SIGNUP_COMPLETION_BADGE_ID, type: badge.type, is_hidden: badge.is_hidden, condition_json: badge.condition_json },
      origin: { triggeredBy: 'onboarding_quest' },
    })

    const pointReward = badge.point_reward ?? 0
    if (pointReward > 0) {
      await awardPoints(userId, pointReward, 'badge_point_reward', { sourceBadgeId: SIGNUP_COMPLETION_BADGE_ID })
    }

    await recordFeedEvent(userId, 'badge_earned', {
      badge_id: SIGNUP_COMPLETION_BADGE_ID,
      badge_name: badge.name,
      badge_image_url: badge.image_url ?? '',
      rarity: badge.rarity,
      ...(pointReward > 0 ? { point_reward: pointReward } : {}),
    })

    return SIGNUP_COMPLETION_BADGE_ID
  } catch (err) {
    console.error('[grantSignupBadge] 예외:', err)
    return null
  }
}
