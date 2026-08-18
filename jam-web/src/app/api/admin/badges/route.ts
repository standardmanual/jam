import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { findCumulativeConditionError } from '@/lib/admin/badge-validation'

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('badges').select('*').order('created_at', { ascending: false }).limit(5000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ badges: data })
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, description, type, rarity, image_url, activity_types, patch_available, patch_price_krw, condition_json, faction_id, item_book_id, drop_weight, valid_from, valid_until, point_reward, background_color, background_shader_id } = body

  if (!name || !description || !type || !rarity || !image_url) {
    return NextResponse.json({ error: '필수 필드가 누락되었습니다.' }, { status: 400 })
  }

  const cumulativeError = findCumulativeConditionError(type, condition_json ?? null)
  if (cumulativeError) {
    return NextResponse.json({ error: cumulativeError }, { status: 400 })
  }

  const supabase = createServiceClient()
  const insertPayload = {
    name,
    description,
    type,
    rarity,
    image_url,
    activity_types: activity_types ?? [],
    patch_available: patch_available ?? false,
    patch_price_krw: patch_price_krw ?? null,
    // POI 배지는 "어느 POI를 지나갔는가"로만 판정 — 활동 조건이 섞이지 않도록 강제 null
    condition_json: type === 'poi' ? null : condition_json ?? null,
    faction_id: faction_id ?? null,
    item_book_id: item_book_id ?? null,
    drop_weight: drop_weight ?? 1.0,
    valid_from: valid_from ?? null,
    valid_until: valid_until ?? null,
    point_reward: Math.max(0, Math.trunc(Number(point_reward) || 0)),
    background_color: background_color ?? null,
    background_shader_id: background_shader_id ?? null,
  }
  const badgesQuery = supabase.from('badges')
  // @ts-expect-error Supabase insert/update/upsert 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 BadgesRow와 일치
  const insertQuery = badgesQuery.insert(insertPayload)
  const { data, error } = await insertQuery.select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ badge: data }, { status: 201 })
}
