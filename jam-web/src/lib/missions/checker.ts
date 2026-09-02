/**
 * Phase 16: 다이나믹 미션 달성 감지 (서버 사이드 전용)
 *
 * Strava 동기화 직후 활성 미션 순회 → 참가 중인 미션 progress 업데이트 → 달성 시 완료 처리
 */
import { createServiceClient } from '@/lib/supabase/server'
import { recordFeedEvent } from '@/lib/activity-feed'
import { createNotification, groupedTargetsKey, scopedGroupKey } from '@/lib/notifications'
import type { CreateNotificationInput, NotificationType } from '@/lib/notifications'
import { grantMissionRewards } from '@/lib/missions/rewards'
import { getActivityHistory, mergeActivityHistory } from '@/lib/strava/activity-history'
import { evaluateConditionDetailed, calcMaxStreak, passesWalkingGate } from '@/lib/badge-engine'
import type { MissionRow, MissionCondition, MissionType, BadgeCondition } from '@/types/database'
import type { NormalizedActivity } from '@/types/strava'

/**
 * 티켓 20260813_001: 배지엔진 evaluateConditionDetailed를 재사용해 판정하는 미션 타입.
 * condition_json은 BadgeCondition과 동일한 필드 어휘(activity_type + streak_days/
 * duration_minutes/elevation_gain_m)를 그대로 사용한다.
 */
const ENGINE_DELEGATED_MISSION_TYPES: ReadonlySet<MissionType> = new Set([
  'streak_days',
  'duration_minutes',
  'elevation_gain_m',
])

/**
 * "상시 미션" 판정 — ends_at이 null이면 시작 시각만 지났으면 항상 활성 (종료 없음).
 * checkMissions의 활성 미션 조회 SQL(`activeMissionsQueryFilter` 참고)과 동일한 규칙을
 * 순수 함수로 노출 — 어드민/유저 화면의 활성 판정과도 같은 의미로 맞춘다 (티켓 20260813_001).
 *
 * DB 쿼리는 PostgREST `.or()` 문자열이라 이 함수 자체를 쿼리로 실행할 수는 없다(Supabase는
 * JS 함수를 SQL로 변환하지 못함). 대신 `activeMissionsQueryFilter()`가 동일한 `starts_at <= now`
 * / `ends_at IS NULL OR ends_at >= now` 경계값을 문자열로 생성해 checkMissions에서 그대로
 * 쓰도록 해, 두 판정이 같은 기준에서 파생되도록 묶는다(아래 checker-logic.test.ts의
 * "쿼리 필터 ↔ isMissionActive 일치" 케이스로 회귀 방지).
 */
export function isMissionActive(
  mission: Pick<MissionRow, 'starts_at' | 'ends_at'>,
  now: Date = new Date()
): boolean {
  if (new Date(mission.starts_at) > now) return false
  if (mission.ends_at === null) return true
  return new Date(mission.ends_at) >= now
}

/**
 * checkMissions가 활성 미션을 조회할 때 쓰는 PostgREST 필터를 isMissionActive와 같은 기준
 * (starts_at <= now, ends_at IS NULL OR ends_at >= now)으로 생성한다. 쿼리 문자열 자체를
 * isMissionActive 안에서 파생시킬 순 없으므로(순수 함수 vs SQL), 기준값(now)과 경계 조건을
 * 이 함수 하나로 모아 두 곳(쿼리·순수 판정)이 서로 다른 기준으로 갈라지지 않게 한다.
 */
export function activeMissionsQueryFilter(now: string): { startsAtLte: string; endsAtOrExpr: string } {
  return {
    startsAtLte: now,
    endsAtOrExpr: `ends_at.is.null,ends_at.gte.${now}`,
  }
}

export interface MissionCheckResult {
  completedMissionIds: string[]
  /**
   * 이번 호출에서 미션 보상으로 발급된 배지 id 목록 (발급 순서).
   * 20260823_007 — 동기화 응답에 획득 배지 상세를 실어보내기 위해 추가.
   */
  awardedBadgeIds: string[]
}

export async function checkMissions(
  userId: string,
  activities: NormalizedActivity[]
): Promise<MissionCheckResult> {
  const supabase = createServiceClient()
  const now = new Date().toISOString()

  // 1. 현재 활성 미션 조회 — ends_at이 NULL이면 "상시 미션"(종료일 없음)이라 항상 포함.
  //    isMissionActive와 동일한 기준을 activeMissionsQueryFilter에서 함께 생성해 사용한다.
  const activeFilter = activeMissionsQueryFilter(now)
  const { data: missionsRaw } = await supabase
    .from('missions')
    .select('*')
    .lte('starts_at', activeFilter.startsAtLte)
    .or(activeFilter.endsAtOrExpr)

  const missions = (missionsRaw ?? []) as MissionRow[]
  if (missions.length === 0) return { completedMissionIds: [], awardedBadgeIds: [] }

  // 2. 유저가 이미 완료한 미션
  const { data: completedRaw } = await supabase
    .from('user_mission_completions')
    .select('mission_id')
    .eq('user_id', userId)

  const completedSet = new Set((completedRaw ?? []).map((r: { mission_id: string }) => r.mission_id))

  // 3. 유저가 참가 중인 미션 (참가 시각도 함께 — distance/activity_count 진행도는
  //    "참가한 시점 이후" 활동만 집계해야 하므로)
  const { data: participationsRaw } = await supabase
    .from('user_mission_participations')
    .select('mission_id, joined_at')
    .eq('user_id', userId)

  const participations = (participationsRaw ?? []) as { mission_id: string; joined_at: string }[]
  const participationSet = new Set(participations.map((r) => r.mission_id))
  const joinedAtByMission = new Map(participations.map((r) => [r.mission_id, r.joined_at]))

  const pendingMissions = missions.filter((m) => !completedSet.has(m.id))
  const completedMissionIds: string[] = []
  const awardedBadgeIds: string[] = []
  /**
   * R11 — 마일스톤·완료 소식은 미션 2건 이상이면 한 행으로 접는다(20260827_014).
   * 루프 안에서 바로 보내면 미션 수만큼 행이 생기므로 **후보만 모아 두고 끝에서 한 번** 만든다.
   */
  const milestoneHits: { missionId: string; missionTitle: string; milestone: 50 | 80; current: number; target: number; unit: string }[] = []
  const completedHits: { missionId: string; missionTitle: string }[] = []

  // distance/activity_count는 "이번 배치"가 아니라 실제 이력 전체로 판정해야
  // 매번 조금씩 동기화되는 정상적인 사용 패턴에서도 누적 조건이 제대로 채워진다.
  const history = await getActivityHistory(supabase, userId)
  const fullHistory = mergeActivityHistory(history, activities)

  // 4. checkin / item_collect 판정에 필요한 유저 보유 현황을 미리 조회.
  //    (활동 배치만으로는 판단 불가 — DB 조회 필요. 참가 미션이 하나라도
  //     이 두 타입일 때만 조회해 불필요한 쿼리를 피한다.)
  const needsOwnership = pendingMissions.some(
    (m) => participationSet.has(m.id) && (m.mission_type === 'checkin' || m.mission_type === 'item_collect')
  )
  const ownership = needsOwnership ? await loadOwnership(userId) : { ownedBadgeIds: new Set<string>(), visitedPoiIds: new Set<string>() }

  for (const mission of pendingMissions) {
    // 참가 게이트 — 참가한 유저만 진행상황 추적·완료·보상 대상 (Phase13 버그 수정)
    const isParticipating = participationSet.has(mission.id)
    if (!isParticipating) continue

    // distance/activity_count/streak_days/duration_minutes/elevation_gain_m은 참가 시점 이후
    // 전체 이력으로 판정해야 한다(연속일수·단일활동 최고기록 모두 배치 하나로는 정확히 계산 불가).
    // 그 외(checkin/item_collect)는 보유 현황 기반이라 activities 자체는 안 쓰이므로
    // 배치를 그대로 넘겨도 무방.
    const joinedAt = joinedAtByMission.get(mission.id)
    const missionActivities = ENGINE_DELEGATED_MISSION_TYPES.has(mission.mission_type) || mission.mission_type === 'distance' || mission.mission_type === 'activity_count'
      ? (joinedAt ? fullHistory.filter((a) => a.startDate >= joinedAt) : fullHistory)
      : activities

    const { progressValue, target, achieved } = evaluateMission(mission, missionActivities, ownership, isParticipating)

    // progress_value 업데이트
    if (progressValue > 0) {
      const table = supabase.from('user_mission_participations')
      await table.update({ progress_value: progressValue }).eq('user_id', userId).eq('mission_id', mission.id)
    }

    if (!achieved) {
      const hit = missionMilestoneHit(mission, progressValue, target)
      if (hit) milestoneHits.push(hit)
      continue
    }

    // 선착순 체크
    if (mission.max_completions !== null) {
      const { count } = await supabase
        .from('user_mission_completions')
        .select('id', { count: 'exact', head: true })
        .eq('mission_id', mission.id)

      if ((count ?? 0) >= mission.max_completions) continue
    }

    // 완료 INSERT
    const { error } = await supabase
      .from('user_mission_completions')
      .insert({ user_id: userId, mission_id: mission.id })

    if (error) {
      if (error.code === '23505') continue
      console.error('[checkMissions] 완료 INSERT 오류:', error)
      continue
    }

    completedMissionIds.push(mission.id)
    console.info(`[checkMissions] 미션 달성 — userId: ${userId}, mission: ${mission.title}`)

    // 보상 지급 (Phase13) — 설정된 배지 전부(타입별 분기·중복 스킵) + 배지 포인트 + 미션 포인트
    const reward = await grantMissionRewards(userId, mission)
    awardedBadgeIds.push(...reward.awardedBadgeIds)

    await recordFeedEvent(userId, 'mission_completed', {
      mission_id: mission.id,
      mission_title: mission.title,
      reward_points: reward.totalAwardedPoints > 0 ? reward.totalAwardedPoints : null,
      awarded_badge_ids: reward.awardedBadgeIds,
      awarded_badge_names: reward.awardedBadgeNames,
      final_progress_value: progressValue,
      target_value: getTarget(mission.mission_type, mission.condition_json as MissionCondition),
    })

    completedHits.push({ missionId: mission.id, missionTitle: mission.title })
  }

  // ④ 소식 — 미션 2건 이상이면 한 행으로 접는다(R11)
  for (const draft of buildMilestoneDrafts(userId, milestoneHits)) {
    await createNotification(draft as CreateNotificationInput<NotificationType>)
  }
  for (const draft of buildMissionCompletedDrafts(userId, completedHits)) {
    await createNotification(draft as CreateNotificationInput<NotificationType>)
  }

  return { completedMissionIds, awardedBadgeIds }
}

/**
 * 미션 타입별 진행도 단위 — 소식 #20의 문구 슬롯("52/100km")에 쓴다.
 * 달성형(checkin/item_collect)은 진행률 개념이 없어 빈 문자열.
 *
 * 025 배치의 #21(마감 임박)도 같은 표를 쓴다 — "12km 남았어요"의 단위가 #20과 갈라지면
 * 같은 미션이 소식마다 다른 단위로 보인다.
 */
export const MISSION_PROGRESS_UNIT: Record<MissionType, string> = {
  distance: 'km',
  activity_count: '회',
  checkin: '',
  item_collect: '',
  streak_days: '일',
  duration_minutes: '분',
  elevation_gain_m: 'm',
}

/**
 * 소식 #20(미션 진행도 마일스톤) — 티켓 20260824_019
 *
 * 50%·80% 돌파 시 **구간당 1회만.** 중복 발송은 `group_key`
 * `mission_milestone:{mission_id}:{50|80}` + `mode:'once'`로 막는다.
 * (동기화할 때마다 이 지점을 지나므로 merge로 두면 매번 dot이 다시 켜진다)
 *
 * 달성형(checkin/item_collect)은 목표가 0/1이라 "절반을 넘었어요"가 성립하지 않으므로
 * 제외한다. 한 번에 두 구간을 넘긴 경우(0 → 85%)에는 **높은 쪽 한 건만** 만든다.
 */
interface MilestoneHit {
  missionId: string
  missionTitle: string
  milestone: 50 | 80
  current: number
  target: number
  unit: string
}

function missionMilestoneHit(
  mission: MissionRow,
  progressValue: number,
  target: number
): MilestoneHit | null {
  const unit = MISSION_PROGRESS_UNIT[mission.mission_type] ?? ''
  if (unit === '' || target <= 0 || progressValue <= 0) return null

  const ratio = progressValue / target
  const milestone: 50 | 80 | null = ratio >= 0.8 ? 80 : ratio >= 0.5 ? 50 : null
  if (milestone === null) return null

  return {
    missionId: mission.id,
    missionTitle: mission.title,
    milestone,
    current: progressValue,
    target,
    unit,
  }
}

/**
 * #20 초안 — 미션 2건 이상이면 「미션 N개가 목표에 가까워졌어요」 한 행(R11).
 *
 * 잔여량은 넣지 않는다 — 티켓 20260825_005가 "UX Writing 가이드상 불필요한 정보"로
 * 판정해 제거한 결정을 존중한다(20260827_014 「주요 의사결정」).
 */
function buildMilestoneDrafts(userId: string, hits: MilestoneHit[]) {
  if (hits.length === 0) return []
  if (hits.length === 1) {
    const h = hits[0]
    return [
      {
        userId,
        type: 'mission_milestone' as const,
        groupKey: scopedGroupKey('mission_milestone', h.missionId, h.milestone),
        mode: 'once' as const,
        payload: {
          mission_id: h.missionId,
          mission_title: h.missionTitle,
          current: h.current,
          target: h.target,
          unit: h.unit,
          milestone: h.milestone,
        },
      },
    ]
  }
  return [
    {
      userId,
      type: 'mission_milestone' as const,
      // 50%·80% 구간이 섞일 수 있어 구간을 말하지 않는다 → 키에도 구간을 넣어 집합을 구분한다
      groupKey: groupedTargetsKey(
        'mission_milestone',
        hits.map((h) => `${h.missionId}:${h.milestone}`)
      ),
      mode: 'once' as const,
      payload: { target_count: hits.length },
    },
  ]
}

/**
 * #22 초안 — R4에 따라 **보상을 문구에 넣지 않는다.** 미션이 끝났다는 사실이 보상보다
 * 중요하고, 보상은 착지한 미션 상세에서 확인한다.
 * 미션 2건 이상이면 「{대표} 외 미션 N개를 완료했어요」 한 행(B4).
 */
function buildMissionCompletedDrafts(userId: string, hits: { missionId: string; missionTitle: string }[]) {
  if (hits.length === 0) return []
  if (hits.length === 1) {
    return [
      {
        userId,
        type: 'mission_completed' as const,
        // L1(압축 금지) — 개별 소식이라 group_key를 두지 않는다
        payload: { mission_id: hits[0].missionId, mission_title: hits[0].missionTitle },
      },
    ]
  }
  return [
    {
      userId,
      type: 'mission_completed' as const,
      groupKey: groupedTargetsKey('mission_completed', hits.map((h) => h.missionId)),
      mode: 'once' as const,
      payload: {
        mission_id: hits[0].missionId,
        mission_title: hits[0].missionTitle,
        target_count: hits.length,
      },
    },
  ]
}

export interface OwnershipContext {
  /** 유저가 보유한 배지 id (활동배지 + 인벤토리 아이템배지) */
  ownedBadgeIds: Set<string>
  /** 유저가 체크인(지점 매칭 배지 발급)한 지점 id */
  visitedPoiIds: Set<string>
}

export interface MissionEvaluation {
  isParticipating: boolean
  progressValue: number
  target: number
  /** 달성 여부 — 참가하지 않았으면 항상 false (참가 게이트) */
  achieved: boolean
}

/**
 * 순수 함수 — 미션 진행/달성 판정. DB 접근 없음(테스트 가능).
 * 참가하지 않은 유저는 progress·achieved 모두 0/false (Phase13 참가 게이트).
 */
export function evaluateMission(
  mission: Pick<MissionRow, 'mission_type' | 'condition_json'>,
  activities: NormalizedActivity[],
  ownership: OwnershipContext,
  isParticipating: boolean
): MissionEvaluation {
  if (!isParticipating) {
    return { isParticipating: false, progressValue: 0, target: 0, achieved: false }
  }
  const condition = mission.condition_json as MissionCondition
  const progressValue = calculateProgress(mission.mission_type, condition, activities, ownership)
  const target = getTarget(mission.mission_type, condition)
  // streak_days/duration_minutes/elevation_gain_m — 배지엔진 evaluateConditionDetailed를 그대로
  // 재사용해 판정한다 (걷기 축1 게이트 등 배지 조건 평가와 100% 동일한 판정 보장).
  // 주의: evaluateConditionDetailed 자체는 "참가 시점 이후"를 모른다 — 넘겨받은 activities
  // 배열만으로 판정하는 순수 함수라 참가 이전 활동이 섞여 들어오면 그대로 반영된다. "참가 시점
  // 이후만" 보장하는 건 이 함수의 호출자(checkMissions)가 joinedAt으로 activities를 미리
  // 필터링해서 넘기기 때문 — 실제로 ENGINE_DELEGATED_MISSION_TYPES는 checkMissions에서
  // fullHistory.filter((a) => a.startDate >= joinedAt)를 거친 배열만 받는다(distance/
  // activity_count와 동일 취급). evaluateMission을 다른 곳에서 재사용할 땐 activities를
  // 반드시 참가 시점 이후로 걸러서 넘겨야 한다.
  const achieved = ENGINE_DELEGATED_MISSION_TYPES.has(mission.mission_type)
    ? evaluateConditionDetailed(condition as BadgeCondition, activities).pass
    : progressValue >= target
  return { isParticipating: true, progressValue, target, achieved }
}

/**
 * checkin / item_collect 달성 판정에 필요한 유저 보유 현황 조회.
 * - 체크인한 지점: user_activity_badges.triggered_by_poi_id (지점 매칭 시스템 재사용)
 * - 보유 배지: user_activity_badges.badge_id ∪ inventory_items.badge_id
 */
async function loadOwnership(userId: string): Promise<OwnershipContext> {
  const supabase = createServiceClient()

  const [{ data: activityBadgesRaw }, { data: invRaw }] = await Promise.all([
    supabase
      .from('user_activity_badges')
      .select('badge_id, triggered_by_poi_id')
      .eq('user_id', userId),
    supabase
      .from('inventory')
      .select('inventory_items(badge_id)')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  const ownedBadgeIds = new Set<string>()
  const visitedPoiIds = new Set<string>()

  const activityBadges = (activityBadgesRaw ?? []) as { badge_id: string; triggered_by_poi_id: string | null }[]
  for (const b of activityBadges) {
    if (b.badge_id) ownedBadgeIds.add(b.badge_id)
    if (b.triggered_by_poi_id) visitedPoiIds.add(b.triggered_by_poi_id)
  }

  const invItems = ((invRaw as { inventory_items?: { badge_id: string }[] } | null)?.inventory_items ?? [])
  for (const it of invItems) {
    if (it.badge_id) ownedBadgeIds.add(it.badge_id)
  }

  return { ownedBadgeIds, visitedPoiIds }
}

/**
 * 미션 타입별 목표치. 025 배치의 #21(마감 임박)이 "남은 목표치"를 계산할 때 재사용한다 —
 * 배치가 자체 계산을 두면 진행바(#20)와 소식(#21)의 목표치가 갈라진다.
 */
export function getTarget(missionType: string, condition: MissionCondition): number {
  switch (missionType) {
    case 'distance': return condition.distance_km ?? 0
    case 'activity_count': return condition.count ?? 0
    // checkin / item_collect 은 달성형(0/1) — 목표치 항상 1
    case 'checkin': return 1
    case 'item_collect': return 1
    // 티켓 20260813_001 — 배지엔진 BadgeCondition과 동일 필드 어휘 재사용
    case 'streak_days': return condition.streak_days ?? 0
    case 'duration_minutes': return condition.duration_minutes ?? 0
    case 'elevation_gain_m': return condition.elevation_gain_m ?? 0
    default: return 0
  }
}

function calculateProgress(
  missionType: string,
  condition: MissionCondition,
  activities: NormalizedActivity[],
  ownership: OwnershipContext
): number {
  const filtered = condition.activity_type
    ? activities.filter((a) => a.jamActivityType === condition.activity_type)
    : activities

  switch (missionType) {
    case 'distance': {
      const sum = filtered.reduce((acc, a) => acc + a.distanceKm, 0)
      return Math.round(sum * 100) / 100
    }
    case 'activity_count':
      return filtered.length
    case 'checkin':
      // 대상 지점에 체크인(매칭 배지 발급)했으면 1, 아니면 0
      return condition.poi_id && ownership.visitedPoiIds.has(condition.poi_id) ? 1 : 0
    case 'item_collect':
      // 대상 배지를 보유하면 1, 아니면 0
      return condition.badge_id && ownership.ownedBadgeIds.has(condition.badge_id) ? 1 : 0
    // 티켓 20260813_001 — 진행바 표시용 수치. 걷기는 배지엔진과 동일하게 축1 게이트(진짜 걷기
    // 판정)를 통과한 활동만 집계한다 (evaluateConditionDetailed 내부 필터링과 동일 로직 재사용).
    case 'streak_days': {
      const gated = condition.activity_type === 'walking' ? filtered.filter(passesWalkingGate) : filtered
      return calcMaxStreak(gated)
    }
    case 'duration_minutes': {
      const gated = condition.activity_type === 'walking' ? filtered.filter(passesWalkingGate) : filtered
      return gated.length > 0 ? Math.max(...gated.map((a) => a.movingTimeSec / 60)) : 0
    }
    // 티켓 20260831_2152 — 배지엔진 evaluateConditionDetailed의 elevation_gain_m 판정
    // (참가 시점 이후 누적 합계, 티켓 20260831_2100 복원분)과 표시값을 일치시킨다.
    // duration_minutes(위)는 여전히 배지엔진 PER_ACTIVITY_KEYS에 남아 단일 활동 최고값으로
    // 판정되므로 Math.max를 유지 — elevation_gain_m만 reduce 합산으로 바꾼다.
    case 'elevation_gain_m': {
      const gated = condition.activity_type === 'walking' ? filtered.filter(passesWalkingGate) : filtered
      const sum = gated.reduce((acc, a) => acc + a.elevationGainM, 0)
      return Math.round(sum * 100) / 100
    }
    default:
      return 0
  }
}
