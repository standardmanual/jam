import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { buildBadgeActivityTrees, type BadgeTreeSourceBadge, type BadgeTreeSourceMission } from '@/lib/badgeTree'
import BadgeTreeClient from './BadgeTreeClient'

/**
 * 배지 트리(/badges/tree) — 티켓 20260831_2208.
 *
 * `/badges/[id]`보다 정적 세그먼트가 우선 매칭되므로 라우트 충돌은 없다.
 * `badges/page.tsx`와 동일하게 서버 컴포넌트에서 Supabase를 직접 조회한다(API route 신설 안 함).
 * 이 페이지는 `supabase.auth.getUser()`(쿠키 기반)를 호출하므로 badges/page.tsx와 동일하게
 * 자동으로 동적 렌더링된다 — 빌드 타임 스냅샷이 아니라 매 요청 최신 DB 상태를 반영한다.
 */
export default async function BadgeTreePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // missions는 다른 화면(missions/page.tsx)과 동일하게 RLS 우회가 필요해 service client로 조회한다.
  const service = createServiceClient()

  const [
    { data: badgesRaw, error: badgesError },
    { data: missionsRaw, error: missionsError },
    { data: earnedBadgesRaw, error: earnedBadgesError },
  ] = await Promise.all([
    supabase
      .from('badges')
      .select('id, name, rarity, description, image_url, activity_types, condition_json, point_reward')
      .eq('type', 'activity')
      .is('deleted_at', null)
      .not('activity_types', 'is', null),
    service.from('missions').select('id, title, gated_badge_id').not('gated_badge_id', 'is', null),
    // badges/page.tsx(27~38행)와 동일한 패턴 — 미획득 배지를 흑백/반투명으로 구분하기 위해
    // 이 유저의 실제 획득 여부를 조회한다(티켓 20260831_2250).
    supabase
      .from('user_activity_badges')
      .select('badge_id, badge:badges(deleted_at)')
      .eq('user_id', user.id),
  ])
  if (badgesError) console.error('[badges/tree/page] 활동 배지 조회 실패', badgesError)
  if (missionsError) console.error('[badges/tree/page] missions(게이트 배지용) 조회 실패', missionsError)
  if (earnedBadgesError) console.error('[badges/tree/page] user_activity_badges(획득여부) 조회 실패', earnedBadgesError)

  type RawBadge = BadgeTreeSourceBadge & { point_reward: number }
  const badges: BadgeTreeSourceBadge[] = ((badgesRaw ?? []) as RawBadge[]).map((b) => ({
    id: b.id,
    name: b.name,
    rarity: b.rarity,
    description: b.description,
    image_url: b.image_url,
    activity_types: b.activity_types,
    condition_json: b.condition_json,
  }))
  const missions = (missionsRaw ?? []) as BadgeTreeSourceMission[]

  // 소프트 삭제된 배지(badges.deleted_at)는 이미 badges 조회에서 빠져 트리에 그려지지 않으므로
  // 여기서 걸러도 실질적 영향은 없지만, badges/page.tsx와 동일한 필터링 원칙을 유지한다.
  type RawEarnedBadge = { badge_id: string; badge: { deleted_at: string | null } | null }
  const earnedBadgeIdSet = new Set(
    ((earnedBadgesRaw ?? []) as RawEarnedBadge[])
      .filter((r) => r.badge && !r.badge.deleted_at)
      .map((r) => r.badge_id)
  )
  const earnedBadgeIds = Array.from(earnedBadgeIdSet)

  // earnedBadgeIdSet도 선행 배지 잠금칩의 "이미 획득함" 판정에 쓰인다(20260901 UI 수정).
  const trees = buildBadgeActivityTrees(badges, missions, earnedBadgeIdSet)

  return <BadgeTreeClient trees={trees} earnedBadgeIds={earnedBadgeIds} />
}
