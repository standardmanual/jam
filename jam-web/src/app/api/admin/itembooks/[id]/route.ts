import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { cascadeDeactivateItemBookBadges } from '@/lib/admin/itembook-deactivation'
import type { ItemBookRow } from '@/types/database'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  const supabase = createServiceClient()

  // 부분 body 병합을 위해 기존 row를 먼저 조회한다 — body에 없는(undefined) 필드는 기존 값을
  // 그대로 유지한다(20260827_007, factions PUT과 동일 패턴). 존재하지 않는 id면 update 시도
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
 * false→true(재활성화)는 is_active만 갱신, 배지는 건드리지 않는다(기존 설계 결정 유지).
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
  }

  return NextResponse.json({ itemBook: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()
  const { error } = await supabase.from('item_books').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
