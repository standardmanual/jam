/**
 * Phase 16: 다이나믹 미션 달성 감지 (서버 사이드 전용)
 *
 * Strava 동기화 직후 활성 미션 순회 → 참가 중인 미션 progress 업데이트 → 달성 시 완료 처리
 */
import { createServiceClient } from '@/lib/supabase/server'
import { recordFeedEvent } from '@/lib/activity-feed'
import { grantMissionRewards } from '@/lib/missions/rewards'
import type { MissionRow, MissionCondition } from '@/types/database'
import type { NormalizedActivity } from '@/types/strava'

export interface MissionCheckResult {
  completedMissionIds: string[]
}

export async function checkMissions(
  userId: string,
  activities: NormalizedActivity[]
): Promise<MissionCheckResult> {
  const supabase = createServiceClient()
  const now = new Date().toISOString()

  // 1. 현재 활성 미션 조회
  const { data: missionsRaw } = await supabase
    .from('missions')
    .select('*')
    .lte('starts_at', now)
    .gte('ends_at', now)

  const missions = (missionsRaw ?? []) as MissionRow[]
  if (missions.length === 0) return { completedMissionIds: [] }

  // 2. 유저가 이미 완료한 미션
  const { data: completedRaw } = await supabase
    .from('user_mission_completions')
    .select('mission_id')
    .eq('user_id', userId)

  const completedSet = new Set((completedRaw ?? []).map((r: { mission_id: string }) => r.mission_id))

  // 3. 유저가 참가 중인 미션
  const { data: participationsRaw } = await supabase
    .from('user_mission_participations')
    .select('mission_id')
    .eq('user_id', userId)

  const participationSet = new Set((participationsRaw ?? []).map((r: { mission_id: string }) => r.mission_id))

  const pendingMissions = missions.filter((m) => !completedSet.has(m.id))
  const completedMissionIds: string[] = []

  // 4. poi_visit / item_collect 판정에 필요한 유저 보유 현황을 미리 조회.
  //    (활동 배치만으로는 판단 불가 — DB 조회 필요. 참가 미션이 하나라도
  //     이 두 타입일 때만 조회해 불필요한 쿼리를 피한다.)
  const needsOwnership = pendingMissions.some(
    (m) => participationSet.has(m.id) && (m.mission_type === 'poi_visit' || m.mission_type === 'item_collect')
  )
  const ownership = needsOwnership ? await loadOwnership(userId) : { ownedBadgeIds: new Set<string>(), visitedPoiIds: new Set<string>() }

  for (const mission of pendingMissions) {
    // 참가 게이트 — 참가한 유저만 진행상황 추적·완료·보상 대상 (Phase13 버그 수정)
    const isParticipating = participationSet.has(mission.id)
    if (!isParticipating) continue

    const { progressValue, achieved } = evaluateMission(mission, activities, ownership, isParticipating)

    // progress_value 업데이트
    if (progressValue > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateQuery = (supabase as any)
        .from('user_mission_participations')
        .update({ progress_value: progressValue })
        .eq('user_id', userId)
        .eq('mission_id', mission.id)
      await updateQuery
    }

    if (!achieved) continue

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ user_id: userId, mission_id: mission.id } as any)

    if (error) {
      if (error.code === '23505') continue
      console.error('[checkMissions] 완료 INSERT 오류:', error)
      continue
    }

    completedMissionIds.push(mission.id)
    console.info(`[checkMissions] 미션 달성 — userId: ${userId}, mission: ${mission.title}`)

    // 보상 지급 (Phase13) — 설정된 배지 전부(타입별 분기·중복 스킵) + 배지 포인트 + 미션 포인트
    const reward = await grantMissionRewards(userId, mission)

    await recordFeedEvent(userId, 'mission_completed', {
      mission_id: mission.id,
      mission_title: mission.title,
      reward_points: reward.totalAwardedPoints > 0 ? reward.totalAwardedPoints : null,
      awarded_badge_ids: reward.awardedBadgeIds,
      awarded_badge_names: reward.awardedBadgeNames,
      final_progress_value: progressValue,
      target_value: getTarget(mission.mission_type, mission.condition_json as MissionCondition),
    })
  }

  return { completedMissionIds }
}

export interface OwnershipContext {
  /** 유저가 보유한 배지 id (활동배지 + 인벤토리 아이템배지) */
  ownedBadgeIds: Set<string>
  /** 유저가 방문(POI 매칭 배지 발급)한 POI id */
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
  return { isParticipating: true, progressValue, target, achieved: progressValue >= target }
}

/**
 * poi_visit / item_collect 달성 판정에 필요한 유저 보유 현황 조회.
 * - 방문한 POI: user_activity_badges.triggered_by_poi_id (POI 배지 매칭 시스템 재사용)
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

function getTarget(missionType: string, condition: MissionCondition): number {
  switch (missionType) {
    case 'distance': return condition.distance_km ?? 0
    case 'activity_count': return condition.count ?? 0
    // poi_visit / item_collect 은 달성형(0/1) — 목표치 항상 1
    case 'poi_visit': return 1
    case 'item_collect': return 1
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
    case 'distance':
      return filtered.reduce((sum, a) => sum + a.distanceKm, 0)
    case 'activity_count':
      return filtered.length
    case 'poi_visit':
      // 대상 POI를 방문(매칭 배지 발급)했으면 1, 아니면 0
      return condition.poi_id && ownership.visitedPoiIds.has(condition.poi_id) ? 1 : 0
    case 'item_collect':
      // 대상 배지를 보유하면 1, 아니면 0
      return condition.badge_id && ownership.ownedBadgeIds.has(condition.badge_id) ? 1 : 0
    default:
      return 0
  }
}
