import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { recordFeedEvent } from '@/lib/activity-feed'

type Params = { params: Promise<{ id: string }> }

// POST /api/missions/[id]/join — 미션 참가
export async function POST(_req: Request, { params }: Params) {
  const { id: missionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const service = createServiceClient()

  // 미션 존재 + 아직 진행 중인지 확인
  const { data: mission } = await service
    .from('missions')
    .select('id, title, ends_at')
    .eq('id', missionId)
    .single() as { data: { id: string; title: string; ends_at: string } | null }

  if (!mission) return NextResponse.json({ error: '미션을 찾을 수 없어요.' }, { status: 404 })
  if (new Date(mission.ends_at) < new Date()) {
    return NextResponse.json({ error: '이미 종료된 미션이에요.' }, { status: 400 })
  }

  const { error } = await service
    .from('user_mission_participations')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ user_id: user.id, mission_id: missionId } as any)

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 참가 중인 미션이에요.' }, { status: 409 })
    }
    return NextResponse.json({ error: '참가 처리 중 오류가 발생했어요.' }, { status: 500 })
  }

  await recordFeedEvent(user.id, 'mission_joined', { mission_id: missionId, mission_title: mission.title })

  return NextResponse.json({ success: true })
}

// 참가 취소(DELETE)는 Phase13에서 폐지 — 한번 참가하면 되돌릴 수 없다.
