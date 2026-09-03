import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { buildBadgeActivityTrees, type BadgeTreeSourceBadge, type BadgeTreeSourceMission } from '@/lib/badgeTree'
import { collectConditionCheckTargets, computeConditionMetBadgeIds } from '@/lib/badgeTreeConditionCheck.server'
import { getActivityHistory } from '@/lib/strava/activity-history'
import BadgeTreeClient from './BadgeTreeClient'

/** 직전 동기화 배너(RecentSyncBanner) 노출 기준 — 이 시간 안에 동기화된 활동이 있으면 보여준다. */
const RECENT_SYNC_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * `Date.now()`(비순수 호출)를 컴포넌트 함수 본문 밖으로 뺀 순수 헬퍼 —
 * react-hooks/purity가 컴포넌트 본문 안의 비순수 호출을 막는다.
 */
function isWithinRecentSyncWindow(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false
  return Date.now() - new Date(createdAt).getTime() < RECENT_SYNC_WINDOW_MS
}

/**
 * 배지 트리(/badges/tree) — 티켓 20260831_2208, 20260903_2329(계열 진행 레일 1차).
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
    { data: latestSyncRaw, error: latestSyncError },
  ] = await Promise.all([
    supabase
      .from('badges')
      .select('id, name, rarity, description, image_url, activity_types, condition_json, point_reward')
      .eq('type', 'activity')
      .is('deleted_at', null)
      .not('activity_types', 'is', null),
    service.from('missions').select('id, title, gated_badge_id, image_url').not('gated_badge_id', 'is', null),
    // badges/page.tsx(27~38행)와 동일한 패턴 — 미획득 배지를 흑백/반투명으로 구분하기 위해
    // 이 유저의 실제 획득 여부를 조회한다(티켓 20260831_2250).
    supabase
      .from('user_activity_badges')
      .select('badge_id, badge:badges(deleted_at)')
      .eq('user_id', user.id),
    // RecentSyncBanner(1차: boolean 이벤트만)용 — 가장 최근에 동기화된 활동 1건의 시각만 필요.
    // strava_activities는 [username]/page.tsx·feed/page.tsx와 동일하게 service client로 조회한다
    // (이 테이블은 RLS를 일반 세션 클라이언트에 열어주지 않는다 — 두 화면 모두 service를 쓴다).
    service
      .from('strava_activities')
      .select('created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (badgesError) console.error('[badges/tree/page] 활동 배지 조회 실패', badgesError)
  if (missionsError) console.error('[badges/tree/page] missions(게이트 배지용) 조회 실패', missionsError)
  if (earnedBadgesError) console.error('[badges/tree/page] user_activity_badges(획득여부) 조회 실패', earnedBadgesError)
  if (latestSyncError) console.error('[badges/tree/page] strava_activities(최근 동기화) 조회 실패', latestSyncError)

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

  // 게이트(미션·선행배지)가 안 열린 미획득 눈금만 추려, 기존 evaluateConditionDetailed
  // pass/fail(checkCondition)로 "조건 충족(라임)"과 "게이트잠김"을 가른다 — 새 진행 계산
  // 모듈 없이 기존 함수만 재사용한다(티켓 20260903_2329 "단계 분리 근거").
  const allStages = trees.flatMap((tree) => tree.families.flatMap((family) => family.stages))
  const targetIds = collectConditionCheckTargets(allStages, earnedBadgeIdSet)
  const conditionById = new Map(badges.map((b) => [b.id, b.condition_json]))
  // getActivityHistory도 badge-engine/missions checker와 동일하게 service client로 호출한다
  // (badge-engine/index.ts:627, missions/checker.ts:119 — 둘 다 service client를 넘긴다).
  const activities = targetIds.length > 0 ? await getActivityHistory(service, user.id) : []
  const conditionMetBadgeIds = Array.from(computeConditionMetBadgeIds(targetIds, conditionById, activities))

  const hasRecentSync = isWithinRecentSyncWindow(latestSyncRaw?.created_at)

  return (
    <BadgeTreeClient
      trees={trees}
      earnedBadgeIds={earnedBadgeIds}
      conditionMetBadgeIds={conditionMetBadgeIds}
      hasRecentSync={hasRecentSync}
    />
  )
}
