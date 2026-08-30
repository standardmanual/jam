import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { resolvePoiRadiusMeters } from '@/lib/poi/radius-policy'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { name, latitude, longitude, radius_meters, category, linked_badge_id, is_active } = body

  const supabase = createServiceClient()
  const updatePayload = {
    name,
    latitude,
    longitude,
    radius_meters: resolvePoiRadiusMeters(category, radius_meters),
    category,
    linked_badge_id,
    is_active: is_active !== undefined ? is_active : true,
  }
  const { data, error } = await supabase
    .from('poi')
    // @ts-expect-error Supabase update() 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 PoiRow와 일치
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ poi: data })
}

/**
 * 목록/상세 화면의 즉시 토글용 — 폼의 전체 저장 PUT과 별개(20260830_1619).
 * body: { is_active: boolean }. is_active 컬럼만 갱신한다.
 * item_books.is_active와 달리 POI는 연쇄 영향(드랍/체크인 로직 미연동)이 없어 확인 없이
 * 즉시 반영한다.
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
    .from('poi')
    // @ts-expect-error Supabase update() 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 PoiRow와 일치
    .update({ is_active })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ poi: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()
  const { error } = await supabase.from('poi').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
