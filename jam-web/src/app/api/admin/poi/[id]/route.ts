import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { resolvePoiRadiusMeters } from '@/lib/poi/radius-policy'
import { POI_REFERENCE_SOURCES, collectPoiReferences } from '@/lib/admin/poi-references'

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
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ poi: data })
}

/**
 * 목록/상세 화면의 즉시 토글·일괄변경용 — 폼의 전체 저장 PUT과 별개(20260830_1619).
 * body: { is_active?: boolean, category?: string }. 최소 하나는 있어야 하며, 둘 다 와도
 * 동작한다(20260907_1643 — 다중선택 카테고리 일괄변경이 이 PATCH를 선택 항목마다 순차
 * 호출한다).
 * category가 오면 poi_categories에 존재하는 슬러그인지 검증하고, radius_meters도
 * resolvePoiRadiusMeters로 함께 재계산한다 — 안 하면 카테고리별 정확 매칭 반경 정책(예:
 * train_subway 50m)이 어긋나 기존 반경 그대로 남아 20260811_006 오탐 버그가 재발한다.
 * 재계산 기준값은 이 POI의 기존 radius_meters다(요청에 없는 값이라 먼저 조회해야 한다) —
 * 안 그러면 정확 매칭 정책이 없는 카테고리로 옮길 때 커스텀 반경이 기본값(500m)으로
 * 조용히 초기화된다.
 * item_books.is_active와 달리 POI는 연쇄 영향(드랍/체크인 로직 미연동)이 없어 확인 없이
 * 즉시 반영한다.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { is_active, category } = body as { is_active?: boolean; category?: string }

  if (is_active === undefined && category === undefined) {
    return NextResponse.json({ error: 'is_active 또는 category 중 하나는 필요합니다.' }, { status: 400 })
  }
  if (is_active !== undefined && typeof is_active !== 'boolean') {
    return NextResponse.json({ error: 'is_active는 boolean이어야 합니다.' }, { status: 400 })
  }
  if (category !== undefined && (typeof category !== 'string' || !category.trim())) {
    return NextResponse.json({ error: 'category는 비어 있지 않은 문자열이어야 합니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const updatePayload: { is_active?: boolean; category?: string; radius_meters?: number } = {}

  if (is_active !== undefined) updatePayload.is_active = is_active

  if (category !== undefined) {
    const { data: categoryRow, error: categoryError } = await supabase
      .from('poi_categories')
      .select('slug')
      .eq('slug', category)
      .maybeSingle()
    if (categoryError) return NextResponse.json({ error: categoryError.message }, { status: 500 })
    if (!categoryRow) {
      return NextResponse.json({ error: '존재하지 않는 카테고리입니다.' }, { status: 400 })
    }

    const { data: existing, error: existingError } = await supabase
      .from('poi')
      .select('radius_meters')
      .eq('id', id)
      .maybeSingle()
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
    if (!existing) return NextResponse.json({ error: 'POI를 찾을 수 없습니다.' }, { status: 404 })

    updatePayload.category = category
    updatePayload.radius_meters = resolvePoiRadiusMeters(category, existing.radius_meters)
  }

  const { data, error } = await supabase
    .from('poi')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ poi: data })
}

/**
 * 하드 삭제 — 참조 카운트 체크 없이 바로 삭제하면 `user_activity_badges.triggered_by_poi_id`
 * (ON DELETE NO ACTION)가 있는 POI에서 raw Postgres 에러가 500으로 그대로 노출되고,
 * `poi_drops`·`user_checkin_badge_earns`·`poi_blocks`·`poi_views`·`custody_events`
 * (CASCADE/SET NULL)가 있는 POI는 조용히 유저 기록·감사 이력이 사라진다(티켓 20260907_1138,
 * `badges`의 `point_transactions.source_badge_id` 사고와 같은 패턴). 참조 카운트는
 * `lib/admin/poi-references.ts` 한 곳이 단일 출처다 — 단건·일괄(순차 호출) 양쪽 다 이
 * 라우트 하나만 거치므로 여기 한 곳만 가드하면 된다.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()

  const { data: existing, error: fetchError } = await supabase.from('poi').select('id').eq('id', id).single()
  if (fetchError || !existing) {
    return NextResponse.json({ error: 'POI를 찾을 수 없습니다.' }, { status: 404 })
  }

  const references = await collectPoiReferences(supabase, [id])

  // fail-closed: 조회 자체가 실패하면 부분 카운트로 "참조 0건"을 오판하지 않도록 삭제를 막는다.
  if (references.error) {
    console.error('[poi DELETE] 참조 카운트 조회 실패 — 하드 삭제를 차단합니다:', references.error)
    return NextResponse.json(
      { error: '삭제할 수 없습니다. 이력 조회 중 오류가 발생했어요. 다시 시도해도 같으면 개발자에게 전달해 주세요.' },
      { status: 500 }
    )
  }

  if (references.total > 0) {
    const hitLabels = POI_REFERENCE_SOURCES.filter((s) => references.counts[s.key] > 0)
      .map((s) => `${s.label} ${references.counts[s.key]}건`)
      .join(', ')
    console.error(`[poi DELETE] 참조가 있어 하드 삭제를 차단합니다 (poi=${id}): ${hitLabels}`)
    return NextResponse.json(
      {
        error: `삭제할 수 없습니다. 이미 ${references.total}건의 드랍·체크인·조회 이력이 있는 POI입니다(${hitLabels}). 비활성화를 이용해주세요.`,
      },
      { status: 409 }
    )
  }

  const { error } = await supabase.from('poi').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
