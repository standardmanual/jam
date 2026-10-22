import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createServiceClient } from '@/lib/supabase/server'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'
import { ADMIN_LIST_PAGE_SIZE, pageRange, totalPagesOf } from '@/lib/admin/list-params'
import { logQueryError, throwOnQueryError, type QueryErrorLike } from '@/lib/admin/queryError'
import {
  BADGE_EXCLUSION_COLUMNS,
  COLLECTION_EXCLUSION_COLUMNS,
  parseDropExclusionParams,
  applyBadgeExclusionQuery,
  applyCollectionExclusionQuery,
  resolveBadgeCollectionScope,
  type ExclusionBadgeRow,
  type ExclusionCollectionRow,
  type ExclusionQuery,
  type TribeCollectionsClient,
} from '@/lib/admin/drop-exclusion-list'
import { ExclusionFilterBar } from './ExclusionFilterBar'
import { DropExclusionTabs } from '@/components/admin/drop-policy/DropExclusionTabs'
import { DropExclusionCollectionsTable } from '@/components/admin/drop-policy/DropExclusionCollectionsTable'
import { DropExclusionBadgesTable } from '@/components/admin/drop-policy/DropExclusionBadgesTable'
import { DataTablePagination } from '@/components/admin/data-table/data-table-pagination'

interface Props {
  searchParams: SearchParamsPromise
}

/**
 * 드랍 제외 관리 — 아이템배지·컬렉션 드랍 제외 관리(티켓 20260911_2220, 탭·표준 표 전환 20260924_0948).
 *
 * 예전에는 `/admin/drop-policy`(옛 드랍 엔진 파라미터 폼)의 하위 화면이었다. 그 폼과 화면은 티켓 20261022_0938에서
 * 지웠고, 이 화면은 주소를 그대로 둔 채 메뉴에서 바로 연다. 탭(`?tab=badges|collections`)마다 표가
 * 하나씩이고, 두 탭은 서로 다른 컬럼을 건드리는 완전히 별개 액션이다:
 *   - 컬렉션 전체 드랍 제외: `item_books.drop_excluded` 토글 하나로 소속 배지 전체가
 *     드랍 후보에서 빠진다(소속 배지 각각의 `drop_excluded` 값은 건드리지 않는다).
 *   - 배지 개별 드랍 제외: `badges.drop_excluded`.
 * 검색·필터·정렬은 `lib/admin/drop-exclusion-list.ts`가 갖고(목록·전체 선택 ID 조회 공용), 한 쪽
 * 크기는 공통 표준(50건)이다.
 *
 * 트라이브 필터는 조회를 좁히는 용도일 뿐, 트라이브 자체를 드랍 제외하는 기능은 범위 밖이다
 * (사용자 확정, 티켓 본문 참고).
 */
export default async function DropExclusionsPage({ searchParams }: Props) {
  const rawParams = pickSingleQueryParams(await searchParams)
  const params = parseDropExclusionParams(rawParams)
  const page = Math.max(1, parseInt(rawParams.page ?? '1', 10) || 1)
  const [from, to] = pageRange(page, ADMIN_LIST_PAGE_SIZE)

  const supabase = createServiceClient()

  const [{ data: tribesRaw, error: tribesError }, { data: itemBooksRaw, error: itemBooksError }] = await Promise.all([
    supabase.from('tribes').select('id, name').order('name'),
    supabase.from('item_books').select('id, name, tribe_id').order('name'),
  ])
  logQueryError(tribesError, 'drop-exclusions/tribes')
  logQueryError(itemBooksError, 'drop-exclusions/item-books')
  const tribes = (tribesRaw ?? []) as { id: string; name: string }[]
  const allCollections = (itemBooksRaw ?? []) as { id: string; name: string; tribe_id: string | null }[]

  let badges: ExclusionBadgeRow[] = []
  let collections: ExclusionCollectionRow[] = []
  let totalCount = 0
  let listError: QueryErrorLike | null = null

  if (params.tab === 'badges') {
    const scope = await resolveBadgeCollectionScope(supabase as unknown as TribeCollectionsClient, params)
    if (scope.kind === 'all' || scope.ids.length > 0) {
      const query = applyBadgeExclusionQuery(
        supabase
          .from('badges')
          .select(BADGE_EXCLUSION_COLUMNS, { count: 'exact' }) as unknown as ExclusionQuery<ExclusionBadgeRow>,
        params,
        scope
      )
      const { data, count, error } = await query.range(from, to)
      badges = data ?? []
      totalCount = count ?? 0
      listError = error
    }
  } else {
    const query = applyCollectionExclusionQuery(
      supabase
        .from('item_books')
        .select(COLLECTION_EXCLUSION_COLUMNS, { count: 'exact' }) as unknown as ExclusionQuery<ExclusionCollectionRow>,
      params
    )
    const { data, count, error } = await query.range(from, to)
    collections = data ?? []
    totalCount = count ?? 0
    listError = error
  }

  // .range()의 offset이 실제 행 수를 초과하면 PostgREST가 416 오류를 돌려주고 count도 null이 된다 —
  // 필터를 좁혀 쪽 수가 줄어든 뒤 이전 쪽 번호가 남아 있는 경우다. 1쪽으로 돌려보낸다.
  if (listError && page > 1) {
    const redirectParams = new URLSearchParams(
      Object.entries(rawParams).filter((entry): entry is [string, string] => entry[0] !== 'page' && entry[1] !== undefined)
    )
    const query = redirectParams.toString()
    redirect(`/admin/drop-policy/exclusions${query ? `?${query}` : ''}`)
  }

  // 1쪽(또는 쪽 번호가 없는 경우)의 오류는 범위 초과가 아니라 실제 조회 실패다 — 빈 목록으로 두지 않고 던진다.
  throwOnQueryError(listError, 'drop-exclusions/list')

  const collectionNameById = new Map(allCollections.map((c) => [c.id, c.name]))
  const tribeNameById = new Map(tribes.map((t) => [t.id, t.name]))
  const totalPages = totalPagesOf(totalCount, ADMIN_LIST_PAGE_SIZE)

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">드랍 제외 관리</h1>
        <p className="text-muted-foreground text-sm mt-1">
          아이템배지·컬렉션을 드랍 후보에서만 제외합니다. 화면 노출·이미 보유한 유저 이력에는
          영향이 없습니다.
        </p>
      </div>

      <DropExclusionTabs>
        <Suspense>
          <ExclusionFilterBar tab={params.tab} tribes={tribes} itemBooks={allCollections} />
        </Suspense>

        <div className="text-sm text-muted-foreground">총 {totalCount}개</div>

        {params.tab === 'badges' ? (
          <DropExclusionBadgesTable
            badges={badges}
            collectionNameById={collectionNameById}
            totalCount={totalCount}
          />
        ) : (
          <DropExclusionCollectionsTable
            collections={collections}
            tribeNameById={tribeNameById}
            totalCount={totalCount}
          />
        )}

        <DataTablePagination page={page} totalPages={totalPages} />
      </DropExclusionTabs>
    </div>
  )
}
