import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  buildBadgeActivityTrees,
  frontierStageOf,
  type BadgeTreeSourceBadge,
  type BadgeTreeSourceMission,
  type BadgeTreeGateGroup,
  type BadgeTreeLock,
} from '@/lib/badgeTree'
import { hasUnfulfilledGate } from '@/lib/badgeTreeConditionStatus'
import { collectConditionCheckTargets, computeConditionMetBadgeIds } from '@/lib/badgeTreeConditionCheck.server'
import { getActivityHistory, getSignupAnchorDate } from '@/lib/strava/activity-history'
import {
  computeUserPeriodMetrics,
  computeBadgeProgress,
  computeRecordRegretLine,
  type BadgeProgress,
  type BadgeProgressOptions,
  type RegretLineData,
} from '@/lib/badge-engine/badgeProgress'
// 배지 «종류» 판정의 단일 출처 — 진행 대상 선정이 발급 엔진과 같은 기준을 본다
// (티켓 20260905_0031).
import { badgeKindOf } from '@/lib/badge-engine/badgeKind'
import { getMetricLabels } from '@/lib/badge-engine/metricLabels'
import type { ActivityType, BadgeCondition } from '@/types/database'
import BadgeTreeClient from './BadgeTreeClient'

/**
 * PostgREST 기본 페이지 상한. 이 크기로 끝까지 훑는다 — `badges/page.tsx`(46~52행)에
 * **1000행 절단 사고 기록**이 있고, 여기는 싱크 스냅샷이 아니라 «유저가 보는 화면 본체»라
 * 잘리면 배지 자체가 사라진다. v5 활동 배지는 630종이라 지금은 1페이지지만 여유가 절반뿐이다.
 */
const BADGE_PAGE_SIZE = 1000

const BADGE_TREE_SELECT =
  'id, name, rarity, level, family_key, description, image_url, activity_types, condition_json, sort_order'

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
 *
 * ⚠️ 타입을 `string`으로 좁히지 말 것. 같은 키가 두 번 오면(`?activity=a&activity=b`) Next는
 * **배열**을 넘긴다 — `string`으로 선언하면 그 사실이 가려져 타입체크가 못 잡고 소비 측에서
 * 문자열 메서드를 부르다 500이 난다(티켓 20260906_1158 2차 게이트 실측). 배열 처리는
 * `BadgeTreeClient`의 `normalizeActivity`가 담당한다.
 */
interface Props {
  searchParams: Promise<{ activity?: string | string[] }>
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

  // 동기화 상태 안내(RecentSyncBanner)를 이 화면에서 걷어내면서(티켓 20260906_1323 §4)
  // 그 배너 하나만 쓰던 `strava_activities` 최근 1건·`user_family_progress` 조회도 함께
  // 지웠다 — 렌더만 지우면 「아무도 안 보는 쿼리 2개」가 매 요청 남는다.
  const [
    badgesRaw,
    { data: missionsRaw, error: missionsError },
    { data: earnedBadgesRaw, error: earnedBadgesError },
  ] = await Promise.all([
    fetchAllActivityBadges(supabase),
    service.from('missions').select('id, title, gated_badge_id, image_url').not('gated_badge_id', 'is', null),
    // badges/page.tsx(27~38행)와 동일한 패턴 — 미획득 배지를 흑백으로 구분하기 위해
    // 이 유저의 실제 획득 여부를 조회한다(티켓 20260831_2250).
    supabase
      .from('user_activity_badges')
      .select('badge_id, badge:badges(deleted_at)')
      .eq('user_id', user.id),
  ])
  if (missionsError) console.error('[badges/tree/page] missions(게이트 배지용) 조회 실패', missionsError)
  if (earnedBadgesError) console.error('[badges/tree/page] user_activity_badges(획득여부) 조회 실패', earnedBadgesError)

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

  // earnedBadgeIdSet도 선행 배지 잠금칩의 "이미 획득함" 판정에 쓰인다.
  const trees = buildBadgeActivityTrees(badges, missions, earnedBadgeIdSet)

  // 게이트(미션·선행배지·교차)가 안 열린 미획득 눈금만 추려, 기존 evaluateConditionDetailed
  // pass/fail(checkCondition)로 "조건 충족(라임)"과 "게이트잠김"을 가른다.
  const allStages = trees.flatMap((tree) => tree.families.flatMap((family) => family.stages))
  const targetIds = collectConditionCheckTargets(allStages, earnedBadgeIdSet)
  const conditionById = new Map(badges.map((b) => [b.id, b.condition_json]))

  // ── 진행 수치 ────────────────────────────────────────────────────────────
  // 대상: **「다음 목표」 섹션에 실제로 그려지는 계열의 진행 앵커 하나씩**이다.
  // 다 받은 계열은 진행 표시가 없으므로 계산도 하지 않는다 — 화면이 그리지 않는 것을 서버도
  // 계산하지 않는 것이 이 리뉴얼의 성능 축이다(티켓 20260905_0037).
  type ProgressCandidate = {
    id: string
    condition: BadgeCondition
    locks: BadgeTreeLock[]
    gateGroups: BadgeTreeGateGroup[]
    /** `computeBadgeProgress`가 조건만으로는 알 수 없는 배지 속성(무한레벨형 여부·레벨) */
    options: BadgeProgressOptions
  }
  /**
   * 계열 하나의 **진행 앵커 후보열** — 획득 기준 프런티어부터 계열 마지막 눈금까지
   * (티켓 20260906_1323 §8).
   *
   * 앵커를 「첫 미획득」이 아니라 **「첫 미충족」**으로 정하기 위해 필요하다. 조건은 이미
   * 채웠지만 아직 발급되지 않은 눈금(다음 동기화에서 발급될 눈금)에 진행 수치를 붙이면
   * 「22/1일」처럼 이미 넘긴 조건에 카운트가 뜬다 — 아직 못 채운 눈금으로 한 칸씩 전진한다.
   */
  type FamilyProgressTarget = {
    familyKey: string
    activityType: ActivityType
    candidates: ProgressCandidate[]
  }
  // 배지 종류 판정은 `badgeKind.ts` 한 곳이다 — 여기서 다시 선언하면 발급 엔진과 갈라진다.
  const badgeById = new Map(badgesRaw.map((b) => [b.id, b]))
  const progressOptionsFor = (id: string): BadgeProgressOptions => {
    const row = badgeById.get(id)
    if (!row) return {}
    return { badgeKind: badgeKindOf(row), level: row.level ?? null }
  }
  const familyProgressTargets: FamilyProgressTarget[] = []
  for (const tree of trees) {
    for (const family of tree.families) {
      // 반복형은 다 받은 뒤에도 다음 회차가 진행 중이라 프런티어가 남는다
      // (`frontierStageOf` 주석 — 티켓 20260905_0031).
      const frontier = frontierStageOf(family, earnedBadgeIdSet)
      if (!frontier) continue
      const frontierIndex = family.stages.findIndex((s) => s.id === frontier.id)
      const candidates: ProgressCandidate[] = []
      for (const stage of family.stages.slice(frontierIndex < 0 ? 0 : frontierIndex)) {
        const condition = conditionById.get(stage.id)
        // 조건이 없는 눈금에서 후보열을 끊는다 — 그 눈금의 충족 여부를 알 수 없으므로
        // 그 너머로 전진할 근거도 없다.
        if (!condition) break
        candidates.push({
          id: stage.id,
          condition,
          locks: stage.locks,
          gateGroups: stage.gateGroups,
          options: progressOptionsFor(stage.id),
        })
      }
      if (candidates.length === 0) continue
      familyProgressTargets.push({ familyKey: family.key, activityType: tree.activityType, candidates })
    }
  }

  // getActivityHistory도 badge-engine/missions checker와 동일하게 service client로 호출한다.
  // 이력의 시작점은 가입 시점으로 고정한다 — 화면(진행률)과 발급 엔진이 같은 창을 봐야
  // 한다(티켓 20260905_0030 §5).
  const needsHistory = targetIds.length > 0 || familyProgressTargets.length > 0
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

  // ── 1패스: 진행 앵커 결정 + 계산 + 축 key 수집 (라벨은 아직 없다) ────────
  //
  // 앵커는 **「첫 미충족」**이다(티켓 20260906_1323 §8). 획득 기준 프런티어에서 시작해
  //   ① 진행 계산이 가능하고 `progress >= 1`(조건을 이미 채움) **그리고**
  //   ② 막고 있는 문이 없다(`hasUnfulfilledGate === false`)
  // 두 조건을 모두 만족하는 동안만 다음 눈금으로 전진한다. 문이 남아 있으면 그 눈금이
  // **진짜 다음 할 일**이므로 거기서 멈춘다(기존 `ready`(조건 충족) 표시가 그대로 유지된다).
  // 전진은 계열 눈금 수(최대 4) 이내이고 조건을 이미 채운 눈금에서만 일어난다 — 실제 추가
  // 계산은 계열당 평균 1회 남짓이라 1패스 구조(티켓 20260905_0037)를 깨지 않는다.
  //
  // 배지별 try/catch — 예상 못한 condition_json 형태가 와도 그 배지 하나만 진행 표시를 생략한다.
  const emptyLabelMap = new Map<string, { label: string; unit: string | null }>()
  const axisKeys = new Set<string>()
  /** 앵커로 확정된 눈금만 담는다 — 전진 도중 지나친 눈금의 계산 결과는 화면에 쓰지 않는다. */
  const anchors: { id: string; condition: BadgeCondition; activityType: ActivityType; progress: BadgeProgress }[] = []
  const frontierBadgeIdByFamilyKey: Record<string, string> = {}
  for (const target of familyProgressTargets) {
    const metrics = metricsByActivityType.get(target.activityType)!
    let anchor: { candidate: ProgressCandidate; progress: BadgeProgress } | null = null
    for (const candidate of target.candidates) {
      let progress: BadgeProgress
      try {
        progress = computeBadgeProgress(candidate.condition, metrics, emptyLabelMap, candidate.locks, candidate.options)
      } catch (error) {
        console.error('[badges/tree/page] computeBadgeProgress 실패 — 진행 표시 생략', candidate.id, error)
        break
      }
      anchor = { candidate, progress }
      if (progress.kind === 'unsupported' || progress.progress < 1) break
      if (hasUnfulfilledGate(candidate.gateGroups)) break
    }
    if (!anchor) continue
    frontierBadgeIdByFamilyKey[target.familyKey] = anchor.candidate.id
    anchors.push({
      id: anchor.candidate.id,
      condition: anchor.candidate.condition,
      activityType: target.activityType,
      progress: anchor.progress,
    })
    if (anchor.progress.kind !== 'unsupported') {
      for (const axis of anchor.progress.axes) axisKeys.add(axis.key)
    }
  }
  const labelMap = await getMetricLabels(Array.from(axisKeys))

  // ── 라벨 채우기 + 기록형 아쉬움 줄 ───────────────────────────────────────
  const progressByBadgeId: Record<string, BadgeProgress> = {}
  const regretLineByBadgeId: Record<string, RegretLineData> = {}
  for (const target of anchors) {
    progressByBadgeId[target.id] = withResolvedAxisLabels(target.progress, labelMap)
    // 아쉬움 줄은 기록형 앵커에만 붙는다 — 대상이 좁아 여기서 개별 계산해도 부담이 없다.
    if (target.progress.kind === 'record') {
      const metrics = metricsByActivityType.get(target.activityType)!
      try {
        const regret = computeRecordRegretLine(target.condition, metrics, labelMap)
        if (regret) regretLineByBadgeId[target.id] = regret
      } catch (error) {
        console.error('[badges/tree/page] computeRecordRegretLine 실패 — 아쉬움 줄 생략', target.id, error)
      }
    }
  }

  return (
    <BadgeTreeClient
      trees={trees}
      earnedBadgeIds={earnedBadgeIds}
      conditionMetBadgeIds={conditionMetBadgeIds}
      progressByBadgeId={progressByBadgeId}
      regretLineByBadgeId={regretLineByBadgeId}
      frontierBadgeIdByFamilyKey={frontierBadgeIdByFamilyKey}
      initialActivity={activity}
    />
  )
}
