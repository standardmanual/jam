import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('theme_presets')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ presets: data })
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, main_color, sub_color } = body

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: '이름은 필수입니다.' }, { status: 400 })
  }
  if (!HEX_COLOR_RE.test(main_color) || !HEX_COLOR_RE.test(sub_color)) {
    return NextResponse.json({ error: '컬러는 #RRGGBB 형식의 hex 값이어야 합니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('theme_presets')
    .insert({ name: name.trim(), main_color, sub_color, is_active: false })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ preset: data }, { status: 201 })
}
