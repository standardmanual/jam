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
  const { data, error } = await supabase
    .from('item_books')
    // @ts-expect-error Supabase 타입 추론 제한 우회
    .update({ name, description, image_url: image_url ?? null, required_activity_badge_id, reward_badge_id, faction_id: faction_id ?? null, story_text: story_text ?? null, is_active: is_active ?? true, background_color: background_color ?? null, background_shader_id: background_shader_id ?? null, background_image_url: background_image_url ?? null, background_video_url: background_video_url ?? null })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
