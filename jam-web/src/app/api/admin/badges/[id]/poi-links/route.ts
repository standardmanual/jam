import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { EXACT_MATCH_RADIUS_BY_CATEGORY } from '@/lib/poi/radius-policy'

/**
 * 배지 ⇄ POI 연결 관리 API.
 * 관계는 `poi.linked_badge_id`(다대일) 하나로만 표현한다 — 조인 테이블 없음.
 */

// 현재 이 배지에 연결된 POI 목록
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('poi')
    .select('*')
    .eq('linked_badge_id', id)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pois: data ?? [] })
}

// 이 배지에 연결할 POI 목록을 통째로 교체
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const poiIds: unknown = body?.poi_ids

  if (!Array.isArray(poiIds) || poiIds.some((v) => typeof v !== 'string' || !v)) {
    return NextResponse.json({ error: 'poi_ids는 문자열 배열이어야 합니다.' }, { status: 400 })
  }
  const nextIds = [...new Set(poiIds as string[])]

  const supabase = createServiceClient()

  // 1) 기존 연결 중 새 목록에 없는 것 → 해제
  const { data: currentRaw, error: currentError } = await supabase
    .from('poi')
    .select('id')
    .eq('linked_badge_id', id)
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 })

  const currentIds = ((currentRaw ?? []) as { id: string }[]).map((p) => p.id)
  const removedIds = currentIds.filter((pid) => !nextIds.includes(pid))

  if (removedIds.length > 0) {
    const { error } = await supabase
      .from('poi')
      // @ts-expect-error Supabase 타입 추론 제한 우회
      .update({ linked_badge_id: null })
      .in('id', removedIds)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 2) 새 목록 전체 → 이 배지로 연결(다른 배지에 걸려 있던 POI도 이 배지로 이동)
  if (nextIds.length > 0) {
    const { error } = await supabase
      .from('poi')
      // @ts-expect-error Supabase 타입 추론 제한 우회
      .update({ linked_badge_id: id })
      .in('id', nextIds)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // 배지에 연결되는 순간부터 "실제로 지나감"을 판정하는 근거가 되므로, 지도 표시용
    // 넓은 기본 반경(500m 등)이 그대로 남아있지 않도록 카테고리별 정확 매칭 반경을
    // 강제한다 (2026-08-11 지하철역 44개 500m 오탐 발급 인시던트 재발 방지, 20260811_006 참고).
    for (const [category, radiusMeters] of Object.entries(EXACT_MATCH_RADIUS_BY_CATEGORY)) {
      const { error: radiusError } = await supabase
        .from('poi')
        // @ts-expect-error Supabase 타입 추론 제한 우회
        .update({ radius_meters: radiusMeters })
        .in('id', nextIds)
        .eq('category', category)
        .neq('radius_meters', radiusMeters)
      if (radiusError) return NextResponse.json({ error: radiusError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, linked: nextIds.length, unlinked: removedIds.length })
}
