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
  // 소프트 삭제된 배지(badges.deleted_at)는 보상 카드 목록에서 제외한다(20260824_007) —
  // 해당 배지 카드만 빠지고 나머지 보상(포인트·다른 배지)은 그대로 보인다.
  const rewardBadgeIds = mission.reward_badge_ids ?? []
  const { data: rewardBadgesRaw } = rewardBadgeIds.length > 0
    ? await service.from('badges').select('id, name, image_url, rarity').in('id', rewardBadgeIds).is('deleted_at', null)
    : { data: [] }
  const rewardBadges = (rewardBadgesRaw ?? []) as { id: string; name: string; image_url: string | null; rarity: import('@/types/database').BadgeRarity }[]

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
