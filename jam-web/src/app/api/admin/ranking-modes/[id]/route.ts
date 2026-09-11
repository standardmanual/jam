import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import type { RankingModeSavePayload } from '@/lib/admin/ranking-modes'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('ranking_modes').select('*').eq('id', id).maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '랭킹 규칙을 찾을 수 없어요.' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { id } = await params
  const body = (await req.json()) as RankingModeSavePayload
  const supabase = createServiceClient()

  const { data, error } = await supabase.from('ranking_modes').update(body).eq('id', id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { id } = await params
  const supabase = createServiceClient()
  // today_cards.ranking_mode_id는 ON DELETE SET NULL이라 삭제해도 참조하는 카드는 남는다
  // (카드는 깨진 랭킹보드로 남아 어드민 목록에서 확인 가능 — User Story 8과 같은 취지).
  const { error } = await supabase.from('ranking_modes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
