import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('item_books').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ itemBooks: data })
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, description, image_url, required_activity_badge_id, reward_badge_id, faction_id, story_text, is_active, background_color, background_shader_id, background_image_url, background_video_url } = body

  if (!name || !description || !required_activity_badge_id) {
    return NextResponse.json({ error: '필수 필드가 누락되었습니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const insertPayload = {
    name,
    description,
    image_url: image_url ?? null,
    required_activity_badge_id,
    reward_badge_id: reward_badge_id ?? null,
    faction_id: faction_id ?? null,
    story_text: story_text ?? null,
    is_active: is_active ?? true,
    background_color: background_color ?? null,
    background_shader_id: background_shader_id ?? null,
    background_image_url: background_image_url ?? null,
    background_video_url: background_video_url ?? null,
  }
  const itemBooksQuery = supabase.from('item_books')
  // @ts-expect-error Supabase insert/update/upsert 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 ItemBooksRow와 일치
  const insertQuery = itemBooksQuery.insert(insertPayload)
  const { data, error } = await insertQuery.select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ itemBook: data }, { status: 201 })
}
