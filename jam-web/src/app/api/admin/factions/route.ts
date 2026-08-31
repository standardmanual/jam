import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('factions')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ factions: data })
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const {
    name, tagline, description, image_url, drop_weight, is_active, sort_order,
    background_color, background_shader_id, background_image_url, background_video_url,
  } = body

  if (!name) {
    return NextResponse.json({ error: '이름은 필수입니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const insertPayload = {
    name,
    tagline: tagline ?? null,
    description: description ?? null,
    image_url: image_url ?? null,
    drop_weight: drop_weight ?? 1.0,
    is_active: is_active ?? true,
    sort_order: sort_order ?? 0,
    background_color: background_color ?? null,
    background_shader_id: background_shader_id ?? null,
    background_image_url: background_image_url ?? null,
    background_video_url: background_video_url ?? null,
  }
  const factionsQuery = supabase.from('factions')
  const insertQuery = factionsQuery.insert(insertPayload)
  const { data, error } = await insertQuery.select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ faction: data }, { status: 201 })
}
