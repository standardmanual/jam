import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { collectTribeReferences, TRIBE_REFERENCE_SOURCES, summarizeReference } from '@/lib/admin/reference-guards'
import type { TribeRow } from '@/types/database'

// 저장·삭제 실패 응답은 고정 문구다. DB 오류 원문(제약 이름·내부 표 이름 등)은 응답에 싣지 않고 서버 로그에만 남긴다(티켓 20261019_1318 2회).
const SAVE_ERROR_MESSAGE = '트라이브가 저장되지 않았어요. 데이터베이스가 요청을 처리하지 못했어요. 잠시 뒤 다시 저장해 주세요.'
const ADJACENCY_SAVE_ERROR_MESSAGE = '인접 트라이브가 저장되지 않았어요. 데이터베이스가 요청을 처리하지 못했어요. 잠시 뒤 다시 저장해 주세요.'
const DELETE_ERROR_MESSAGE = '트라이브를 삭제하지 못했어요. 데이터베이스가 요청을 거부했어요. 잠시 뒤 다시 시도하고, 같으면 개발자에게 전달해 주세요.'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('tribes').select('*').eq('id', id).single()
  if (error || !data) return NextResponse.json({ error: '트라이브를 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ tribe: data })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { adjacent_tribe_ids } = body

  const supabase = createServiceClient()

  // 부분 body 병합을 위해 기존 row를 먼저 조회한다 — body에 없는(undefined) 필드는 기존 값을
  // 그대로 유지한다(20260827_005). 존재하지 않는 id면 update 시도 전에 404로 응답한다.
  const { data: existingData, error: fetchError } = await supabase
    .from('tribes')
    .select('*')
    .eq('id', id)
    .single()
  if (fetchError || !existingData) return NextResponse.json({ error: '트라이브를 찾을 수 없습니다.' }, { status: 404 })
  const existing = existingData as TribeRow

  const { data, error } = await supabase
    .from('tribes')
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

  if (error) {
    console.error('[tribes PUT] 저장 실패:', error)
    return NextResponse.json({ error: SAVE_ERROR_MESSAGE }, { status: 500 })
  }

  // 인접 트라이브 갱신 (배열 전달 시에만) — 드랍엔진 v2 Layer 2의 인접 버킷 원천
  if (Array.isArray(adjacent_tribe_ids)) {
    const ids = (adjacent_tribe_ids as string[]).filter((a) => a && a !== id)
    await supabase.from('tribe_adjacency').delete().eq('tribe_id', id)
    if (ids.length > 0) {
      const adjacencyQuery = supabase.from('tribe_adjacency')
      const adjInsertQuery = adjacencyQuery.insert(ids.map((adjacent_tribe_id) => ({ tribe_id: id, adjacent_tribe_id })))
      const { error: adjError } = await adjInsertQuery
      if (adjError) {
        console.error('[tribes PUT] 인접 저장 실패:', adjError)
        return NextResponse.json({ error: ADJACENCY_SAVE_ERROR_MESSAGE }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ tribe: data })
}

/**
 * 하드 삭제 — 참조 가드는 `lib/admin/reference-guards.ts`가 단일 출처다(티켓 20260907_1134).
 * `tribe_adjacency`는 CASCADE라 그냥 삭제하면 드랍엔진 인접 그래프가 조용히 깨지고,
 * `users.tribe_id`는 NO ACTION이라 FK 위반으로 삭제 자체가 실패할 수 있다.
 * 참조가 있으면 비활성화를 안내한다.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()

  const { data: existing, error: fetchError } = await supabase.from('tribes').select('id').eq('id', id).single()
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

  const { error } = await supabase.from('tribes').delete().eq('id', id)
  if (error) {
    console.error('[tribes DELETE] 삭제 실패:', error)
    return NextResponse.json({ error: DELETE_ERROR_MESSAGE }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
