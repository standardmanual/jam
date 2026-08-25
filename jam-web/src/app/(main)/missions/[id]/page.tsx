import { notFound, redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { MissionRow, UserMissionParticipationRow, UserMissionCompletionRow } from '@/types/database'
import { loadMissionVisibilityContext } from '@/lib/missions/visibility-server'
import { resolveMissionVisibility } from '@/lib/missions/visibility'
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

  // 20260825_028: 목록에서 숨기더라도 URL 직접 진입은 막지 못하므로 상세에서도 같은 규칙으로
  // 잠금 여부를 판정한다(locked·hidden 모두 참가 불가 상태로 렌더).
  const visibilityContext = await loadMissionVisibilityContext(user.id, [mission], {
    participatedMissionIds: new Set(participation ? [mission.id] : []),
  })
  const visibilityResult = resolveMissionVisibility(mission, visibilityContext)
  const locked = visibilityResult.visibility === 'locked' || visibilityResult.visibility === 'hidden'

  return (
    <MissionDetailClient
      mission={mission}
      isParticipating={!!participation}
      isCompleted={!!completion}
      progressValue={participation?.progress_value ?? 0}
      rewardBadges={rewardBadges}
      locked={locked}
      requiredBadge={visibilityResult.requiredBadge}
    />
  )
}
