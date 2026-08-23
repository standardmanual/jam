import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { findCumulativeConditionError } from '@/lib/admin/badge-validation'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { name, description, type, rarity, image_url, activity_types, patch_available, patch_price_krw, condition_json, faction_id, item_book_id, drop_weight, valid_from, valid_until, point_reward, background_color, background_shader_id, background_image_url, background_video_url } = body

  const cumulativeError = findCumulativeConditionError(type, condition_json ?? null)
  if (cumulativeError) {
    return NextResponse.json({ error: cumulativeError }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('badges')
    // @ts-expect-error Supabase 타입 추론 제한 우회
    .update({
      name,
      description,
      type,
      rarity,
      image_url,
      activity_types,
      patch_available,
      patch_price_krw,
      // POI 배지는 "어느 POI를 지나갔는가"로만 판정 — 활동 조건이 섞이지 않도록 강제 null
      condition_json: type === 'poi' ? null : condition_json,
      faction_id: faction_id ?? null,
      item_book_id: item_book_id ?? null,
      drop_weight: drop_weight ?? 1.0,
      valid_from: valid_from ?? null,
      valid_until: valid_until ?? null,
      point_reward: Math.max(0, Math.trunc(Number(point_reward) || 0)),
      background_color: background_color ?? null,
      background_shader_id: background_shader_id ?? null,
      // 배경 3모드(단색 / 정적 제너레이터 / 애니메이션 제너레이터)는 상호 배타적이라 선택하지 않은
      // 쪽은 항상 null로 정리된다 — 정리 책임은 저작 화면(BadgeForm)에 있고, 여기서는 넘어온 값을
      // 그대로 반영한다(20260819_012).
      background_image_url: background_image_url ?? null,
      background_video_url: background_video_url ?? null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ badge: data })
}

/**
 * 소프트 삭제 — 배지 행은 남기고 deleted_at만 세팅한다.
 * 이미 발급된 유저의 user_activity_badges/inventory_items 등 이력은 badges FK를
 * 그대로 참조하므로 하드 삭제 시 FK 위반이 나거나(CASCADE 없음) 이력이 사라진다.
 * 서비스 상에서는 신규 발급/드랍/노출 대상에서 제외되지만 보유자 이력 조회는 유지된다.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('badges')
    // @ts-expect-error Supabase 타입 추론 제한 우회
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/**
 * 목록/상세 화면의 즉시 토글용(20260823_006). body: { active: boolean }.
 * active: false → deleted_at = now() (기존 DELETE 핸들러와 동일 동작 — DELETE는 그대로 두고
 * BadgeForm.tsx의 기존 삭제 흐름이 계속 사용한다).
 * active: true → deleted_at = null (신규 — 지금까지 배지를 되살리는 API가 없었음).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { active } = body as { active?: boolean }

  if (typeof active !== 'boolean') {
    return NextResponse.json({ error: 'active는 boolean이어야 합니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('badges')
    // @ts-expect-error Supabase 타입 추론 제한 우회
    .update({ deleted_at: active ? null : new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ badge: data })
}
