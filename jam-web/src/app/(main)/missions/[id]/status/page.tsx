import { notFound, redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { MissionRow } from '@/types/database'
import MissionStatusClient from './MissionStatusClient'

type Props = { params: Promise<{ id: string }> }

export default async function MissionStatusPage({ params }: Props) {
  const { id: missionId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const [{ data: missionRaw }, { data: participation }] = await Promise.all([
    service.from('missions').select('id, title, status_display_type').eq('id', missionId).maybeSingle(),
    service.from('user_mission_participations').select('user_id').eq('user_id', user.id).eq('mission_id', missionId).maybeSingle(),
  ])

  if (!missionRaw) notFound()
  // 미참가자는 미션 상황 진입 불가 → 상세로 돌려보냄
  if (!participation) redirect(`/missions/${missionId}`)

  const mission = missionRaw as Pick<MissionRow, 'id' | 'title' | 'status_display_type'>

  return (
    <MissionStatusClient
      missionId={mission.id}
      missionTitle={mission.title}
      displayType={mission.status_display_type}
    />
  )
}
