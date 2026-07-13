/**
 * Phase 16: 다이나믹 미션 달성 감지 (서버 사이드 전용)
 *
 * Strava 동기화 직후 활성 미션 순회 → 참가 중인 미션 progress 업데이트 → 달성 시 완료 처리
 */
import { createServiceClient } from '@/lib/supabase/server'
import { recordFeedEvent } from '@/lib/activity-feed'
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

  for (const mission of pendingMissions) {
    const progressValue = calculateProgress(mission.mission_type, mission.condition_json as MissionCondition, activities)

    // 참가 중인 미션이면 progress_value 업데이트
    if (participationSet.has(mission.id) && progressValue > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateQuery = (supabase as any)
        .from('user_mission_participations')
        .update({ progress_value: progressValue })
        .eq('user_id', userId)
        .eq('mission_id', mission.id)
      await updateQuery
    }

    const achieved = progressValue >= getTarget(mission.mission_type, mission.condition_json as MissionCondition)
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
    await recordFeedEvent(userId, 'mission_completed', {
      mission_id: mission.id,
      mission_title: mission.title,
      reward_type: mission.reward_type,
      reward_points: mission.reward_points,
    })
  }

  return { completedMissionIds }
}

function getTarget(missionType: string, condition: MissionCondition): number {
  switch (missionType) {
    case 'distance': return condition.distance_km ?? 0
    case 'activity_count': return condition.count ?? 0
    default: return 0
  }
}

function calculateProgress(
  missionType: string,
  condition: MissionCondition,
  activities: NormalizedActivity[]
): number {
  const filtered = condition.activity_type
    ? activities.filter((a) => a.jamActivityType === condition.activity_type)
    : activities

  switch (missionType) {
    case 'distance':
      return filtered.reduce((sum, a) => sum + a.distanceKm, 0)
    case 'activity_count':
      return filtered.length
    default:
      return 0
  }
}
