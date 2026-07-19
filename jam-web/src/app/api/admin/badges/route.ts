import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('badges').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ badges: data })
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, description, type, rarity, image_url, activity_types, patch_available, patch_price_krw, condition_json, faction_id, drop_weight, valid_from, valid_until } = body

  if (!name || !description || !type || !rarity || !image_url) {
    return NextResponse.json({ error: '필수 필드가 누락되었습니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('badges')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      name,
      description,
      type,
      rarity,
      image_url,
      activity_types: activity_types ?? [],
      patch_available: patch_available ?? false,
      patch_price_krw: patch_price_krw ?? null,
      condition_json: condition_json ?? null,
      faction_id: faction_id ?? null,
      drop_weight: drop_weight ?? 1.0,
      valid_from: valid_from ?? null,
      valid_until: valid_until ?? null,
    } as any)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ badge: data }, { status: 201 })
}
