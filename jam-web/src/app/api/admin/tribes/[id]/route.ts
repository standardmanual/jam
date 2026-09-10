import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { collectTribeReferences, TRIBE_REFERENCE_SOURCES, summarizeReference } from '@/lib/admin/reference-guards'
import type { TribeRow } from '@/types/database'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('factions').select('*').eq('id', id).single()
  if (error || !data) return NextResponse.json({ error: '트라이브를 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ tribe: data })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { adjacent_faction_ids } = body

  const supabase = createServiceClient()

  // 부분 body 병합을 위해 기존 row를 먼저 조회한다 — body에 없는(undefined) 필드는 기존 값을
  // 그대로 유지한다(20260827_005). 존재하지 않는 id면 update 시도 전에 404로 응답한다.
  const { data: existingData, error: fetchError } = await supabase
    .from('factions')
    .select('*')
    .eq('id', id)
    .single()
  if (fetchError || !existingData) return NextResponse.json({ error: '트라이브를 찾을 수 없습니다.' }, { status: 404 })
  const existing = existingData as TribeRow

  const { data, error } = await supabase
    .from('factions')
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
      // [20260901_1944] 애니메이션 해제는 명시적 null로 온다 — undefined(필드 생략)와 구분 유지.
      background_animation: body.background_animation !== undefined ? body.background_animation : existing.background_animation,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 인접 트라이브 갱신 (배열 전달 시에만) — 드랍엔진 v2 Layer 2의 인접 버킷 원천
  if (Array.isArray(adjacent_faction_ids)) {
    const ids = (adjacent_faction_ids as string[]).filter((a) => a && a !== id)
    await supabase.from('faction_adjacency').delete().eq('faction_id', id)
    if (ids.length > 0) {
      const adjacencyQuery = supabase.from('faction_adjacency')
      const adjInsertQuery = adjacencyQuery.insert(ids.map((adjacent_faction_id) => ({ faction_id: id, adjacent_faction_id })))
      const { error: adjError } = await adjInsertQuery
      if (adjError) return NextResponse.json({ error: `인접 저장 실패: ${adjError.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ tribe: data })
}

/**
 * 하드 삭제 — 참조 가드는 `lib/admin/reference-guards.ts`가 단일 출처다(티켓 20260907_1134).
 * `faction_adjacency`는 CASCADE라 그냥 삭제하면 드랍엔진 인접 그래프가 조용히 깨지고,
 * `user_drop_state.last_drop_faction_id`는 NO ACTION이라 FK 위반으로 삭제 자체가 실패할 수
 * 있다. 참조가 있으면 비활성화를 안내한다.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()

  const { data: existing, error: fetchError } = await supabase.from('factions').select('id').eq('id', id).single()
  if (fetchError || !existing) {
    return NextResponse.json({ error: '트라이브를 찾을 수 없습니다.' }, { status: 404 })
  }

  const { counts, error: refError } = await collectTribeReferences(supabase, [id])
  if (refError) {
    console.error('[tribes DELETE] 참조 카운트 조회 실패 — 하드 삭제를 차단합니다:', refError)
    return NextResponse.json(
      { error: '삭제할 수 없습니다. 이력 조회 중 오류가 발생했어요. 다시 시도해도 같으면 개발자에게 전달해 주세요.' },
      { status: 500 }
    )
  }

  const summary = summarizeReference(TRIBE_REFERENCE_SOURCES, counts.get(id)!)
  if (summary.blockingTotal > 0) {
    return NextResponse.json(
      {
        error: `삭제할 수 없습니다. 이 트라이브에 연결된 참조가 ${summary.blockingTotal}건 있습니다(${summary.hitLabels}). 비활성화를 이용해주세요.`,
      },
      { status: 409 }
    )
  }

  const { error } = await supabase.from('factions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
