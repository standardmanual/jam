import { notFound, redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { MissionRow } from '@/types/database'
import BadgeTicket from '@/app/(main)/badges/[id]/BadgeTicket'
import { formatTicketDate, missionTicketColor } from '@/lib/badgeTicket/ticketColor'
import MissionStatusClient from './MissionStatusClient'
import MissionSummary from './MissionSummary'
import MissionBoard from './MissionBoard'

type Props = { params: Promise<{ id: string }> }

export default async function MissionStatusPage({ params }: Props) {
  const { id: missionId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const [{ data: missionRaw }, { data: participation }] = await Promise.all([
    service
      .from('missions')
      .select('id, title, status_display_type, mission_type')
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

  const mission = missionRaw as Pick<MissionRow, 'id' | 'title' | 'status_display_type' | 'mission_type'>

  // 티켓(티켓 20261127_1145): 틀은 서버가 첫 HTML에 그린다. 색·머리 글자·날짜(오늘, 한국 시각)를 여기서 정하고, 클라이언트 훅으로 칠하지 않는다.
  // 요약 상자(photo)·목록 카드(body)는 클라이언트 조각이고, 응답은 래퍼가 한 번만 받아 컨텍스트로 나눈다.
  const isRanking = mission.status_display_type === 'ranking'

  return (
    <MissionStatusClient
      missionId={mission.id}
      missionTitle={mission.title}
      displayType={mission.status_display_type}
      missionType={mission.mission_type}
    >
      <BadgeTicket
        color={missionTicketColor()}
        kindLabel={isRanking ? 'RANKING' : 'MISSION'}
        dateText={formatTicketDate(new Date().toISOString())}
        photo={<MissionSummary />}
        body={<MissionBoard />}
      />
    </MissionStatusClient>
  )
}
