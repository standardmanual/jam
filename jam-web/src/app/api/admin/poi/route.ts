import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { resolvePoiRadiusMeters } from '@/lib/poi/radius-policy'

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
  const insertPayload = {
    name,
    latitude,
    longitude,
    radius_meters: resolvePoiRadiusMeters(category, radius_meters),
    category,
    linked_badge_id: linked_badge_id ?? null,
  }
  const poiQuery = supabase.from('poi')
  // @ts-expect-error Supabase insert/update/upsert 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 PoiRow와 일치
  const insertQuery = poiQuery.insert(insertPayload)
  const { data, error } = await insertQuery.select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ poi: data }, { status: 201 })
}
