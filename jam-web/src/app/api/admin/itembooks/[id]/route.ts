import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { cascadeActivateItemBookBadges, cascadeDeactivateItemBookBadges } from '@/lib/admin/itembook-deactivation'
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
      faction_id: body.faction_id !== undefined ? body.faction_id : existing.faction_id,
      story_text: body.story_text !== undefined ? body.story_text : existing.story_text,
      is_active: nextIsActive,
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

  // 컬렉션 비활성화 → 소속 아이템배지 연쇄 소프트삭제 (20260823_004). PATCH(즉시 토글)와
  // 공유하는 캐스케이드 함수 — cascadeDeactivateItemBookBadges 주석 참조.
  if (nextIsActive === false) {
    const { error: badgesError } = await cascadeDeactivateItemBookBadges(supabase, id)

    if (badgesError) {
      return NextResponse.json(
        {
          error: `컬렉션은 비활성화됐지만 소속 배지 회수에 실패했습니다: ${badgesError}. 다시 저장을 시도해주세요.`,
        },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ itemBook: data })
}

/**
 * 목록/상세 화면의 즉시 토글용 — 폼의 전체 저장 PUT과 별개(20260823_006).
 * body: { is_active: boolean }. is_active 컬럼만 갱신한다.
 * true→false(비활성화)는 PUT과 동일하게 소속 배지를 연쇄 소프트삭제한다.
 * false→true(재활성화)는 이 컬렉션 캐스케이드로 죽었던 배지만 연쇄로 되살린다
 * (`cascadeActivateItemBookBadges`, 티켓 20260908_2129 2차) — 개별 사유로 비활성화된 배지는
 * 건드리지 않는다. 이전에는 "배지는 건드리지 않는다"가 의도적 결정이었으나, "컬렉션 비활성화로
 * 죽은 배지와 개별 사유로 죽은 배지를 구분할 수 없다"는 그 이유가 `deactivated_by_item_book_id`
 * 컬럼 추가로 해소되면서 사용자 확정에 따라 뒤집혔다.
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

  if (is_active === false) {
    const { error: badgesError } = await cascadeDeactivateItemBookBadges(supabase, id)

    if (badgesError) {
      return NextResponse.json(
        {
          error: `컬렉션은 비활성화됐지만 소속 배지 회수에 실패했습니다: ${badgesError}. 다시 시도해주세요.`,
        },
        { status: 500 }
      )
    }
  } else if (is_active === true) {
    const { error: badgesError } = await cascadeActivateItemBookBadges(supabase, id)

    if (badgesError) {
      return NextResponse.json(
        {
          error: `컬렉션은 활성화됐지만 소속 배지 복구에 실패했습니다: ${badgesError}. 다시 시도해주세요.`,
        },
        { status: 500 }
      )
    }
  }

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
