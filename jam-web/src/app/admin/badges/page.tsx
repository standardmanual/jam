import { createServiceClient } from '@/lib/supabase/server'
import { Suspense } from 'react'
import Link from 'next/link'
import { Button } from '@/components/admin/ui/button'
import type { BadgeType, BadgeRarity, FactionRow, ItemBookRow, PoiCategoryRow } from '@/types/database'
import BadgeList, { type BadgeListRow } from '@/components/admin/badges/BadgeList'
import type { Json } from '@/types/database.generated'
import BadgesFilterBar from './BadgesFilterBar'
import Pagination from '../poi/Pagination'
import { UNASSIGNED_POI_CATEGORY } from '@/lib/admin/badge-labels'
import {
  badgeUsesConditionField,
  compareBadgeListRows,
  parseBadgeListSort,
  parseConditionFieldFilter,
  requiresFullFetchSort,
  type BadgeListSortRow,
} from '@/lib/admin/badge-list-view'

const PAGE_SIZE = 50

// PostgREST 기본 응답 상한(1000행) 대응 페이지네이션 크기. 체크인 배지 카테고리 필터
// ("미할당" 포함, 티켓 20260830_1510·20260830_1522)를 계산하려면 체크인 배지 id 전체
// (1800건대)와 지점이 연결된 배지 id 전체(1796건대, 2026-08-30 기준)를 모두 훑어야 하는데,
// 둘 다 1000행을 넘어 한 번에 못 가져온다. 이 크기로 나눠 완전히 조회한 뒤 서버 메모리에서
// 유효 카테고리를 계산한다 — 매칭된 id 목록을 그대로 `.in()`에 넘기면 카테고리 하나가
// 900개를 넘을 때 URL이 절단될 위험이 있다(티켓 20260825_035).
const FETCH_ALL_PAGE_SIZE = 1000

type RangeQuery<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>

async function fetchAllRows<T>(query: RangeQuery<T>): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await query(from, from + FETCH_ALL_PAGE_SIZE - 1)
    if (error) {
      // 쓰는 곳이 둘이다 — 체크인 배지 카테고리 계산, 계열순·레벨순 정렬용 전량 조회.
      console.error('[admin/badges] 목록 전체 조회 오류(부분 목록으로 이어감):', error)
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
  // 정렬 값·조건 필드 키는 각각 목록 정렬 규칙·조건 레지스트리에서만 나온다(티켓 20260905_0032 C-2).
  // 조건 필드 키는 아래에서 jsonb 경로(`condition_json->>키`)로 들어가므로 임의 문자열을 통과시키지 않는다.
  const sortBy = parseBadgeListSort(params.sort)
  const filterConditionField = parseConditionFieldFilter(params.condition_field)
  const q = params.q?.trim() ?? ''

  const supabase = createServiceClient()

  // 목록(카드/테이블)에 실제로 쓰는 컬럼만 select — condition_json 이외의 나머지 상세화면 전용
  // 필드(drop_weight, valid_from/until, background_* 등)는 목록에 불필요하다(20260826_011 A8).
  const BADGE_LIST_COLUMNS =
    'id, name, description, type, rarity, image_url, condition_json, activity_types, patch_available, patch_price_krw, faction_id, deleted_at'

  // 계열순·레벨순은 DB가 정렬할 수 없어(「sort_order = 0은 맨 뒤」·계열 키 폴백) 메모리에서
  // 비교한다 — 그 비교에 필요한 컬럼만 더 가져온다(티켓 20260905_0032 C-2).
  const BADGE_SORT_COLUMNS = 'level, family_key, sort_order, created_at'

  // 지점 카테고리 필터: 체크인 배지의 실제 분류 기준은 badges.category(어드민이 배지에 직접
  // 지정한 값)를 우선하고, 값이 없으면(null) 연결된 지점의 poi.category로 폴백한다
  // (티켓 20260830_1522 — 이전에는 badges.category가 어디서도 읽히지 않아 어드민에서
  // 카테고리를 바꿔도 목록 분류가 그대로였다). "미할당"(연결된 지점도, badges.category도
  // 없는 배지, 티켓 20260830_1510)도 같은 유효 카테고리 계산 결과가 null인 경우로 판정한다.
  //
  // badges.category는 연결된 poi 없이도 값을 가질 수 있어 DB 조인 하나로 두 값을 합성할 수
  // 없다. 그렇다고 매칭된 id 목록을 그대로 `.in()`에 넘기면 카테고리 하나가 900개를 넘을 때
  // URL이 수십 KB가 되는 문제(티켓 20260825_035)가 재발한다 — 실제로 "역"으로 끝나는 POI만
  // 900건대다. 그래서 이 필터가 걸리면 체크인 배지 전체(1800건대, 페이지네이션으로 안전하게
  // 완전 조회 가능한 규모)와 연결된 poi 전체를 통째로 가져와 메모리에서 유효 카테고리를
  // 계산하고, 나머지 필터·정렬·페이지네이션까지 이 분기 안에서 전부 처리한다.
  const isUnassignedPoiFilter = filterType === 'checkin' && filterPoiCategory === UNASSIGNED_POI_CATEGORY
  const filterByCheckinCategory = filterType === 'checkin' && !!filterPoiCategory

  let badges: BadgeListRow[]
  let total: number

  if (filterByCheckinCategory) {
    // badges.activity_types(text[])·condition_json(jsonb)은 DB 타입이 각각 string[]·Json이라
    // 도메인 좁힘 타입(ActivityType[]·BadgeCondition|null)으로 바로 받을 수 없다. 조회는 DB
    // 형태로 받고 BadgeListRow로 만들 때만 좁힌다 — 나머지 컬럼은 계속 검사된다.
    type CheckinCandidateRow = Omit<BadgeListRow, 'activity_types' | 'condition_json'> &
      Omit<BadgeListSortRow, 'name' | 'rarity' | 'activity_types'> & {
        activity_types: string[]
        condition_json: Json
        category: string | null
      }
    const [allCheckinRows, linkedPoiRows] = await Promise.all([
      fetchAllRows<CheckinCandidateRow>((from, to) =>
        supabase
          .from('badges')
          .select(`${BADGE_LIST_COLUMNS}, ${BADGE_SORT_COLUMNS}, category`)
          .eq('type', 'checkin')
          .order('id')
          .range(from, to)
      ),
      fetchAllRows<{ linked_badge_id: string; category: string }>((from, to) =>
        supabase
          .from('poi')
          .select('linked_badge_id, category')
          .not('linked_badge_id', 'is', null)
          .order('linked_badge_id')
          .range(from, to)
      ),
    ])

    const poiCategoryByBadge = new Map<string, string>()
    for (const row of linkedPoiRows) {
      if (!poiCategoryByBadge.has(row.linked_badge_id)) poiCategoryByBadge.set(row.linked_badge_id, row.category)
    }

    let candidates = allCheckinRows.filter((b) => {
      const effectiveCategory = b.category ?? poiCategoryByBadge.get(b.id) ?? null
      return isUnassignedPoiFilter ? effectiveCategory === null : effectiveCategory === filterPoiCategory
    })

    // 나머지 필터 — 메인 쿼리 분기(아래 else)와 동일한 조건을 메모리에서 적용
    if (status === 'active') candidates = candidates.filter((b) => !b.deleted_at)
    else if (status === 'inactive') candidates = candidates.filter((b) => !!b.deleted_at)
    if (filterRarity) candidates = candidates.filter((b) => b.rarity === filterRarity)
    if (q) {
      const qLower = q.toLowerCase()
      candidates = candidates.filter(
        (b) => b.name.toLowerCase().includes(qLower) || (b.description ?? '').toLowerCase().includes(qLower)
      )
    }
    if (filterConditionField) {
      candidates = candidates.filter((b) =>
        badgeUsesConditionField(b.condition_json as Record<string, unknown> | null, filterConditionField)
      )
    }

    candidates.sort(compareBadgeListRows(sortBy))

    total = candidates.length
    const from = (page - 1) * PAGE_SIZE
    badges = candidates.slice(from, from + PAGE_SIZE).map(
      (c): BadgeListRow => ({
        id: c.id,
        name: c.name,
        description: c.description,
        type: c.type,
        rarity: c.rarity,
        image_url: c.image_url,
        condition_json: c.condition_json as BadgeListRow['condition_json'],
        activity_types: c.activity_types as BadgeListRow['activity_types'],
        patch_available: c.patch_available,
        patch_price_krw: c.patch_price_krw,
        faction_id: c.faction_id,
        deleted_at: c.deleted_at,
      })
    )
  } else {
    // 필터는 두 경로(DB 정렬 / 메모리 정렬)가 똑같이 적용해야 한다 — 한 곳에서만 조립한다.
    // select 문자열을 인자로 받지 않는 이유: 인자로 받으면 타입이 `string`으로 넓어져
    // 응답 행 타입 추론이 통째로 사라진다(컬럼 오타가 컴파일에서 안 잡힌다).
    const filtered = (withCount: boolean) => {
      let query = supabase
        .from('badges')
        .select(`${BADGE_LIST_COLUMNS}, ${BADGE_SORT_COLUMNS}`, withCount ? { count: 'exact' } : undefined)

      if (status === 'active') query = query.is('deleted_at', null)
      else if (status === 'inactive') query = query.not('deleted_at', 'is', null)
      // status === 'all' → 필터 없음

      if (filterType) query = query.eq('type', filterType)
      if (filterRarity) query = query.eq('rarity', filterRarity)
      if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`)

      if (filterActivityType) query = query.contains('activity_types', [filterActivityType])
      if (filterFactionId) query = query.eq('faction_id', filterFactionId)
      if (filterItemBookId) query = query.eq('item_book_id', filterItemBookId)
      // 조건 필드 필터 — `condition_json`에 그 키가 있는 배지만. jsonb에서 없는 키는 NULL이라
      // "not is null"로 «쓰는 배지»를 가려낸다. 키는 레지스트리를 통과한 값뿐이다.
      if (filterConditionField) query = query.not(`condition_json->>${filterConditionField}`, 'is', null)

      return query
    }

    const from = (page - 1) * PAGE_SIZE

    if (requiresFullFetchSort(sortBy)) {
      // 계열순·레벨순은 DB가 정렬할 수 없다(「0은 맨 뒤」·계열 키 폴백·레벨 없는 배지 맨 뒤).
      // ⚠️ PostgREST 기본 상한 1000행 — `range`로 끝까지 넘겨 전량을 가져온 뒤 메모리에서
      // 정렬·페이지네이션한다. 잘린 목록으로 정렬하면 뒤쪽 계열이 통째로 사라진다.
      type SortableRow = BadgeListRow & Omit<BadgeListSortRow, 'name' | 'rarity' | 'activity_types'>
      const rows = await fetchAllRows<SortableRow>(async (rangeFrom, rangeTo) => {
        const { data, error } = await filtered(false).order('id').range(rangeFrom, rangeTo)
        return { data: (data ?? []) as unknown as SortableRow[], error }
      })
      rows.sort(compareBadgeListRows(sortBy))
      total = rows.length
      badges = rows.slice(from, from + PAGE_SIZE)
    } else {
      let query = filtered(true)

      switch (sortBy) {
        case 'name_asc': query = query.order('name', { ascending: true }); break
        case 'name_desc': query = query.order('name', { ascending: false }); break
        case 'created_asc': query = query.order('created_at', { ascending: true }); break
        default: query = query.order('created_at', { ascending: false })
      }

      const { data: badgesRaw, count } = await query.range(from, from + PAGE_SIZE - 1)
      badges = (badgesRaw ?? []) as BadgeListRow[]
      total = count ?? 0
    }
  }

  const [{ data: factionsRaw }, { data: itemBooksRaw }, { data: poiCategoriesRaw }] = await Promise.all([
    supabase.from('factions').select('id, name').order('name'),
    supabase.from('item_books').select('id, name, faction_id').order('name'),
    supabase.from('poi_categories').select('slug, label').order('label'),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const factionMap = new Map(
    ((factionsRaw ?? []) as Pick<FactionRow, 'id' | 'name'>[]).map((f) => [f.id, f.name])
  )
  const factions = (factionsRaw ?? []) as Pick<FactionRow, 'id' | 'name'>[]
  const itemBooks = (itemBooksRaw ?? []) as Pick<ItemBookRow, 'id' | 'name' | 'faction_id'>[]
  const poiCategories = (poiCategoriesRaw ?? []) as Pick<PoiCategoryRow, 'slug' | 'label'>[]

  const hasFilter = !!(q || filterType || filterRarity || filterActivityType || filterPoiCategory || filterFactionId || filterItemBookId || filterConditionField || status !== 'active')

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">배지 관리</h1>
        <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
          <Link href="/admin/badges/bulk" className="w-full md:w-auto">
            <Button variant="outline" className="w-full md:w-auto h-11 md:h-10">
              일괄 작업
            </Button>
          </Link>
          <Link href="/admin/badges/new" className="w-full md:w-auto">
            <Button className="w-full md:w-auto h-11 md:h-10">+ 새 배지</Button>
          </Link>
        </div>
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
