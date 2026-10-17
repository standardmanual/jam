/**
 * 컬렉션 장착 직후 보상 배지 발급의 API 라우트용 래퍼 (서버 사이드 전용, 티켓 20261001_0635)
 *
 * 장착 RPC(`slot_item_into_book`, 마이그레이션 179)는 컬렉션을 완성하면 완성 기록과 완성 포인트까지만
 * 만들고 보상 배지(`item_books.reward_badge_id`)는 주지 않는다. 동기화 보정(`checkItemBookCompletion`)은
 * 완성 기록이 이미 있으면 건너뛰어서, 장착으로 완성한 유저는 보상 배지를 받지 못했다. 장착 라우트가
 * 성공한 뒤 이 함수를 `after()`로 불러 그 컬렉션의 보상 배지를 바로 발급한다. 발급은 동기화 보정과
 * **같은 함수**(`issueItemBookRewardBadges`)를 쓴다 — 이미 보유했거나 동시 발급 경합이면 건너뛰므로 두
 * 경로가 겹쳐도 같은 배지는 한 번만 나간다.
 *
 * 파일을 `checker.ts`와 나눈 이유: 이 파일이 `sync.ts`의 `notifyActivityBadgesEarned`를 import하는데
 * `sync.ts`가 `checker.ts`를 import하므로, 알림 호출을 `checker.ts`에 두면 순환이 생긴다
 * (`jamActionRoute.ts`와 같은 이유).
 *
 * **어떤 예외도 밖으로 던지지 않는다.** 보상 배지 발급·알림이 실패해도 장착 응답은 그대로여야 하고,
 * 놓친 발급은 다음 동기화 보정이 따라잡기 때문이다(`runJamActionEvaluation`과 같은 형태).
 *
 * 획득한 배지는 새 알림 타입 없이 기존 `activity_recap` 결산으로 알린다(귀속시킬 Strava 활동이 없어
 * `activityIds`는 빈 배열).
 */
import { createServiceClient } from '@/lib/supabase/server'
import { notifyActivityBadgesEarned } from '@/lib/strava/sync'
import type { Database } from '@/types/database.generated'
import { issueItemBookRewardBadges, type ItemBookRewardFields } from './checker'

type BadgeRarity = Database['public']['Enums']['badge_rarity']

/**
 * @param completedTier 등급별 컬렉션(`tier_mode`) 장착 RPC(`slot_item_into_book_tiered`)가 돌려준 `completed_tier`.
 *   값이 있으면 그 등급을 이번 장착으로 «새로» 완성한 것이다(RPC는 그 등급을 처음 기록했을 때만 값을 돌려주므로 완성 기록을
 *   다시 조회하지 않는다). 그 등급의 보상 배지(`item_book_tier_rewards.reward_badge_id`)를 발급한다.
 *   값이 없으면 지금 경로 그대로다(컬렉션 단위 완성 기록과 `item_books.reward_badge_id`) — 티켓 20261016_2340.
 */
export async function runSlotRewardIssue(
  userId: string,
  itemBookId: string,
  completedTier?: string | null
): Promise<void> {
  try {
    const service = createServiceClient()

    // 보상 배지가 없는 컬렉션이 대부분이라 컬렉션을 먼저 읽어 일찍 끝낸다
    const { data: bookRaw, error: bookError } = await service
      .from('item_books')
      .select('id, name, reward_badge_id')
      .eq('id', itemBookId)
      .maybeSingle()
    if (bookError) {
      console.error(`[runSlotRewardIssue] item_books 조회 오류 (userId: ${userId}, book: ${itemBookId}):`, bookError)
      return
    }
    const book = bookRaw as ItemBookRewardFields | null
    if (!book) return

    let rewardBook: ItemBookRewardFields
    if (completedTier) {
      // 등급 보상 — 컬렉션 단위 보상 배지(`item_books.reward_badge_id`)가 아니라 그 등급의 행을 읽는다
      const { data: tierRewardRaw, error: tierRewardError } = await service
        .from('item_book_tier_rewards')
        .select('reward_badge_id')
        .eq('item_book_id', itemBookId)
        .eq('tier', completedTier as BadgeRarity)
        .maybeSingle()
      if (tierRewardError) {
        console.error(
          `[runSlotRewardIssue] 등급 보상 조회 오류 (userId: ${userId}, book: ${itemBookId}, tier: ${completedTier}):`,
          tierRewardError
        )
        return
      }
      const tierRewardBadgeId = (tierRewardRaw as { reward_badge_id: string | null } | null)?.reward_badge_id
      if (!tierRewardBadgeId) return
      rewardBook = { id: book.id, name: book.name, reward_badge_id: tierRewardBadgeId }
    } else {
      if (!book.reward_badge_id) return

      // 이 장착으로 완성됐는지는 장착 RPC가 남긴 완성 기록으로 본다 — 완성이 아니면 발급하지 않는다
      const { data: completion, error: completionError } = await service
        .from('user_item_book_completions')
        .select('item_book_id')
        .eq('user_id', userId)
        .eq('item_book_id', itemBookId)
        .maybeSingle()
      if (completionError) {
        console.error(`[runSlotRewardIssue] 완성 기록 조회 오류 (userId: ${userId}, book: ${itemBookId}):`, completionError)
        return
      }
      if (!completion) return
      rewardBook = book
    }

    const issuedBadgeIds = await issueItemBookRewardBadges(service, userId, [rewardBook])
    if (issuedBadgeIds.length === 0) return

    await notifyActivityBadgesEarned(service, userId, issuedBadgeIds, [])
  } catch (error) {
    console.error(`[runSlotRewardIssue] 장착 보상 배지 발급 실패 (userId: ${userId}, book: ${itemBookId}):`, error)
  }
}
