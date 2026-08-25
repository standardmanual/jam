import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { MissionRow, UserMissionCompletionRow, UserMissionParticipationRow } from '@/types/database'
import { loadMissionVisibilityContext } from '@/lib/missions/visibility-server'
import { resolveMissionVisibilityMap } from '@/lib/missions/visibility'
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
  const completedIds = [...completionMap.keys()]

  // 종료 탭('완료/지난') 1: 내가 참여했던 미션 중 이미 종료된 것
  const participatedIds = Array.from(participationSet)
  const { data: endedRaw } = participatedIds.length > 0
    ? await service.from('missions').select('*').lt('ends_at', now).in('id', participatedIds).order('ends_at', { ascending: false })
    : { data: [] }
  const endedMissions = (endedRaw ?? []) as MissionRow[]

  // 종료 탭('완료/지난') 2: 내가 완료한 미션 — 상시 미션(ends_at NULL)은 종료 조건에 영원히
  // 걸리지 않아 위 조회로는 잡히지 않는다. 완료 이력이 사라지지 않도록 따로 합친다 (20260825_028).
  const endedIds = new Set(endedMissions.map((m) => m.id))
  const missingCompletedIds = completedIds.filter((id) => !endedIds.has(id))
  const { data: completedRaw } = missingCompletedIds.length > 0
    ? await service.from('missions').select('*').in('id', missingCompletedIds)
    : { data: [] }
  const completedMissions = (completedRaw ?? []) as MissionRow[]

  // ── 노출 판정 (목록·상세·참가 API·오늘카드 공통 규칙) ───────────────────
  const visibilityContext = await loadMissionVisibilityContext(
    user.id,
    ongoingMissions,
    { completedMissionIds: new Set(completedIds), participatedMissionIds: participationSet },
  )
  const visibilityMap = resolveMissionVisibilityMap(ongoingMissions, visibilityContext)

  // 진행중/참가중 탭 대상 — 완료(completed)·미해금 상위 단계(hidden)는 제외하고
  // 바로 다음 1단계(locked)까지만 잠금 카드로 내려보낸다.
  const visibleOngoing = ongoingMissions.filter((m) => {
    const v = visibilityMap.get(m.id)?.visibility
    return v === 'open' || v === 'locked'
  })

  // 보상 배지 이름 일괄 fetch — 목록에서 "배지명 배지" 형식으로 표시하기 위해
  const allMissions = [...visibleOngoing, ...endedMissions, ...completedMissions]
  const allRewardBadgeIds = [...new Set(allMissions.flatMap((m) => m.reward_badge_ids ?? []))]
  let rewardBadgeNames: Record<string, string> = {}
  if (allRewardBadgeIds.length > 0) {
    const { data: badgeRows } = await service.from('badges').select('id, name').in('id', allRewardBadgeIds).is('deleted_at', null)
    rewardBadgeNames = Object.fromEntries(((badgeRows ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]))
  }

  const toItem = (m: MissionRow): MissionListItem => {
    const result = visibilityMap.get(m.id)
    return {
      ...m,
      joined: participationSet.has(m.id),
      done: completionMap.has(m.id),
      completedAt: completionMap.get(m.id) ?? null,
      locked: result?.visibility === 'locked',
      requiredBadge: result?.requiredBadge ?? null,
    }
  }

  return (
    <MissionsListClient
      ongoing={visibleOngoing.map(toItem)}
      ended={[...completedMissions, ...endedMissions].map(toItem)}
      rewardBadgeNames={rewardBadgeNames}
    />
  )
}
