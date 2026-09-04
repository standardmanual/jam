import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  buildBadgeActivityTrees,
  type BadgeTreeSourceBadge,
  type BadgeTreeSourceMission,
  type BadgeTreeLock,
} from '@/lib/badgeTree'
import { collectConditionCheckTargets, computeConditionMetBadgeIds } from '@/lib/badgeTreeConditionCheck.server'
import { getActivityHistory } from '@/lib/strava/activity-history'
import {
  computeUserPeriodMetrics,
  computeBadgeProgress,
  computeRecordRegretLine,
  type BadgeProgress,
  type BadgeProgressAxis,
  type RegretLineData,
} from '@/lib/badge-engine/badgeProgress'
import { getMetricLabels } from '@/lib/badge-engine/metricLabels'
import {
  pickSyncComparisonCandidate,
  formatSyncComparisonText,
  type FamilyProgressAxisSnapshot,
} from '@/lib/badgeProgressText'
import type { ActivityType, BadgeCondition } from '@/types/database'
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
 * 배지 트리(/badges/tree) — 티켓 20260831_2208, 20260903_2329(계열 진행 레일 1차),
 * 20260904_0921(2c — 진행 수치 최초 연결).
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
    { data: familyProgressRaw, error: familyProgressError },
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
    // RecentSyncBanner "직전 상태값과의 비교"(3b, 티켓 20260904_1425)용 — 계열별 current/prev
    // 진행 스냅샷 전체(최대 약 72행). user_family_progress는 티켓 20260904_1156이 지정한 대로
    // service_role 전용(RLS 정책 없음)이라 service client로 조회한다.
    service.from('user_family_progress').select('current, prev').eq('user_id', user.id),
  ])
  if (badgesError) console.error('[badges/tree/page] 활동 배지 조회 실패', badgesError)
  if (missionsError) console.error('[badges/tree/page] missions(게이트 배지용) 조회 실패', missionsError)
  if (earnedBadgesError) console.error('[badges/tree/page] user_activity_badges(획득여부) 조회 실패', earnedBadgesError)
  if (latestSyncError) console.error('[badges/tree/page] strava_activities(최근 동기화) 조회 실패', latestSyncError)
  if (familyProgressError) console.error('[badges/tree/page] user_family_progress(직전 동기화 비교) 조회 실패', familyProgressError)

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

  // RecentSyncBanner "직전 상태값과의 비교"(3b, 티켓 20260904_1425) — 계열 전체에서 가장
  // 눈에 띄는 진전(fraction 증가폭이 가장 큰 축) 하나를 고른다. 이 시점엔 라벨이 아직 없다 —
  // 축 key만 뽑아 아래 axisKeys 수집에 합류시키고, 실제 문장 조립은 labelMap 조회 이후에 한다
  // (getMetricLabels() 왕복을 늘리지 않기 위해 — 상세 요구사항 "같은 요청 안에서 처리").
  type RawFamilyProgress = { current: unknown; prev: unknown }
  const familyProgressSnapshots: FamilyProgressAxisSnapshot[] = ((familyProgressRaw ?? []) as RawFamilyProgress[]).map(
    (row) => ({
      current: (row.current ?? []) as BadgeProgressAxis[],
      prev: (row.prev ?? null) as BadgeProgressAxis[] | null,
    })
  )
  const syncComparisonCandidate = pickSyncComparisonCandidate(familyProgressSnapshots)

  // earnedBadgeIdSet도 선행 배지 잠금칩의 "이미 획득함" 판정에 쓰인다(20260901 UI 수정).
  const trees = buildBadgeActivityTrees(badges, missions, earnedBadgeIdSet)

  // 게이트(미션·선행배지)가 안 열린 미획득 눈금만 추려, 기존 evaluateConditionDetailed
  // pass/fail(checkCondition)로 "조건 충족(라임)"과 "게이트잠김"을 가른다 — 새 진행 계산
  // 모듈 없이 기존 함수만 재사용한다(티켓 20260903_2329 "단계 분리 근거").
  const allStages = trees.flatMap((tree) => tree.families.flatMap((family) => family.stages))
  const targetIds = collectConditionCheckTargets(allStages, earnedBadgeIdSet)
  const conditionById = new Map(badges.map((b) => [b.id, b.condition_json]))

  // ── 진행 수치(2c, 티켓 20260904_0921) ────────────────────────────────────
  // 대상: 계열의 프런티어(첫 미획득 눈금, 게이트 열림 여부 무관) + 미획득 독립 배지(트로피
  // 그리드). 1차의 targetIds(게이트가 안 열린 것만)보다 넓다 — 게이트가 이미 열린
  // not-reached 프런티어에도 진행 수치가 필요하기 때문이다.
  type ProgressTarget = {
    id: string
    condition: BadgeCondition
    locks: BadgeTreeLock[]
    activityType: ActivityType
    /** 아쉬움 줄(§05)은 레일(계열 프런티어)에만 붙는다 — 트로피 그리드에는 없다 */
    isFamilyFrontier: boolean
  }
  const progressTargets: ProgressTarget[] = []
  for (const tree of trees) {
    for (const family of tree.families) {
      const frontier = family.stages.find((s) => !earnedBadgeIdSet.has(s.id))
      if (!frontier) continue // 계열 전부 획득 — 진행 표시 불필요
      const condition = conditionById.get(frontier.id)
      if (condition) {
        progressTargets.push({
          id: frontier.id, condition, locks: frontier.locks, activityType: tree.activityType, isFamilyFrontier: true,
        })
      }
    }
    for (const badge of tree.independentBadges) {
      if (earnedBadgeIdSet.has(badge.id)) continue // 이미 획득 — 그리드가 100%로 고정 표시
      const condition = conditionById.get(badge.id)
      if (condition) {
        progressTargets.push({
          id: badge.id, condition, locks: badge.locks, activityType: tree.activityType, isFamilyFrontier: false,
        })
      }
    }
  }

  // getActivityHistory도 badge-engine/missions checker와 동일하게 service client로 호출한다
  // (badge-engine/index.ts:627, missions/checker.ts:119 — 둘 다 service client를 넘긴다).
  const activities =
    targetIds.length > 0 || progressTargets.length > 0 ? await getActivityHistory(service, user.id) : []
  const conditionMetBadgeIds = Array.from(computeConditionMetBadgeIds(targetIds, conditionById, activities))

  // (user, activity_type) 하나당 한 번만 집계(2b 설계 그대로) — 트리에 등장하는 종목만.
  const now = new Date()
  const metricsByActivityType = new Map<ActivityType, ReturnType<typeof computeUserPeriodMetrics>>()
  for (const tree of trees) {
    if (!metricsByActivityType.has(tree.activityType)) {
      metricsByActivityType.set(tree.activityType, computeUserPeriodMetrics(tree.activityType, activities, now))
    }
  }

  // 라벨 배치 조회 — 실제로 쓰일 축 key를 먼저 모아야 getMetricLabels()를 1회만 부를 수
  // 있다. 1차 패스(빈 라벨맵)로 key만 수집하고 실제 라벨은 2차 패스에서 채운다(2a 설계
  // 의도: 배지·등급마다 개별 호출 금지). computeBadgeProgress는 순수 함수라 두 번 불러도
  // side-effect가 없다 — DB 조회(getMetricLabels)만 정확히 1회로 지킨다.
  const emptyLabelMap = new Map<string, { label: string; unit: string | null }>()
  const axisKeys = new Set<string>()
  for (const target of progressTargets) {
    const metrics = metricsByActivityType.get(target.activityType)!
    try {
      const probe = computeBadgeProgress(target.condition, metrics, emptyLabelMap, target.locks)
      if (probe.kind !== 'unsupported') {
        for (const axis of probe.axes) axisKeys.add(axis.key)
      }
    } catch (error) {
      console.error('[badges/tree/page] computeBadgeProgress 프로브 실패 — 라벨 key 수집 생략', target.id, error)
    }
  }
  // 직전 동기화 비교 후보의 축도 같은 배치 조회에 합류시킨다 — 별도 왕복 없음.
  if (syncComparisonCandidate) axisKeys.add(syncComparisonCandidate.axisKey)
  const labelMap = await getMetricLabels(Array.from(axisKeys))
  const syncComparisonMessage = syncComparisonCandidate
    ? formatSyncComparisonText(syncComparisonCandidate, labelMap)
    : null

  // 배지별 진행 계산 — 실패해도(예: 예상 못한 condition_json 형태) 그 배지 하나만 진행
  // 표시를 생략한다(2b가 남긴 잔여 이슈 — "배지별 try/catch 방어막" 반영). 레일·그리드는
  // BadgeProgress 원본 객체를 그대로 받아 표시 문구는 클라이언트(badgeProgressText.ts)가 만든다.
  const progressByBadgeId: Record<string, BadgeProgress> = {}
  const regretLineByBadgeId: Record<string, RegretLineData> = {}
  for (const target of progressTargets) {
    const metrics = metricsByActivityType.get(target.activityType)!
    try {
      const progress = computeBadgeProgress(target.condition, metrics, labelMap, target.locks)
      progressByBadgeId[target.id] = progress
      if (target.isFamilyFrontier && progress.kind === 'record') {
        const regret = computeRecordRegretLine(target.condition, metrics, labelMap)
        if (regret) regretLineByBadgeId[target.id] = regret
      }
    } catch (error) {
      console.error('[badges/tree/page] computeBadgeProgress 실패 — 진행 표시 생략', target.id, error)
    }
  }

  const hasRecentSync = isWithinRecentSyncWindow(latestSyncRaw?.created_at)

  return (
    <BadgeTreeClient
      trees={trees}
      earnedBadgeIds={earnedBadgeIds}
      conditionMetBadgeIds={conditionMetBadgeIds}
      hasRecentSync={hasRecentSync}
      syncComparisonMessage={syncComparisonMessage}
      progressByBadgeId={progressByBadgeId}
      regretLineByBadgeId={regretLineByBadgeId}
    />
  )
}
