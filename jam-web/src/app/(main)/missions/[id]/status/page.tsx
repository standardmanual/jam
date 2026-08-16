import { notFound, redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { MissionRow, MissionCondition } from '@/types/database'
import MissionStatusClient from './MissionStatusClient'

type Props = { params: Promise<{ id: string }> }

/** mission_type + condition_json 에서 목표 레이블 추출 */
function extractGoalLabel(
  missionType: MissionRow['mission_type'],
  conditionJson: MissionCondition,
): string {
  switch (missionType) {
    case 'distance':
      return conditionJson.distance_km != null ? `${conditionJson.distance_km}km` : ''
    case 'activity_count':
      return conditionJson.count != null ? `${conditionJson.count}회` : ''
    case 'streak_days':
      return conditionJson.streak_days != null ? `${conditionJson.streak_days}일 연속` : ''
    case 'duration_minutes':
      return conditionJson.duration_minutes != null ? `${conditionJson.duration_minutes}분` : ''
    case 'elevation_gain_m':
      return conditionJson.elevation_gain_m != null ? `${conditionJson.elevation_gain_m}m` : ''
    case 'poi_visit':
      return conditionJson.poi_id ? 'POI 체크인' : ''
    case 'item_collect':
      return conditionJson.badge_id ? '아이템 픽업' : ''
    default:
      return ''
  }
}

export default async function MissionStatusPage({ params }: Props) {
  const { id: missionId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const [{ data: missionRaw }, { data: participation }] = await Promise.all([
    service
      .from('missions')
      .select('id, title, status_display_type, mission_type, condition_json')
      .eq('id', missionId)
      .maybeSingle(),
    service
      .from('user_mission_participations')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('mission_id', missionId)
      .maybeSingle(),
  ])

  if (!missionRaw) notFound()
  // 미참가자는 미션 상황 진입 불가 → 상세로 돌려보냄
  if (!participation) redirect(`/missions/${missionId}`)

  const mission = missionRaw as Pick<
    MissionRow,
    'id' | 'title' | 'status_display_type' | 'mission_type' | 'condition_json'
  >

  const goalLabel = extractGoalLabel(mission.mission_type, mission.condition_json ?? {})

  return (
    <MissionStatusClient
      missionId={mission.id}
      missionTitle={mission.title}
      displayType={mission.status_display_type}
      goalLabel={goalLabel}
    />
  )
}
