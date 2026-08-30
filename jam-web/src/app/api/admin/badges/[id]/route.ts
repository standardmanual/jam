import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { findCumulativeConditionError, findUnknownConditionKeyError } from '@/lib/admin/badge-validation'
import { invalidateUnclaimedDrops } from '@/lib/admin/poi-drops'
import type { BadgeRow } from '@/types/database'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  const supabase = createServiceClient()

  // 부분 body 병합을 위해 기존 row를 먼저 조회한다 — body에 없는(undefined) 필드는 기존 값을
  // 그대로 유지한다(20260827_011, factions·item_books PUT과 동일 패턴). 존재하지 않는 id면
  // update 시도 전에 404로 응답한다.
  const { data: existingData, error: fetchError } = await supabase
    .from('badges')
    .select('*')
    .eq('id', id)
    .single()
  if (fetchError || !existingData) return NextResponse.json({ error: '배지를 찾을 수 없습니다.' }, { status: 404 })
  const existing = existingData as BadgeRow

  // type·condition_json은 조건부 강제 null 로직(아래 update 참조)에서 함께 쓰이므로 먼저
  // 병합해둔다 — 병합된 값에 조건부 로직을 적용하는 것이지, 조건부 로직 자체를 단순 병합으로
  // 대체하는 게 아니다.
  const type = body.type !== undefined ? body.type : existing.type
  const conditionJson = body.condition_json !== undefined ? body.condition_json : existing.condition_json

  const cumulativeError = findCumulativeConditionError(type, conditionJson ?? null)
  if (cumulativeError) {
    return NextResponse.json({ error: cumulativeError }, { status: 400 })
  }

  const unknownConditionKeyError = findUnknownConditionKeyError(conditionJson ?? null)
  if (unknownConditionKeyError) {
    return NextResponse.json({ error: unknownConditionKeyError }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('badges')
    // @ts-expect-error Supabase 타입 추론 제한 우회
    .update({
      name: body.name !== undefined ? body.name : existing.name,
      description: body.description !== undefined ? body.description : existing.description,
      type,
      rarity: body.rarity !== undefined ? body.rarity : existing.rarity,
      image_url: body.image_url !== undefined ? body.image_url : existing.image_url,
      activity_types: body.activity_types !== undefined ? body.activity_types : existing.activity_types,
      patch_available: body.patch_available !== undefined ? body.patch_available : existing.patch_available,
      patch_price_krw: body.patch_price_krw !== undefined ? body.patch_price_krw : existing.patch_price_krw,
      // POI 배지는 "어느 POI를 지나갔는가"로만 판정 — 활동 조건이 섞이지 않도록 강제 null
      condition_json: type === 'checkin' ? null : conditionJson,
      // 체크인 배지에는 세계관/컬렉션 개념이 없다 — 저작 화면(BadgeForm)에서도 정리하지만
      // 서버에서도 같은 규칙을 강제한다(20260830_1344).
      faction_id: type === 'checkin' ? null : (body.faction_id !== undefined ? body.faction_id : existing.faction_id),
      item_book_id: type === 'checkin' ? null : (body.item_book_id !== undefined ? body.item_book_id : existing.item_book_id),
      // 배지 카테고리는 체크인 배지 전용(poi_categories.slug 재사용, 마이그레이션 113).
      category: type === 'checkin' ? (body.category !== undefined ? body.category : existing.category) : null,
      drop_weight: body.drop_weight !== undefined ? body.drop_weight : existing.drop_weight,
      valid_from: body.valid_from !== undefined ? body.valid_from : existing.valid_from,
      valid_until: body.valid_until !== undefined ? body.valid_until : existing.valid_until,
      point_reward:
        body.point_reward !== undefined
          ? Math.max(0, Math.trunc(Number(body.point_reward) || 0))
          : existing.point_reward,
      background_color: body.background_color !== undefined ? body.background_color : existing.background_color,
      background_shader_id:
        body.background_shader_id !== undefined ? body.background_shader_id : existing.background_shader_id,
      // 배경 3모드(단색 / 정적 제너레이터 / 애니메이션 제너레이터)는 상호 배타적이라 선택하지 않은
      // 쪽은 항상 null로 정리된다 — 정리 책임은 저작 화면(BadgeForm)에 있고, 여기서는 넘어온 값을
      // 그대로 반영한다(20260819_012). body에 없는(undefined) 부분 body는 기존 값을 유지한다
      // (20260827_011).
      background_image_url:
        body.background_image_url !== undefined ? body.background_image_url : existing.background_image_url,
      background_video_url:
        body.background_video_url !== undefined ? body.background_video_url : existing.background_video_url,
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

  // 존재 여부를 먼저 확인한다 — select 없이 바로 update만 실행하면 매칭 0건에도
  // Supabase가 에러를 주지 않아 존재하지 않는 id에도 조용히 성공 응답이 나갔다(20260827_012).
  const { data: existing, error: fetchError } = await supabase
    .from('badges')
    .select('id')
    .eq('id', id)
    .single()
  if (fetchError || !existing) {
    return NextResponse.json({ error: '배지를 찾을 수 없습니다.' }, { status: 404 })
  }

  const { error } = await supabase
    .from('badges')
    // @ts-expect-error Supabase 타입 추론 제한 우회
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await invalidateUnclaimedDrops(supabase, [id], 'admin badges DELETE')

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

  // update-후-select 구조라 존재하지 않는 id에도 update 자체(무매칭)는 실행되지만, select
  // 단계에서 실패한다 — 이 경우 raw 500 대신 404로 응답하고, 무효화 호출 이전에 반환해
  // invalidateUnclaimedDrops가 존재하지 않는 id에 대해 실행되지 않도록 한다(20260827_012).
  if (error || !data) {
    return NextResponse.json({ error: '배지를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 비활성화(active: false) 방향일 때만 미픽업 드랍을 함께 무효화한다. active: true로
  // 되살릴 때는 드랍을 자동 부활시키지 않는다 — 관리자가 명시적으로 새로 드랍해야 한다.
  if (!active) {
    await invalidateUnclaimedDrops(supabase, [id], 'admin badges PATCH')
  }

  return NextResponse.json({ badge: data })
}
