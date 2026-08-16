import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { MissionRow, UserMissionCompletionRow, UserMissionParticipationRow } from '@/types/database'
import MissionsListClient, { type MissionListItem } from './MissionsListClient'

export default async function MissionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const now = new Date().toISOString()

  // ends_at이 NULL이면 상시 미션(종료일 없음) — 항상 진행중 탭에 포함
  const [{ data: ongoingRaw }, { data: completionsRaw }, { data: participationsRaw }] = await Promise.all([
    service.from('missions').select('*').or(`ends_at.is.null,ends_at.gte.${now}`).order('ends_at', { ascending: true }),
    service.from('user_mission_completions').select('mission_id, completed_at').eq('user_id', user.id),
    service.from('user_mission_participations').select('mission_id, progress_value').eq('user_id', user.id),
  ])

  const ongoingMissions = (ongoingRaw ?? []) as MissionRow[]
  const completions = (completionsRaw ?? []) as Pick<UserMissionCompletionRow, 'mission_id' | 'completed_at'>[]
  const participations = (participationsRaw ?? []) as Pick<UserMissionParticipationRow, 'mission_id' | 'progress_value'>[]

  const completionMap = new Map(completions.map((c) => [c.mission_id, c.completed_at]))
  const participationSet = new Set(participations.map((p) => p.mission_id))

  // 종료 탭: 내가 참여했던 미션 중 이미 종료된 것만 별도 조회
  const participatedIds = Array.from(participationSet)
  const { data: endedRaw } = participatedIds.length > 0
    ? await service.from('missions').select('*').lt('ends_at', now).in('id', participatedIds).order('ends_at', { ascending: false })
    : { data: [] }
  const endedMissions = (endedRaw ?? []) as MissionRow[]

  // 보상 배지 이름 일괄 fetch — 목록에서 "배지명 배지" 형식으로 표시하기 위해
  const allMissions = [...ongoingMissions, ...endedMissions]
  const allRewardBadgeIds = [...new Set(allMissions.flatMap((m) => m.reward_badge_ids ?? []))]
  let rewardBadgeNames: Record<string, string> = {}
  if (allRewardBadgeIds.length > 0) {
    const { data: badgeRows } = await service.from('badges').select('id, name').in('id', allRewardBadgeIds)
    rewardBadgeNames = Object.fromEntries(((badgeRows ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]))
  }

  const toItem = (m: MissionRow): MissionListItem => ({
    ...m,
    joined: participationSet.has(m.id),
    done: completionMap.has(m.id),
  })

  return (
    <MissionsListClient
      ongoing={ongoingMissions.map(toItem)}
      ended={endedMissions.map(toItem)}
      rewardBadgeNames={rewardBadgeNames}
    />
  )
}
