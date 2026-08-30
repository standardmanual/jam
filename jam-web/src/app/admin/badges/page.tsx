import { createServiceClient } from '@/lib/supabase/server'
import { Suspense } from 'react'
import Link from 'next/link'
import { Button } from '@/components/admin/ui/button'
import type { BadgeType, BadgeRarity, FactionRow, ItemBookRow, PoiCategoryRow } from '@/types/database'
import BadgeList, { type BadgeListRow } from '@/components/admin/badges/BadgeList'
import BadgesFilterBar from './BadgesFilterBar'
import Pagination from '../poi/Pagination'
import { UNASSIGNED_POI_CATEGORY } from '@/lib/admin/badge-labels'

const PAGE_SIZE = 50

// PostgREST 기본 응답 상한(1000행) 대응 페이지네이션 크기. "미할당" 지점 카테고리 필터
// (티켓 20260830_1510)를 계산하려면 체크인 배지 id 전체(1800건대)와 지점이 연결된 배지
// id 전체(1796건대, 2026-08-30 기준)를 모두 훑어야 하는데, 둘 다 1000행을 넘어 한 번에
// 못 가져온다. 이 두 집합의 차집합(미할당 배지)만 작으므로, 큰 집합을 페이지네이션으로
// 온전히 가져와 서버 메모리에서 차집합을 구한 뒤 그 작은 결과만 `.in()`에 넘긴다 — 반대로
// "지점이 연결된 배지"(큰 집합, 최대 1796건)를 `.not('id','in',...)`에 통째로 넘기면
// URL이 절단될 위험이 있다(티켓 20260825_035).
const FETCH_ALL_PAGE_SIZE = 1000

type RangeQuery<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>

async function fetchAllRows<T>(query: RangeQuery<T>): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await query(from, from + FETCH_ALL_PAGE_SIZE - 1)
    if (error) {
      console.error('[admin/badges] 미할당 지점 카테고리 계산용 전체 조회 오류:', error)
      break
    }
    const page = data ?? []
    rows.push(...page)
    if (page.length < FETCH_ALL_PAGE_SIZE) break
    from += FETCH_ALL_PAGE_SIZE
  }
  return rows
}

interface AdminBadgesPageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function AdminBadgesPage({ searchParams }: AdminBadgesPageProps) {
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)
  const filterType = params.type as BadgeType | undefined
  const filterRarity = params.rarity as BadgeRarity | undefined
  const filterActivityType = params.activity_type
  const filterPoiCategory = params.poi_category
  const filterFactionId = params.faction_id
  const filterItemBookId = params.item_book_id
  const status = params.status === 'inactive' || params.status === 'all' ? params.status : 'active'
  const sortBy = params.sort ?? 'created_desc'
  const q = params.q?.trim() ?? ''

  const supabase = createServiceClient()

  // 목록(카드/테이블)에 실제로 쓰는 컬럼만 select — condition_json 이외의 나머지 상세화면 전용
  // 필드(drop_weight, valid_from/until, background_* 등)는 목록에 불필요하다(20260826_011 A8).
  const BADGE_LIST_COLUMNS =
    'id, name, description, type, rarity, image_url, condition_json, activity_types, patch_available, patch_price_krw, faction_id, deleted_at'

  // 지점 카테고리 필터: 체크인 배지에는 카테고리 컬럼이 없고, 연결된 지점(poi.category)으로만 분류된다.
  // 배지 id를 먼저 모아 .in()으로 거르면 한 카테고리가 900개를 넘을 때 URL이 수십 KB가 되므로
  // FK(poi.linked_badge_id → badges.id)를 통한 inner join으로 DB에서 직접 필터한다.
  // "미할당"(연결된 지점이 하나도 없는 배지, 티켓 20260830_1510)은 이 inner join으로는 표현할 수
  // 없는 안티조인이라 별도 분기로 처리한다 — poi.category처럼 실제 카테고리 값이 아니므로 제외.
  const isUnassignedPoiFilter = filterType === 'checkin' && filterPoiCategory === UNASSIGNED_POI_CATEGORY
  const filterByPoiCategory = filterType === 'checkin' && !!filterPoiCategory && !isUnassignedPoiFilter
  const selectClause = filterByPoiCategory
    ? `${BADGE_LIST_COLUMNS}, poi!poi_linked_badge_id_fkey!inner(category)`
    : BADGE_LIST_COLUMNS

  // "미할당" 필터: 체크인 배지 id 전체 - 지점이 연결된 배지 id 전체(둘 다 페이지네이션으로
  // 완전히 조회) 차집합을 서버 메모리에서 구해 작은 결과만 메인 쿼리에 `.in()`으로 넘긴다.
  let unassignedBadgeIds: string[] = []
  if (isUnassignedPoiFilter) {
    const [checkinBadgeRows, linkedPoiRows] = await Promise.all([
      fetchAllRows<{ id: string }>((from, to) =>
        supabase.from('badges').select('id').eq('type', 'checkin').order('id').range(from, to)
      ),
      fetchAllRows<{ linked_badge_id: string }>((from, to) =>
        supabase
          .from('poi')
          .select('linked_badge_id')
          .not('linked_badge_id', 'is', null)
          .order('linked_badge_id')
          .range(from, to)
      ),
    ])
    const linkedBadgeIdSet = new Set(linkedPoiRows.map((r) => r.linked_badge_id))
    unassignedBadgeIds = checkinBadgeRows.map((r) => r.id).filter((id) => !linkedBadgeIdSet.has(id))
  }

  let query = supabase
    .from('badges')
    .select(selectClause, { count: 'exact' })

  if (status === 'active') query = query.is('deleted_at', null)
  else if (status === 'inactive') query = query.not('deleted_at', 'is', null)
  // status === 'all' → 필터 없음

  if (filterType) query = query.eq('type', filterType)
  if (filterRarity) query = query.eq('rarity', filterRarity)
  if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`)

  if (filterActivityType) query = query.contains('activity_types', [filterActivityType])
  if (filterFactionId) query = query.eq('faction_id', filterFactionId)
  if (filterItemBookId) query = query.eq('item_book_id', filterItemBookId)
  if (filterByPoiCategory) query = query.eq('poi.category', filterPoiCategory)
  if (isUnassignedPoiFilter) {
    // 빈 배열을 그대로 .in()에 넘기면 PostgREST 문법상 위험하므로(티켓 20260825_035와 동일한
    // 이유로 combine/index.ts 200행이 쓰는 것과 같은 안전장치) 존재할 수 없는 id로 대체해
    // "결과 없음"을 안전하게 강제한다.
    query = query.in('id', unassignedBadgeIds.length > 0 ? unassignedBadgeIds : ['00000000-0000-0000-0000-000000000000'])
  }

  switch (sortBy) {
    case 'name_asc': query = query.order('name', { ascending: true }); break
    case 'name_desc': query = query.order('name', { ascending: false }); break
    case 'created_asc': query = query.order('created_at', { ascending: true }); break
    default: query = query.order('created_at', { ascending: false })
  }

  const from = (page - 1) * PAGE_SIZE
  query = query.range(from, from + PAGE_SIZE - 1)

  const [
    { data: badgesRaw, count },
    { data: factionsRaw },
    { data: itemBooksRaw },
    { data: poiCategoriesRaw },
  ] = await Promise.all([
    query,
    supabase.from('factions').select('id, name').order('name'),
    supabase.from('item_books').select('id, name, faction_id').order('name'),
    supabase.from('poi_categories').select('slug, label').order('label'),
  ])

  // 조인으로 필터한 경우 행에 poi 관계가 딸려오므로 배지 필드만 남긴다
  const badges = ((badgesRaw ?? []) as (BadgeListRow & { poi?: unknown })[]).map(({ poi: _poi, ...badge }) => badge as BadgeListRow)
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const factionMap = new Map(
    ((factionsRaw ?? []) as Pick<FactionRow, 'id' | 'name'>[]).map((f) => [f.id, f.name])
  )
  const factions = (factionsRaw ?? []) as Pick<FactionRow, 'id' | 'name'>[]
  const itemBooks = (itemBooksRaw ?? []) as Pick<ItemBookRow, 'id' | 'name' | 'faction_id'>[]
  const poiCategories = (poiCategoriesRaw ?? []) as Pick<PoiCategoryRow, 'slug' | 'label'>[]

  const hasFilter = !!(q || filterType || filterRarity || filterActivityType || filterPoiCategory || filterFactionId || filterItemBookId || status !== 'active')

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">배지 관리</h1>
        <Link href="/admin/badges/new" className="w-full md:w-auto">
          <Button className="w-full md:w-auto h-11 md:h-10">+ 새 배지</Button>
        </Link>
      </div>

      {/* 필터 */}
      <Suspense>
        <BadgesFilterBar
          factions={factions}
          itemBooks={itemBooks}
          poiCategories={poiCategories}
        />
      </Suspense>

      {/* 카운트 */}
      <div className="text-sm text-muted-foreground">
        총 {total}개
        {hasFilter && ' (필터 적용 중)'}
      </div>

      {/* 목록 — 데스크탑 테이블(BadgesTable.tsx)이 정렬 상태를 URL과 동기화하려고
          useSearchParams()를 쓴다(20260826_014). BadgesFilterBar와 같은 이유로 Suspense로 감싼다. */}
      <Suspense>
        <BadgeList badges={badges} factionMap={factionMap} />
      </Suspense>

      {/* 페이지네이션 */}
      <Pagination page={page} totalPages={totalPages} searchParams={params} basePath="/admin/badges" />
    </div>
  )
}
