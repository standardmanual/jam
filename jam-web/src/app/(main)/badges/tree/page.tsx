import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  buildBadgeActivityTrees,
  frontierStageOf,
  type BadgeTreeSourceBadge,
  type BadgeTreeSourceMission,
  type BadgeTreeLock,
} from '@/lib/badgeTree'
import { collectConditionCheckTargets, computeConditionMetBadgeIds } from '@/lib/badgeTreeConditionCheck.server'
import { getActivityHistory, getSignupAnchorDate } from '@/lib/strava/activity-history'
import {
  computeUserPeriodMetrics,
  computeBadgeProgress,
  computeRecordRegretLine,
  type BadgeProgress,
  type BadgeProgressAxis,
  type BadgeProgressOptions,
  type RegretLineData,
} from '@/lib/badge-engine/badgeProgress'
// 배지 «종류» 판정의 단일 출처 — 진행 대상 선정이 발급 엔진과 같은 기준을 본다
// (티켓 20260905_0031).
import { badgeKindOf } from '@/lib/badge-engine/badgeKind'
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
 * PostgREST 기본 페이지 상한. 이 크기로 끝까지 훑는다 — `badges/page.tsx`(46~52행)에
 * **1000행 절단 사고 기록**이 있고, 여기는 싱크 스냅샷이 아니라 «유저가 보는 화면 본체»라
 * 잘리면 배지 자체가 사라진다. v5 활동 배지는 630종이라 지금은 1페이지지만 여유가 절반뿐이다.
 */
const BADGE_PAGE_SIZE = 1000

const BADGE_TREE_SELECT =
  'id, name, rarity, level, family_key, description, image_url, activity_types, condition_json, sort_order'

/**
 * `Date.now()`(비순수 호출)를 컴포넌트 함수 본문 밖으로 뺀 순수 헬퍼 —
 * react-hooks/purity가 컴포넌트 본문 안의 비순수 호출을 막는다.
 */
function isWithinRecentSyncWindow(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false
  return Date.now() - new Date(createdAt).getTime() < RECENT_SYNC_WINDOW_MS
}

type RawBadge = BadgeTreeSourceBadge & { level: number | null }

/**
 * 활동 배지 전량을 페이지네이션으로 읽는다 — `badges/page.tsx`의 청킹 선례와 같은 태도.
 * `id` 오름차순으로 못 박아야 페이지 경계가 흔들리지 않는다(정렬이 없으면 PostgREST가
 * 페이지마다 다른 순서를 줄 수 있다).
 */
async function fetchAllActivityBadges(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<RawBadge[]> {
  const rows: RawBadge[] = []
  for (let from = 0; ; from += BADGE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('badges')
      .select(BADGE_TREE_SELECT)
      .eq('type', 'activity')
      .is('deleted_at', null)
      .not('activity_types', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + BADGE_PAGE_SIZE - 1)
    if (error) {
      console.error('[badges/tree/page] 활동 배지 조회 실패', error)
      break
    }
    const page = (data ?? []) as unknown as RawBadge[]
    rows.push(...page)
    if (page.length < BADGE_PAGE_SIZE) break
  }
  return rows
}

/**
 * 축 라벨을 나중에 채운다 — **진행 계산을 한 번만 돌리기 위한 것**이다(티켓 20260905_0037).
 *
 * 예전에는 `getMetricLabels()`를 1회로 유지하려고 «빈 라벨맵으로 프로브 → 라벨 조회 →
 * 같은 계산 재실행» **2패스**를 돌았다. 630종이면 요청당 최대 1,260회이고, 서버 컴포넌트
 * 동기 계산이라 TTFB에 그대로 실린다. `labelMap`은 `computeBadgeProgress` 안에서 축의
 * `label`/`unit`만 채우고 `current`·`target`·`met`·`fraction` 어디에도 관여하지 않으므로,
 * 결과 축에 라벨만 덮어쓰면 2패스와 **완전히 같은 값**이 나온다.
 */
function withResolvedAxisLabels(
  progress: BadgeProgress,
  labelMap: Map<string, { label: string; unit: string | null }>
): BadgeProgress {
  if (progress.kind === 'unsupported') return progress
  return {
    ...progress,
    axes: progress.axes.map((axis) => {
      const found = labelMap.get(axis.key)
      // 라벨맵에 없는 축은 1패스에서 이미 레지스트리 폴백(또는 key 원문)을 받았다 — 건드리지 않는다.
      return found ? { ...axis, label: found.label, unit: found.unit } : axis
    }),
  }
}

/**
 * 배지 트리(/badges/tree) — 티켓 20260831_2208, 20260903_2329, 20260904_0921,
 * 20260905_0037(전면 리뉴얼: 계열 정의를 `family_key` 기준으로, 진행 계산을 1패스로).
 *
 * `/badges/[id]`보다 정적 세그먼트가 우선 매칭되므로 라우트 충돌은 없다.
 * `badges/page.tsx`와 동일하게 서버 컴포넌트에서 Supabase를 직접 조회한다(API route 신설 안 함).
 * 이 페이지는 `supabase.auth.getUser()`(쿠키 기반)를 호출하므로 자동으로 동적 렌더링된다.
 *
 * `?activity=` — 열어둘 종목 탭(티켓 20260906_1158). `badges/page.tsx`의 `?tab=`과 같은 패턴이다.
 * 서버 조회 범위는 바꾸지 않는다 — 트리는 전 종목을 어차피 다 만들고, 쿼리는 어느 탭을 열지만 정한다.
 */
interface Props {
  searchParams: Promise<{ activity?: string }>
}

export default async function BadgeTreePage({ searchParams }: Props) {
  const { activity } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // missions는 다른 화면(missions/page.tsx)과 동일하게 RLS 우회가 필요해 service client로 조회한다.
  const service = createServiceClient()

  const [
    badgesRaw,
    { data: missionsRaw, error: missionsError },
    { data: earnedBadgesRaw, error: earnedBadgesError },
    { data: latestSyncRaw, error: latestSyncError },
    { data: familyProgressRaw, error: familyProgressError },
  ] = await Promise.all([
    fetchAllActivityBadges(supabase),
    service.from('missions').select('id, title, gated_badge_id, image_url').not('gated_badge_id', 'is', null),
    // badges/page.tsx(27~38행)와 동일한 패턴 — 미획득 배지를 흑백으로 구분하기 위해
    // 이 유저의 실제 획득 여부를 조회한다(티켓 20260831_2250).
    supabase
      .from('user_activity_badges')
      .select('badge_id, badge:badges(deleted_at)')
      .eq('user_id', user.id),
    // RecentSyncBanner용 — 가장 최근에 동기화된 활동 1건의 시각만 필요.
    service
      .from('strava_activities')
      .select('created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // RecentSyncBanner "직전 상태값과의 비교"(3b, 티켓 20260904_1425)용 — 계열별 current/prev
    // 진행 스냅샷. user_family_progress는 service_role 전용(RLS 정책 없음)이다.
    service.from('user_family_progress').select('current, prev').eq('user_id', user.id),
  ])
  if (missionsError) console.error('[badges/tree/page] missions(게이트 배지용) 조회 실패', missionsError)
  if (earnedBadgesError) console.error('[badges/tree/page] user_activity_badges(획득여부) 조회 실패', earnedBadgesError)
  if (latestSyncError) console.error('[badges/tree/page] strava_activities(최근 동기화) 조회 실패', latestSyncError)
  if (familyProgressError) console.error('[badges/tree/page] user_family_progress(직전 동기화 비교) 조회 실패', familyProgressError)

  const badges: BadgeTreeSourceBadge[] = badgesRaw.map((b) => ({
    id: b.id,
    name: b.name,
    rarity: b.rarity,
    level: b.level,
    family_key: b.family_key,
    description: b.description,
    image_url: b.image_url,
    activity_types: b.activity_types,
    condition_json: b.condition_json,
    sort_order: b.sort_order,
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

  // RecentSyncBanner "직전 상태값과의 비교"(3b) — 계열 전체에서 가장 눈에 띄는 진전 하나.
  // 이 시점엔 라벨이 아직 없다 — 축 key만 뽑아 아래 axisKeys 수집에 합류시킨다.
  type RawFamilyProgress = { current: unknown; prev: unknown }
  const familyProgressSnapshots: FamilyProgressAxisSnapshot[] = ((familyProgressRaw ?? []) as RawFamilyProgress[]).map(
    (row) => ({
      current: (row.current ?? []) as BadgeProgressAxis[],
      prev: (row.prev ?? null) as BadgeProgressAxis[] | null,
    })
  )
  const syncComparisonCandidate = pickSyncComparisonCandidate(familyProgressSnapshots)

  // earnedBadgeIdSet도 선행 배지 잠금칩의 "이미 획득함" 판정에 쓰인다.
  const trees = buildBadgeActivityTrees(badges, missions, earnedBadgeIdSet)

  // 게이트(미션·선행배지·교차)가 안 열린 미획득 눈금만 추려, 기존 evaluateConditionDetailed
  // pass/fail(checkCondition)로 "조건 충족(라임)"과 "게이트잠김"을 가른다.
  const allStages = trees.flatMap((tree) => tree.families.flatMap((family) => family.stages))
  const targetIds = collectConditionCheckTargets(allStages, earnedBadgeIdSet)
  const conditionById = new Map(badges.map((b) => [b.id, b.condition_json]))

  // ── 진행 수치 ────────────────────────────────────────────────────────────
  // 대상: **「다음 목표」 섹션에 실제로 그려지는 계열의 프런티어 하나씩**이다.
  // 다 받은 계열(=「받은 배지」 섹션)은 진행 표시가 없으므로 계산도 하지 않는다 — 화면이
  // 접어 두는 것을 서버도 계산하지 않는 것이 이 리뉴얼의 성능 축이다(티켓 20260905_0037).
  type ProgressTarget = {
    id: string
    condition: BadgeCondition
    locks: BadgeTreeLock[]
    activityType: ActivityType
    /** `computeBadgeProgress`가 조건만으로는 알 수 없는 배지 속성(무한레벨형 여부·레벨) */
    options: BadgeProgressOptions
  }
  // 배지 종류 판정은 `badgeKind.ts` 한 곳이다 — 여기서 다시 선언하면 발급 엔진과 갈라진다.
  const badgeById = new Map(badgesRaw.map((b) => [b.id, b]))
  const progressOptionsFor = (id: string): BadgeProgressOptions => {
    const row = badgeById.get(id)
    if (!row) return {}
    return { badgeKind: badgeKindOf(row), level: row.level ?? null }
  }
  const progressTargets: ProgressTarget[] = []
  for (const tree of trees) {
    for (const family of tree.families) {
      // 반복형은 다 받은 뒤에도 다음 회차가 진행 중이라 프런티어가 남는다
      // (`frontierStageOf` 주석 — 티켓 20260905_0031).
      const frontier = frontierStageOf(family, earnedBadgeIdSet)
      if (!frontier) continue
      const condition = conditionById.get(frontier.id)
      if (!condition) continue
      progressTargets.push({
        id: frontier.id,
        condition,
        locks: frontier.locks,
        activityType: tree.activityType,
        options: progressOptionsFor(frontier.id),
      })
    }
  }

  // getActivityHistory도 badge-engine/missions checker와 동일하게 service client로 호출한다.
  // 이력의 시작점은 가입 시점으로 고정한다 — 화면(진행률)과 발급 엔진이 같은 창을 봐야
  // 한다(티켓 20260905_0030 §5).
  const needsHistory = targetIds.length > 0 || progressTargets.length > 0
  const anchorDate = needsHistory ? await getSignupAnchorDate(service, user.id) : undefined
  const activities = needsHistory ? await getActivityHistory(service, user.id, anchorDate) : []
  // 앵커를 함께 넘긴다 — 휴식 조건(§4)이 발급 엔진과 같은 창에서 공백을 세야 한다.
  const conditionMetBadgeIds = Array.from(
    computeConditionMetBadgeIds(targetIds, conditionById, activities, anchorDate)
  )

  // (user, activity_type) 하나당 한 번만 집계(2b 설계 그대로) — 트리에 등장하는 종목만.
  const now = new Date()
  const metricsByActivityType = new Map<ActivityType, ReturnType<typeof computeUserPeriodMetrics>>()
  for (const tree of trees) {
    if (!metricsByActivityType.has(tree.activityType)) {
      metricsByActivityType.set(tree.activityType, computeUserPeriodMetrics(tree.activityType, activities, now))
    }
  }

  // ── 1패스: 진행 계산 + 축 key 수집 (라벨은 아직 없다) ────────────────────
  // 배지별 try/catch — 예상 못한 condition_json 형태가 와도 그 배지 하나만 진행 표시를 생략한다.
  const emptyLabelMap = new Map<string, { label: string; unit: string | null }>()
  const computedByBadgeId = new Map<string, BadgeProgress>()
  const axisKeys = new Set<string>()
  for (const target of progressTargets) {
    const metrics = metricsByActivityType.get(target.activityType)!
    try {
      const progress = computeBadgeProgress(target.condition, metrics, emptyLabelMap, target.locks, target.options)
      computedByBadgeId.set(target.id, progress)
      if (progress.kind !== 'unsupported') {
        for (const axis of progress.axes) axisKeys.add(axis.key)
      }
    } catch (error) {
      console.error('[badges/tree/page] computeBadgeProgress 실패 — 진행 표시 생략', target.id, error)
    }
  }
  // 직전 동기화 비교 후보의 축도 같은 배치 조회에 합류시킨다 — 별도 왕복 없음.
  if (syncComparisonCandidate) axisKeys.add(syncComparisonCandidate.axisKey)
  const labelMap = await getMetricLabels(Array.from(axisKeys))
  const syncComparisonMessage = syncComparisonCandidate
    ? formatSyncComparisonText(syncComparisonCandidate, labelMap)
    : null

  // ── 라벨 채우기 + 기록형 아쉬움 줄 ───────────────────────────────────────
  const progressByBadgeId: Record<string, BadgeProgress> = {}
  const regretLineByBadgeId: Record<string, RegretLineData> = {}
  for (const target of progressTargets) {
    const progress = computedByBadgeId.get(target.id)
    if (!progress) continue
    progressByBadgeId[target.id] = withResolvedAxisLabels(progress, labelMap)
    // 아쉬움 줄은 기록형 프런티어에만 붙는다 — 대상이 좁아 여기서 개별 계산해도 부담이 없다.
    if (progress.kind === 'record') {
      const metrics = metricsByActivityType.get(target.activityType)!
      try {
        const regret = computeRecordRegretLine(target.condition, metrics, labelMap)
        if (regret) regretLineByBadgeId[target.id] = regret
      } catch (error) {
        console.error('[badges/tree/page] computeRecordRegretLine 실패 — 아쉬움 줄 생략', target.id, error)
      }
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
      initialActivity={activity}
    />
  )
}
