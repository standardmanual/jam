import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { checkMissionCondition } from '@/lib/missions/condition-keys'
import type { MissionType } from '@/types/database'

export async function GET() {
  const authError = await requireAdmin()
  if (authError) return authError

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('missions')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json()

  // condition_json 키 검증 (티켓 20260905_1141) — 어드민 폼이 자유 JSON textarea라
  // 오타 키가 그대로 저장되면 그 미션은 fail-closed에 걸려 «영구 미달성»이 된다.
  const { error: conditionError } = checkMissionCondition(
    body.mission_type as MissionType,
    body.condition_json
  )
  if (conditionError) {
    return NextResponse.json({ error: conditionError }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('missions')
    .insert(body)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
