import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { cascadeDeactivateItemBookBadges } from '@/lib/admin/itembook-deactivation'

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
    // @ts-expect-error Supabase 타입 추론 제한 우회
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
