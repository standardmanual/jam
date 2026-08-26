import { createServiceClient } from '@/lib/supabase/server'
import { Suspense } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/shadcn-button'
import type { BadgeType, BadgeRarity, FactionRow, ItemBookRow, PoiCategoryRow } from '@/types/database'
import BadgeList, { type BadgeListRow } from '@/components/admin/badges/BadgeList'
import BadgesFilterBar from './BadgesFilterBar'
import Pagination from '../poi/Pagination'

const PAGE_SIZE = 50

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
  const filterByPoiCategory = filterType === 'checkin' && !!filterPoiCategory
  const selectClause = filterByPoiCategory
    ? `${BADGE_LIST_COLUMNS}, poi!poi_linked_badge_id_fkey!inner(category)`
    : BADGE_LIST_COLUMNS

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

      {/* 목록 */}
      <BadgeList badges={badges} factionMap={factionMap} />

      {/* 페이지네이션 */}
      <Pagination page={page} totalPages={totalPages} searchParams={params} basePath="/admin/badges" />
    </div>
  )
}
