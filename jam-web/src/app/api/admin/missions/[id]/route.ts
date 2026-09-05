import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { checkMissionCondition } from '@/lib/missions/condition-keys'
import type { MissionType } from '@/types/database'

// PATCH /api/admin/missions/[id] — 기존 미션 수정.
// 티켓 20260813_001: status_display_type을 'individual'로 전환하는 등 이미 활성화된
// 미션도 운영자가 수정할 수 있어야 해서 신설.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { id } = await params
  const body = await req.json()
  const supabase = createServiceClient()

  // condition_json 키 검증 (티켓 20260905_1141). 부분 갱신이라 body에 condition_json이
  // 없을 수 있고, 그때는 기존 조건을 건드리지 않는 갱신이므로 검사하지 않는다.
  if (body.condition_json !== undefined) {
    // pending 키 차단 여부가 미션 타입에 따라 갈리므로 «갱신 후의» 타입이 필요하다.
    // 폼은 항상 mission_type을 함께 보내지만, 없으면 기존 행에서 가져온다.
    let missionType = body.mission_type as MissionType | undefined
    if (missionType === undefined) {
      const { data: existing } = await supabase
        .from('missions')
        .select('mission_type')
        .eq('id', id)
        .single<{ mission_type: MissionType }>()
      if (!existing) {
        return NextResponse.json({ error: '미션을 찾지 못했어요. 목록을 새로고침한 뒤 다시 시도해주세요.' }, { status: 404 })
      }
      missionType = existing.mission_type
    }

    const { error: conditionError } = checkMissionCondition(missionType, body.condition_json)
    if (conditionError) {
      return NextResponse.json({ error: conditionError }, { status: 400 })
    }
  }

  const { data, error } = await supabase
    .from('missions')
    .update(body as never)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { id } = await params
  const supabase = createServiceClient()
  const { error } = await supabase.from('missions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
