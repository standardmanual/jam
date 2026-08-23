import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { name, description, image_url, required_activity_badge_id, reward_badge_id, faction_id, story_text, is_active, background_color, background_shader_id, background_image_url, background_video_url } = body

  const supabase = createServiceClient()
  const nextIsActive = is_active ?? true

  const { data, error } = await supabase
    .from('item_books')
    // @ts-expect-error Supabase 타입 추론 제한 우회
    .update({ name, description, image_url: image_url ?? null, required_activity_badge_id, reward_badge_id, faction_id: faction_id ?? null, story_text: story_text ?? null, is_active: nextIsActive, background_color: background_color ?? null, background_shader_id: background_shader_id ?? null, background_image_url: background_image_url ?? null, background_video_url: background_video_url ?? null })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 컬렉션 비활성화 → 소속 아이템배지 연쇄 소프트삭제 (20260823_004). 물리적 삭제가 아니라
  // badges.deleted_at만 세팅 — 이미 발급된 유저의 이력(inventory_items/user_activity_badges/
  // user_poi_badge_earns)은 FK 그대로 보존되고, 유저 노출 화면에서만 제외된다
  // (badges/[id]/route.ts DELETE 핸들러와 동일한 소프트삭제 원칙). `deleted_at IS NULL` 조건 덕에
  // 이 쿼리는 멱등이다 — 이미 비활성 상태인 컬렉션을 다시 저장(재시도)해도 안전하게 재실행된다.
  if (nextIsActive === false) {
    const { error: badgesError } = await supabase
      .from('badges')
      // @ts-expect-error Supabase 타입 추론 제한 우회
      .update({ deleted_at: new Date().toISOString() })
      .eq('item_book_id', id)
      .is('deleted_at', null)

    if (badgesError) {
      return NextResponse.json(
        {
          error: `컬렉션은 비활성화됐지만 소속 배지 회수에 실패했습니다: ${badgesError.message}. 다시 저장을 시도해주세요.`,
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
