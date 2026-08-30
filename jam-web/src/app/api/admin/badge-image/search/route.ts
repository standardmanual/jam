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
 *
 * **게이트 리뷰 1차 FAIL 수정(재설계)**: 이전 구현은 카테고리 필터만으로 검색할 때 poi 조인으로
 * badge id를 먼저 최대 500개 모은 뒤 `badges.in('id', [...500개 UUID])`로 통째로 넘겼다.
 * 실제 MOUNTAIN(847건)·METRO(948건) 규모에서 이 URL이 19,000자를 넘어 HeadersOverflowError로
 * 검색 자체가 실패했다. `src/app/admin/badges/page.tsx`(카테고리 필터 있는 체크인 배지 목록)가
 * 이미 같은 문제를 FK 임베디드 inner join(`poi!poi_linked_badge_id_fkey!inner`)으로 해결해둔
 * 전례가 있어 동일 패턴을 재사용한다 — badge id 리스트를 애플리케이션에서 조립해 `.in()`으로
 * 넘기지 않고, DB 쿼리 자체에서 category로 직접 필터한다(카테고리만 있는 경우 `.in()` 호출이
 * 전혀 없다). q(이름 검색)가 있는 경로도 모든 `.in()` 호출을 최종 응답 상한(MAX_RESULTS=50)
 * 이하로만 구성해 동일한 오버플로가 재발하지 않도록 했다 — PostgREST가 `or=()` 필터에서
 * 임베디드 리소스 컬럼(`poi.name`)과 최상위 컬럼(`name`)을 한 논리식으로 묶는 것을 지원하지
 * 않아(PGRST100 확인됨) badges.name 매칭과 poi.name 매칭을 별도 쿼리로 나눠 병합한다.
 */

const MAX_RESULTS = 50 // 최종 응답에 담는 상한 — 모든 .in() 호출도 이 상한 이하로만 구성한다

interface PoiEmbed {
  name: string
  category: string | null
}

interface BadgeWithPoiRow {
  id: string
  name: string
  image_url: string | null
  poi?: PoiEmbed[] | PoiEmbed | null
}

interface PoiRow {
  linked_badge_id: string
  name: string
  category: string | null
}

interface ResultBadge {
  id: string
  name: string
  hasImage: boolean
  poiName: string | null
  poiCategory: string | null
}

function firstPoi(poi: BadgeWithPoiRow['poi']): PoiEmbed | null {
  if (!poi) return null
  return Array.isArray(poi) ? (poi[0] ?? null) : poi
}

function toResult(row: BadgeWithPoiRow, poiOverride?: PoiRow | null): ResultBadge {
  const embedded = firstPoi(row.poi)
  return {
    id: row.id,
    name: row.name,
    hasImage: Boolean(row.image_url),
    poiName: poiOverride?.name ?? embedded?.name ?? null,
    poiCategory: poiOverride?.category ?? embedded?.category ?? null,
  }
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

  // 카테고리 필터만 있고 검색어가 없는 경우: badge id 리스트를 조립하지 않고, poi FK 임베디드
  // inner join으로 DB에서 직접 필터한다. .in()으로 badge id를 넘기는 단계 자체가 없어 대상이
  // 몇 백~몇 천 건이어도 URL 길이 문제가 생기지 않는다.
  if (poiCategories && !q) {
    const { data, error, count } = await supabase
      .from('badges')
      .select('id, name, image_url, poi!poi_linked_badge_id_fkey!inner(name, category)', {
        count: 'exact',
      })
      .eq('type', 'checkin')
      .is('deleted_at', null)
      .in('poi.category', poiCategories)
      .order('name')
      .limit(MAX_RESULTS)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const results = ((data ?? []) as unknown as BadgeWithPoiRow[]).map((row) => toResult(row))
    return NextResponse.json({ badges: results, truncated: (count ?? 0) > MAX_RESULTS })
  }

  // 검색어(q)가 있는 경로 — badges.name 매칭과 poi.name 매칭을 별도 쿼리로 조회한 뒤 병합한다.
  // (PostgREST or=()는 임베디드 리소스 컬럼과 최상위 컬럼을 한 논리식으로 묶을 수 없어 분리했다.)
  // 두 쿼리 모두 limit(MAX_RESULTS)로 상한을 두므로, 이어지는 보조 조회의 .in() 대상도 항상
  // MAX_RESULTS 이하로만 구성된다.

  // 1) badges.name ILIKE q (+ 카테고리 필터가 있으면 poi inner join으로 함께 좁힘)
  let byNameQuery = supabase
    .from('badges')
    .select(
      poiCategories
        ? 'id, name, image_url, poi!poi_linked_badge_id_fkey!inner(name, category)'
        : 'id, name, image_url'
    )
    .eq('type', 'checkin')
    .is('deleted_at', null)
    .ilike('name', `%${q}%`)
  if (poiCategories) byNameQuery = byNameQuery.in('poi.category', poiCategories)
  byNameQuery = byNameQuery.order('name').limit(MAX_RESULTS)

  // 2) poi.name ILIKE q (+ 카테고리 필터) → 연결된 배지 id (최대 MAX_RESULTS개, 소량이라 안전)
  let byPoiNameQuery = supabase
    .from('poi')
    .select('linked_badge_id, name, category')
    .not('linked_badge_id', 'is', null)
    .ilike('name', `%${q}%`)
  if (poiCategories) byPoiNameQuery = byPoiNameQuery.in('category', poiCategories)
  byPoiNameQuery = byPoiNameQuery.order('name').limit(MAX_RESULTS)

  const [byNameRes, byPoiNameRes] = await Promise.all([byNameQuery, byPoiNameQuery])
  if (byNameRes.error) return NextResponse.json({ error: byNameRes.error.message }, { status: 500 })
  if (byPoiNameRes.error)
    return NextResponse.json({ error: byPoiNameRes.error.message }, { status: 500 })

  const byNameRows = (byNameRes.data ?? []) as unknown as BadgeWithPoiRow[]
  const poiMatches = (byPoiNameRes.data ?? []) as PoiRow[]

  const merged = new Map<string, ResultBadge>()
  for (const row of byNameRows) merged.set(row.id, toResult(row))

  // poi.name으로만 매칭되고 badges.name 매칭에는 없던 id만 보조 조회한다(최대 MAX_RESULTS개).
  const extraIds = poiMatches.map((p) => p.linked_badge_id).filter((id) => !merged.has(id))
  if (extraIds.length > 0) {
    const { data: extraBadges, error: extraErr } = await supabase
      .from('badges')
      .select('id, name, image_url')
      .eq('type', 'checkin')
      .is('deleted_at', null)
      .in('id', extraIds) // extraIds는 poiMatches(limit MAX_RESULTS)에서 파생 — 최대 50개, 안전
    if (extraErr) return NextResponse.json({ error: extraErr.message }, { status: 500 })

    const poiInfoById = new Map(poiMatches.map((p) => [p.linked_badge_id, p]))
    for (const row of (extraBadges ?? []) as { id: string; name: string; image_url: string | null }[]) {
      merged.set(row.id, toResult(row, poiInfoById.get(row.id) ?? null))
    }
  }

  const truncated = byNameRows.length >= MAX_RESULTS || poiMatches.length >= MAX_RESULTS
  const results = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko')).slice(0, MAX_RESULTS)

  return NextResponse.json({ badges: results, truncated })
}
