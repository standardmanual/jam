// 배지함 «액티비티» 탭 목록의 조회·필터·접기 — 화면(badges/page)과 미리 받기 API가 같은 함수를 쓴다
// (티켓 20261115_1344: 주소가 한 글자라도 다르면 캐시가 맞지 않으므로 목록 규칙을 한 곳에 둔다).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BadgeRow, UserActivityBadgeRow } from '@/types/database'
import { pickHighestLevelPerFamily } from '@/lib/activity-feed/collapseLeveled'

/** 액티비티 배지 — 획득분만 `earned_at` 내림차순으로 조회한다(티켓 20260901_0911). */
export function queryEarnedActivityBadges(supabase: SupabaseClient, userId: string) {
  return supabase
    .from('user_activity_badges')
    .select('*, badge:badges(*)')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false })
}

/**
 * 소프트 삭제된 배지를 숨기고, activity 타입만 남기고(20260906_2023 화면 쪽 마지막 방어선),
 * 레벨형은 계열당 최고 레벨 한 장만 남긴다(티켓 20261108_1622).
 * earn_history는 생성 타입상 Json, 손으로 쓴 Row 타입상 BadgeEarnHistoryEntry[]라 unknown을 한 번 거친다.
 */
export function buildActivityBadgeList(
  earnedBadges: unknown,
): Array<{ badge: BadgeRow; earned: UserActivityBadgeRow }> {
  return pickHighestLevelPerFamily(
    ((earnedBadges ?? []) as Array<{ badge: BadgeRow } & UserActivityBadgeRow>)
      .filter((r) => r.badge && !r.badge.deleted_at && r.badge.type === 'activity')
      .map((r) => ({ badge: r.badge, earned: r })),
  )
}
