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
 * 하드 삭제 — 이력이 전혀 없는 배지만 badges 행 자체를 실제로 DELETE한다(20260830_1912).
 * 과거에는 이 엔드포인트도 deleted_at만 세팅하는 소프트 삭제였는데, PATCH(비활성화 토글)와
 * 완전히 동일한 동작이라 "삭제" 버튼을 눌러도 이미 비활성 상태면 아무 변화가 없어 보이는
 * 문제가 있었다(20260830_1912 신고).
 *
 * 아래 6개 테이블 중 하나라도 이 배지를 참조하면 하드 삭제를 차단한다:
 * - user_activity_badges/inventory_items/poi_drops.badge_id: NOT NULL + ON DELETE NO ACTION
 *   → 참조가 있으면 하드 삭제 시 FK 위반으로 그냥 실패한다.
 * - user_checkin_badge_earns/user_item_book_slots.badge_id: NOT NULL + ON DELETE CASCADE
 *   → 참조가 있는데 강행하면 FK 위반 없이 유저의 체크인 획득 기록·아이템북 슬롯 진행 기록이
 *     조용히 통째로 사라진다. 절대 강행해서는 안 된다.
 * - poi.linked_badge_id: nullable이지만 ON DELETE NO ACTION → 참조가 있으면 실패한다.
 * 이력 보존형 강제 삭제(위 FK를 nullable + ON DELETE SET NULL로 바꾸는 스키마 마이그레이션)는
 * 이번 범위 밖이다 — 이력이 하나라도 있으면 차단하고 비활성화 사용을 안내한다.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()

  // 존재 여부를 먼저 확인한다 — select 없이 바로 update/delete만 실행하면 매칭 0건에도
  // Supabase가 에러를 주지 않아 존재하지 않는 id에도 조용히 성공 응답이 나갔다(20260827_012).
  const { data: existing, error: fetchError } = await supabase
    .from('badges')
    .select('id')
    .eq('id', id)
    .single()
  if (fetchError || !existing) {
    return NextResponse.json({ error: '배지를 찾을 수 없습니다.' }, { status: 404 })
  }

  const referenceQueries = await Promise.all([
    supabase.from('user_activity_badges').select('*', { count: 'exact', head: true }).eq('badge_id', id),
    supabase.from('inventory_items').select('*', { count: 'exact', head: true }).eq('badge_id', id),
    supabase.from('poi_drops').select('*', { count: 'exact', head: true }).eq('badge_id', id),
    supabase.from('user_checkin_badge_earns').select('*', { count: 'exact', head: true }).eq('badge_id', id),
    supabase.from('user_item_book_slots').select('*', { count: 'exact', head: true }).eq('badge_id', id),
    supabase.from('poi').select('*', { count: 'exact', head: true }).eq('linked_badge_id', id),
  ])

  // 6곳 중 하나라도 error면 fail-closed로 하드 삭제를 막는다. user_checkin_badge_earns·
  // user_item_book_slots는 ON DELETE CASCADE라, 카운트 조회가 실패했는데 count만 null→0으로
  // 넘기면 실제 이력이 있어도 0건으로 오판해 하드 삭제가 강행되고 유저의 체크인 획득 기록·
  // 아이템북 슬롯 진행 기록이 조용히 사라진다 — 이 엔드포인트가 막으려던 시나리오 그 자체다.
  const failedQuery = referenceQueries.find((r) => r.error)
  if (failedQuery) {
    console.error('[badges DELETE] 참조 카운트 조회 실패 — 하드 삭제를 차단합니다:', failedQuery.error)
    return NextResponse.json(
      { error: '삭제할 수 없습니다. 이력 조회 중 오류가 발생했어요. 다시 시도해도 같으면 개발자에게 전달해 주세요.' },
      { status: 500 }
    )
  }

  const totalReferences = referenceQueries.reduce((sum, r) => sum + (r.count ?? 0), 0)

  // 이력이 하나라도 있으면 하드 삭제를 차단한다. [현상]→[원인]→[해결책] 3단계 구조로 안내한다
  // (UX_WRITING_GUIDELINE.md) — 기존 소프트 삭제로 되돌리지 않고 명확히 실패시킨다.
  if (totalReferences > 0) {
    return NextResponse.json(
      {
        error: `삭제할 수 없습니다. 이미 ${totalReferences}건의 발급·드랍·지점 연결 이력이 있는 배지입니다. 비활성화를 이용해주세요.`,
      },
      { status: 409 }
    )
  }

  const { error } = await supabase.from('badges').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 이력 0건 조건에 poi_drops도 포함돼 있어 여기 도달했다면 무효화할 미픽업 드랍은 사실상
  // 없지만, 방어적으로 유지한다(20260830_1912) — 호출 자체는 badgeIds가 매칭되지 않으면
  // no-op이라 비용이 거의 없다.
  await invalidateUnclaimedDrops(supabase, [id], 'admin badges DELETE')

  return NextResponse.json({ ok: true })
}

/**
 * 목록/상세 화면의 즉시 토글용(20260823_006). body: { active: boolean }.
 * active: false → deleted_at = now() (소프트 삭제 — 가역적). active: true → deleted_at = null
 * (되살리기).
 * DELETE 핸들러와는 별개의 동작이다(20260830_1912부터) — DELETE는 이력 없는 배지만 실제
 * 하드 삭제하고, 이력이 있으면 차단한다. 이 PATCH는 이력 유무와 무관하게 항상 소프트
 * 삭제/복원만 수행하는 가역적 토글로 그대로 유지한다.
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
