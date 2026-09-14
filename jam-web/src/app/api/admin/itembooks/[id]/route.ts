import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { collectItemBookReferences, ITEM_BOOK_REFERENCE_SOURCES, summarizeReference } from '@/lib/admin/reference-guards'
import type { ItemBookRow } from '@/types/database'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  const supabase = createServiceClient()

  // 부분 body 병합을 위해 기존 row를 먼저 조회한다 — body에 없는(undefined) 필드는 기존 값을
  // 그대로 유지한다(20260827_007, tribes PUT과 동일 패턴). 존재하지 않는 id면 update 시도
  // 전에 404로 응답한다.
  const { data: existingData, error: fetchError } = await supabase
    .from('item_books')
    .select('*')
    .eq('id', id)
    .single()
  if (fetchError || !existingData) return NextResponse.json({ error: '아이템북을 찾을 수 없습니다.' }, { status: 404 })
  const existing = existingData as ItemBookRow

  const nextIsActive = body.is_active !== undefined ? body.is_active : existing.is_active

  const { data, error } = await supabase
    .from('item_books')
    .update({
      name: body.name !== undefined ? body.name : existing.name,
      description: body.description !== undefined ? body.description : existing.description,
      image_url: body.image_url !== undefined ? body.image_url : existing.image_url,
      required_activity_badge_id: body.required_activity_badge_id !== undefined ? body.required_activity_badge_id : existing.required_activity_badge_id,
      reward_badge_id: body.reward_badge_id !== undefined ? body.reward_badge_id : existing.reward_badge_id,
      reward_points: body.reward_points !== undefined ? Math.max(0, body.reward_points) : existing.reward_points,
      tribe_id: body.tribe_id !== undefined ? body.tribe_id : existing.tribe_id,
      story_text: body.story_text !== undefined ? body.story_text : existing.story_text,
      is_active: nextIsActive,
      // 노출 기간(마이그레이션 171, 티켓 20260914_1729) — badges.valid_from/valid_until과
      // 동일한 부분 병합 패턴. 컬렉션이 비활성(기간 밖 포함)이어도 소속 배지는 건드리지 않는다.
      valid_from: body.valid_from !== undefined ? body.valid_from : existing.valid_from,
      valid_until: body.valid_until !== undefined ? body.valid_until : existing.valid_until,
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

  return NextResponse.json({ itemBook: data })
}

/**
 * 목록/상세 화면의 즉시 토글용 — 폼의 전체 저장 PUT과 별개(20260823_006).
 * body: { is_active: boolean }. is_active 컬럼만 갱신한다.
 *
 * 티켓 20260914_1729: 소속 아이템배지 연쇄 소프트삭제/복구(`cascadeDeactivateItemBookBadges`/
 * `cascadeActivateItemBookBadges`)를 완전히 폐지했다 — 컬렉션의 활성/비활성(및 노출 기간)은
 * 소속 배지의 활성 여부와 이제 완전히 독립적이다. 컬렉션이 비활성이어도 배지의 `item_book_id`
 * 배정 관계는 그대로 유지되고, 배지 자체의 활성 여부는 배지 쪽 PATCH(`/api/admin/badges/[id]`)로만
 * 관리된다.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { is_active } = body as { is_active?: boolean }

  if (typeof is_active !== 'boolean') {
    return NextResponse.json({ error: 'is_active는 boolean이어야 합니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('item_books')
    .update({ is_active })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ itemBook: data })
}

/**
 * 하드 삭제 — 참조 가드는 `lib/admin/reference-guards.ts`가 단일 출처다(티켓 20260907_1134).
 * `user_item_book_slots`·`user_item_book_completions`는 CASCADE라 그냥 삭제하면 유저 진행
 * 기록이 조용히 사라지고, `user_drop_state.last_drop_book_id`는 NO ACTION이라 FK 위반으로
 * 삭제 자체가 실패할 수 있다. 참조가 있으면 비활성화를 안내한다.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()

  const { data: existing, error: fetchError } = await supabase.from('item_books').select('id').eq('id', id).single()
  if (fetchError || !existing) {
    return NextResponse.json({ error: '컬렉션을 찾을 수 없습니다.' }, { status: 404 })
  }

  const { counts, error: refError } = await collectItemBookReferences(supabase, [id])
  if (refError) {
    console.error('[itembooks DELETE] 참조 카운트 조회 실패 — 하드 삭제를 차단합니다:', refError)
    return NextResponse.json(
      { error: '삭제할 수 없습니다. 이력 조회 중 오류가 발생했어요. 다시 시도해도 같으면 개발자에게 전달해 주세요.' },
      { status: 500 }
    )
  }

  const summary = summarizeReference(ITEM_BOOK_REFERENCE_SOURCES, counts.get(id)!)
  if (summary.blockingTotal > 0) {
    return NextResponse.json(
      {
        error: `삭제할 수 없습니다. 이 컬렉션에 유저 진행 기록이 ${summary.blockingTotal}건 있습니다(${summary.hitLabels}). 비활성화를 이용해주세요.`,
      },
      { status: 409 }
    )
  }

  const { error } = await supabase.from('item_books').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
