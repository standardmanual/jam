import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { ActivityFeedRow } from '@/types/database'
import { hydrateFeedBadgeInfo } from '@/lib/activity-feed/hydrate'
import TopNav from '@/components/ui/TopNav'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { UsersIcon } from '@/components/ui/icons'
import FeedSection from '../FeedSection'
import { d } from '@/lib/i18n'

const FEED_LIMIT = 200

/**
 * 팔로잉 통합 활동 피드 (티켓 20260830_2030) — 투데이 홈 "오늘의 현황" 우 슬롯(친구 활동)의
 * 목적지. 신규 화면을 통째로 만들지 않고, 기존 `FeedSection`(단일 유저 전용 컴포넌트)을
 * 그대로 재사용하되 **쿼리만 팔로잉 유저 전체로 확장**한다(재사용 우선 원칙).
 *
 * FeedSection은 "누구의" 활동인지 표시하지 않는다(단일 유저 프로필 전용으로 설계됨) —
 * 여러 친구의 활동을 한 목록에 모으는 최소 구현이라 이벤트별 주체 표시는 없다.
 */
export default async function FriendFeedPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const { data: followsRaw, error: followsError } = await service
    .from('user_follows')
    .select('following_id')
    .eq('follower_id', user.id)
  // 20260901_1848: 조회 실패 시 팔로잉 0명으로 위장돼 "팔로잉 없음" 빈 화면이 뜬다 —
  // 실제로는 DB 오류인데 사용자가 "친구를 안 팔로우했다"로 오인할 수 있는 지점.
  if (followsError) console.error('[feed/page] user_follows 조회 실패', followsError)
  const followingIds = ((followsRaw ?? []) as { following_id: string }[]).map((f) => f.following_id)

  if (followingIds.length === 0) {
    return (
      <div className="min-h-full bg-surface text-text">
        <TopNav title={d.feed.friendFeedTitle} />
        <div className="px-[var(--spacing-16)] pt-[var(--spacing-16)] pb-[var(--spacing-32)]">
          <EmptyState
            icon={<UsersIcon className="w-8 h-8" />}
            title={d.todayStatus.noFollowing}
            description={d.feed.friendFeedEmptyBody}
          />
        </div>
      </div>
    )
  }

  const { data: feedRaw, error: feedError } = await service
    .from('user_activity_feed')
    .select('*')
    .in('user_id', followingIds)
    .order('created_at', { ascending: false })
    .limit(FEED_LIMIT)
  if (feedError) console.error('[feed/page] user_activity_feed 조회 실패', feedError)

  const feedItems = await hydrateFeedBadgeInfo((feedRaw ?? []) as ActivityFeedRow[])

  // 묶음 카드용 활동 이름 — [username]/page.tsx와 동일 패턴(20260827_018).
  // Strava 활동 id는 전역 유일값이라 여러 유저의 활동이 섞여도 키 충돌이 없다.
  const activityIds = [...new Set(
    feedItems.map((f) => f.strava_activity_id).filter((v): v is number => typeof v === 'number')
  )]
  const activityNames: Record<string, string> = {}
  if (activityIds.length > 0) {
    const { data: actRows, error: actRowsError } = await service
      .from('strava_activities')
      .select('strava_id, normalized')
      .in('user_id', followingIds)
      .in('strava_id', activityIds)
    if (actRowsError) console.error('[feed/page] strava_activities 조회 실패', actRowsError)
    for (const row of (actRows ?? []) as unknown as { strava_id: number; normalized: { name?: string } | null }[]) {
      const name = typeof row.normalized?.name === 'string' ? row.normalized.name.trim() : ''
      if (name) activityNames[String(row.strava_id)] = name
    }
  }

  return (
    <div className="min-h-full bg-surface text-text">
      <TopNav title={d.feed.friendFeedTitle} />
      <div className="px-[var(--spacing-16)] pt-[var(--spacing-16)] pb-[var(--spacing-32)]">
        <FeedSection feedItems={feedItems} title={d.feed.friendFeedTitle} activityNames={activityNames} />
      </div>
    </div>
  )
}
