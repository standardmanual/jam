/**
 * Phase 16: 다이나믹 미션 달성 감지 (서버 사이드 전용)
 *
 * Strava 동기화 직후 활성 미션 순회 → 달성 시 완료 처리
 */
import { createServiceClient } from '@/lib/supabase/server'
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
  const pendingMissions = missions.filter((m) => !completedSet.has(m.id))

  const completedMissionIds: string[] = []

  for (const mission of pendingMissions) {
    // 선착순 체크
    if (mission.max_completions !== null) {
      const { count } = await supabase
        .from('user_mission_completions')
        .select('id', { count: 'exact', head: true })
        .eq('mission_id', mission.id)

      if ((count ?? 0) >= mission.max_completions) continue
    }

    const achieved = evaluateMission(mission.mission_type, mission.condition_json as MissionCondition, activities)
    if (!achieved) continue

    // 완료 INSERT
    const { error } = await supabase
      .from('user_mission_completions')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ user_id: userId, mission_id: mission.id } as any)

    if (error) {
      if (error.code === '23505') continue // 중복
      console.error('[checkMissions] 완료 INSERT 오류:', error)
      continue
    }

    completedMissionIds.push(mission.id)
    console.info(`[checkMissions] 미션 달성 — userId: ${userId}, mission: ${mission.title}`)
  }

  return { completedMissionIds }
}

function evaluateMission(
  missionType: string,
  condition: MissionCondition,
  activities: NormalizedActivity[]
): boolean {
  const filtered = condition.activity_type
    ? activities.filter((a) => a.jamActivityType === condition.activity_type)
    : activities

  switch (missionType) {
    case 'distance': {
      if (!condition.distance_km) return false
      const totalKm = filtered.reduce((sum, a) => sum + a.distanceKm, 0)
      return totalKm >= condition.distance_km
    }
    case 'activity_count': {
      if (!condition.count) return false
      return filtered.length >= condition.count
    }
    // poi_visit, item_collect은 별도 파이프라인에서 처리 (여기서는 false)
    default:
      return false
  }
}
