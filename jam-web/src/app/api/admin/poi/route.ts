import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('poi').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ poi: data })
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, latitude, longitude, radius_meters, category, linked_badge_id } = body

  if (!name || latitude == null || longitude == null || !radius_meters || !category) {
    return NextResponse.json({ error: '필수 필드가 누락되었습니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('poi')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ name, latitude, longitude, radius_meters, category, linked_badge_id: linked_badge_id ?? null } as any)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ poi: data }, { status: 201 })
}
