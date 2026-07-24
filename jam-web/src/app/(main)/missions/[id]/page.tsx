import { notFound, redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { MissionRow, UserMissionParticipationRow, UserMissionCompletionRow } from '@/types/database'
import MissionDetailClient from './MissionDetailClient'

type Props = { params: Promise<{ id: string }> }

export default async function MissionDetailPage({ params }: Props) {
  const { id: missionId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const [{ data: missionRaw }, { data: participationRaw }, { data: completionRaw }] = await Promise.all([
    service.from('missions').select('*').eq('id', missionId).single(),
    service.from('user_mission_participations').select('*').eq('user_id', user.id).eq('mission_id', missionId).maybeSingle(),
    service.from('user_mission_completions').select('id').eq('user_id', user.id).eq('mission_id', missionId).maybeSingle(),
  ])

  if (!missionRaw) notFound()

  const mission = missionRaw as MissionRow
  const participation = participationRaw as UserMissionParticipationRow | null
  const completion = completionRaw as Pick<UserMissionCompletionRow, 'id'> | null

  // 보상 배지 정보 조회 (표시용)
  const rewardBadgeIds = mission.reward_badge_ids ?? []
  const { data: rewardBadgesRaw } = rewardBadgeIds.length > 0
    ? await service.from('badges').select('id, name, image_url').in('id', rewardBadgeIds)
    : { data: [] }
  const rewardBadges = (rewardBadgesRaw ?? []) as { id: string; name: string; image_url: string | null }[]

  return (
    <MissionDetailClient
      mission={mission}
      isParticipating={!!participation}
      isCompleted={!!completion}
      progressValue={participation?.progress_value ?? 0}
      rewardBadges={rewardBadges}
    />
  )
}
