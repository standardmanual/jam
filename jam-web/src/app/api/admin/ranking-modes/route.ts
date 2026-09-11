import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, getAdminUser } from '@/lib/admin/auth'
import type { RankingModeSavePayload } from '@/lib/admin/ranking-modes'

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

  const { data, error } = await supabase
    .from('ranking_modes')
    .insert({ ...body, created_by: admin?.id ?? null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
