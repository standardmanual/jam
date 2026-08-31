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

  const [{ data: badgesRaw }, { data: missionsRaw }] = await Promise.all([
    supabase
      .from('badges')
      .select('id, name, rarity, description, image_url, activity_types, condition_json, point_reward')
      .eq('type', 'activity')
      .is('deleted_at', null)
      .not('activity_types', 'is', null),
    service.from('missions').select('id, title, gated_badge_id').not('gated_badge_id', 'is', null),
  ])

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

  const trees = buildBadgeActivityTrees(badges, missions)

  return <BadgeTreeClient trees={trees} />
}
