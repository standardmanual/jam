import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { findBadgeImageDesign } from '@/lib/admin/badgeImageDesigns'

/**
 * 체크인 배지 이미지 생성 — 단건 검색 API (티켓 20260830_1349).
 *
 * `20260830_1252`의 배치 생성 dataSource는 `poi` 조인에 전적으로 의존해서, POI 연결이 없는
 * 체크인 배지(석촌역 9호선 등 3개)가 조회 자체에서 누락됐다. 이 검색은 **badges 테이블을
 * 기준으로 이름 검색**하고, 카테고리 필터는 poi 조인으로 "보조"만 한다 — 조인이 없어도
 * 이름 검색으로는 항상 찾을 수 있어야 한다.
 *
 * - q: 배지 이름 또는 연결된 POI 이름 키워드 (둘 중 하나만 매칭돼도 결과에 포함)
 * - designId: BADGE_IMAGE_DESIGNS 화이트리스트 중 하나. 지정하면 그 디자인의
 *   poiCategories에 속한 poi.category로 연결된 배지만 대상으로 좁힌다.
 * - q, designId 둘 다 없으면 빈 결과를 반환한다(전체 체크인 배지를 무필터로 덤프하지 않음).
 */

const MAX_LOOKUP = 500 // name/category 매칭 단계에서 내부적으로 다루는 상한(무한 확장 방지)
const MAX_RESULTS = 50 // 최종 응답에 담는 상한

interface BadgeRow {
  id: string
  name: string
  image_url: string | null
}

interface PoiJoinRow {
  linked_badge_id: string
  name: string
  category: string | null
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const rawQuery = typeof body?.q === 'string' ? body.q : ''
  // PostgREST 필터 문법(쉼표/괄호)과 LIKE 와일드카드를 깨뜨리는 문자는 제거 (badges/search와 동일 패턴)
  const q = rawQuery.replace(/[,()%_*\\]/g, ' ').trim()
  const designId = typeof body?.designId === 'string' && body.designId ? body.designId : null

  let poiCategories: string[] | null = null
  if (designId) {
    const design = findBadgeImageDesign(designId)
    if (!design) {
      return NextResponse.json({ error: '알 수 없는 디자인입니다.' }, { status: 400 })
    }
    poiCategories = design.poiCategories
  }

  if (!q && !poiCategories) {
    return NextResponse.json({ badges: [] })
  }

  const supabase = createServiceClient()

  // 카테고리 필터(poi 조인 보조) — 지정된 경우 이 category 집합에 연결된 badge id만 남긴다.
  let categoryMatchIds: Set<string> | null = null
  const poiInfoById = new Map<string, PoiJoinRow>()
  if (poiCategories) {
    const { data, error } = await supabase
      .from('poi')
      .select('linked_badge_id, name, category')
      .in('category', poiCategories)
      .not('linked_badge_id', 'is', null)
      .order('name')
      .limit(MAX_LOOKUP)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    categoryMatchIds = new Set()
    for (const row of (data ?? []) as PoiJoinRow[]) {
      categoryMatchIds.add(row.linked_badge_id)
      poiInfoById.set(row.linked_badge_id, row)
    }
  }

  // 이름 검색 — badges.name과 연결된 poi.name 둘 다 대상. badges 기준 검색은 poi 연결 여부와
  // 무관하게 항상 동작해야 한다(20260830_1252 누락 사고 재발 방지).
  let nameMatchIds: Set<string> | null = null
  if (q) {
    const { data: badgeNameRows, error: badgeNameErr } = await supabase
      .from('badges')
      .select('id')
      .eq('type', 'checkin')
      .is('deleted_at', null)
      .ilike('name', `%${q}%`)
      .limit(MAX_LOOKUP)
    if (badgeNameErr) return NextResponse.json({ error: badgeNameErr.message }, { status: 500 })

    const { data: poiNameRows, error: poiNameErr } = await supabase
      .from('poi')
      .select('linked_badge_id, name, category')
      .not('linked_badge_id', 'is', null)
      .ilike('name', `%${q}%`)
      .limit(MAX_LOOKUP)
    if (poiNameErr) return NextResponse.json({ error: poiNameErr.message }, { status: 500 })

    nameMatchIds = new Set<string>()
    for (const row of (badgeNameRows ?? []) as { id: string }[]) nameMatchIds.add(row.id)
    for (const row of (poiNameRows ?? []) as PoiJoinRow[]) {
      nameMatchIds.add(row.linked_badge_id)
      if (!poiInfoById.has(row.linked_badge_id)) poiInfoById.set(row.linked_badge_id, row)
    }
  }

  let finalIds: string[]
  if (nameMatchIds && categoryMatchIds) {
    finalIds = [...nameMatchIds].filter((id) => categoryMatchIds!.has(id))
  } else if (nameMatchIds) {
    finalIds = [...nameMatchIds]
  } else {
    finalIds = [...categoryMatchIds!]
  }

  if (finalIds.length === 0) {
    return NextResponse.json({ badges: [] })
  }

  const { data: badges, error: badgesErr } = await supabase
    .from('badges')
    .select('id, name, image_url')
    .eq('type', 'checkin')
    .is('deleted_at', null)
    .in('id', finalIds.slice(0, MAX_LOOKUP))
    .order('name')
    .limit(MAX_RESULTS)
  if (badgesErr) return NextResponse.json({ error: badgesErr.message }, { status: 500 })

  const results = (badges ?? []).map((b: BadgeRow) => {
    const poiInfo = poiInfoById.get(b.id)
    return {
      id: b.id,
      name: b.name,
      hasImage: Boolean(b.image_url),
      poiName: poiInfo?.name ?? null,
      poiCategory: poiInfo?.category ?? null,
    }
  })

  return NextResponse.json({ badges: results, truncated: finalIds.length > MAX_RESULTS })
}
