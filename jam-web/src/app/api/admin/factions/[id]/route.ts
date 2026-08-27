import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import type { FactionRow } from '@/types/database'

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
  const { adjacent_faction_ids } = body

  const supabase = createServiceClient()

  // 부분 body 병합을 위해 기존 row를 먼저 조회한다 — body에 없는(undefined) 필드는 기존 값을
  // 그대로 유지한다(20260827_003). 존재하지 않는 id면 update 시도 전에 404로 응답한다.
  const { data: existingData, error: fetchError } = await supabase
    .from('factions')
    .select('*')
    .eq('id', id)
    .single()
  if (fetchError || !existingData) return NextResponse.json({ error: '세계관을 찾을 수 없습니다.' }, { status: 404 })
  const existing = existingData as FactionRow

  const { data, error } = await supabase
    .from('factions')
    // @ts-expect-error Supabase 타입 추론 제한 우회
    .update({
      name: body.name !== undefined ? body.name : existing.name,
      tagline: body.tagline !== undefined ? body.tagline : existing.tagline,
      description: body.description !== undefined ? body.description : existing.description,
      image_url: body.image_url !== undefined ? body.image_url : existing.image_url,
      drop_weight: body.drop_weight !== undefined ? body.drop_weight : existing.drop_weight,
      is_active: body.is_active !== undefined ? body.is_active : existing.is_active,
      sort_order: body.sort_order !== undefined ? body.sort_order : existing.sort_order,
      background_color: body.background_color !== undefined ? body.background_color : existing.background_color,
      background_shader_id: body.background_shader_id !== undefined ? body.background_shader_id : existing.background_shader_id,
      background_image_url: body.background_image_url !== undefined ? body.background_image_url : existing.background_image_url,
      background_video_url: body.background_video_url !== undefined ? body.background_video_url : existing.background_video_url,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 인접 세계관 갱신 (배열 전달 시에만) — 드랍엔진 v2 Layer 2의 인접 버킷 원천
  if (Array.isArray(adjacent_faction_ids)) {
    const ids = (adjacent_faction_ids as string[]).filter((a) => a && a !== id)
    await supabase.from('faction_adjacency').delete().eq('faction_id', id)
    if (ids.length > 0) {
      const adjacencyQuery = supabase.from('faction_adjacency')
      // @ts-expect-error Supabase insert/update/upsert 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 FactionAdjacencyRow와 일치
      const adjInsertQuery = adjacencyQuery.insert(ids.map((adjacent_faction_id) => ({ faction_id: id, adjacent_faction_id })))
      const { error: adjError } = await adjInsertQuery
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
