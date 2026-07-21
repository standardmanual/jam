import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('factions').select('*').eq('id', id).single()
  if (error || !data) return NextResponse.json({ error: '세계관을 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ faction: data })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { name, tagline, description, image_url, drop_weight, is_active, sort_order, adjacent_faction_ids } = body

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('factions')
    // @ts-expect-error Supabase 타입 추론 제한 우회
    .update({ name, tagline, description, image_url, drop_weight, is_active, sort_order })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 인접 세계관 갱신 (배열 전달 시에만) — 드랍엔진 v2 Layer 2의 인접 버킷 원천
  if (Array.isArray(adjacent_faction_ids)) {
    const ids = (adjacent_faction_ids as string[]).filter((a) => a && a !== id)
    await supabase.from('faction_adjacency').delete().eq('faction_id', id)
    if (ids.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: adjError } = await (supabase as any)
        .from('faction_adjacency')
        .insert(ids.map((adjacent_faction_id) => ({ faction_id: id, adjacent_faction_id })))
      if (adjError) return NextResponse.json({ error: `인접 저장 실패: ${adjError.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ faction: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()
  const { error } = await supabase.from('factions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
