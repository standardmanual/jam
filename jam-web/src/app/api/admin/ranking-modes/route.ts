import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, getAdminUser } from '@/lib/admin/auth'
import type { RankingModeSavePayload } from '@/lib/admin/ranking-modes'
import { PERIOD_EARNED_CHECK_FAILED_ERROR, rankingModeMissionRejection } from '@/lib/admin/ranking-mode-mission-guard'

// GET /api/admin/ranking-modes — 랭킹모드 목록(최신순). 투데이 카드 폼의 선택지·목록 화면이 쓴다.
export async function GET() {
  const authError = await requireAdmin()
  if (authError) return authError

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('ranking_modes').select('*').order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const admin = await getAdminUser()
  const body = (await req.json()) as RankingModeSavePayload
  const supabase = createServiceClient()

  // 기간 동안 모은 잼 미션은 연결하지 못한다(티켓 20261019_1445 3-B). 조건을 읽지 못하면 저장하지 않는다(fail-closed).
  try {
    const rejection = await rankingModeMissionRejection(supabase, body)
    if (rejection) return NextResponse.json({ error: rejection }, { status: 400 })
  } catch (err) {
    console.error('[ranking-modes POST] 연결할 미션 조건 조회 실패 — 저장을 차단합니다:', err)
    return NextResponse.json({ error: PERIOD_EARNED_CHECK_FAILED_ERROR }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('ranking_modes')
    .insert({ ...body, created_by: admin?.id ?? null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
