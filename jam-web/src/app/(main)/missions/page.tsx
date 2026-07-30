import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { MissionRow, UserMissionCompletionRow, UserMissionParticipationRow } from '@/types/database'
import MissionsListClient, { type MissionListItem } from './MissionsListClient'
import { d } from '@/lib/i18n'

export default async function MissionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const now = new Date().toISOString()

  const [{ data: ongoingRaw }, { data: completionsRaw }, { data: participationsRaw }] = await Promise.all([
    service.from('missions').select('*').gte('ends_at', now).order('ends_at', { ascending: true }),
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

  const toItem = (m: MissionRow): MissionListItem => ({
    ...m,
    joined: participationSet.has(m.id),
    done: completionMap.has(m.id),
  })

  return (
    <div className="flex flex-col min-h-full px-[var(--spacing-16)] pt-[calc(env(safe-area-inset-top)+var(--spacing-24))] pb-[var(--spacing-32)] bg-surface text-text">
      <div className="mb-[var(--spacing-24)]">
        <h1 className="text-[length:var(--text-heading)] leading-[var(--leading-heading)]">{d.missions.title}</h1>
      </div>

      <MissionsListClient
        ongoing={ongoingMissions.map(toItem)}
        ended={endedMissions.map(toItem)}
      />
    </div>
  )
}
