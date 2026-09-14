import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createServiceClient } from '@/lib/supabase/server'
import type { BadgeRow, ItemBookRow } from '@/types/database'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'
import { ExclusionFilterBar } from './ExclusionFilterBar'
import { DropExclusionCollectionsTable } from '@/components/admin/drop-policy/DropExclusionCollectionsTable'
import { DropExclusionBadgesTable } from '@/components/admin/drop-policy/DropExclusionBadgesTable'
import Pagination from '../../poi/Pagination'

interface Props {
  searchParams: SearchParamsPromise
}

type CollectionRow = Pick<ItemBookRow, 'id' | 'name' | 'tribe_id' | 'drop_excluded'>
type ExclusionBadgeRow = Pick<BadgeRow, 'id' | 'name' | 'image_url' | 'rarity' | 'item_book_id' | 'drop_excluded'>

const PAGE_SIZE = 500

/**
 * 드랍 정책 — 아이템배지 드랍 제외 관리(티켓 20260911_2220).
 *
 * `/admin/drop-policy`(드랍엔진 v2 파라미터 폼)의 하위 화면. 아래 두 축은 서로 다른 컬럼을
 * 건드리는 완전히 별개 액션이다:
 *   - 컬렉션 전체 드랍 제외: `item_books.drop_excluded` 토글 하나로 소속 배지 전체가
 *     드랍 후보에서 빠진다(소속 배지 각각의 `drop_excluded` 값은 건드리지 않는다).
 *   - 배지 개별 드랍 제외: 목록에서 다중 선택 후 일괄 `badges.drop_excluded` 토글.
 *
 * 트라이브 필터는 조회를 좁히는 용도일 뿐, 트라이브 자체를 드랍 제외하는 기능은 범위
 * 밖이다(사용자 확정, 티켓 본문 참고).
 */
export default async function DropExclusionsPage({ searchParams }: Props) {
  const params = pickSingleQueryParams(await searchParams)
  const filterTribeId = params.tribe_id
  const filterItemBookId = params.item_book_id
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)

  const supabase = createServiceClient()

  const [{ data: tribesRaw }, { data: itemBooksRaw }] = await Promise.all([
    supabase.from('tribes').select('id, name').order('name'),
    supabase.from('item_books').select('id, name, tribe_id, drop_excluded').order('name'),
  ])
  const tribes = (tribesRaw ?? []) as { id: string; name: string }[]
  const allCollections = (itemBooksRaw ?? []) as CollectionRow[]

  const collections = filterTribeId
    ? allCollections.filter((c) => c.tribe_id === filterTribeId)
    : allCollections

  const visibleItemBookIds = filterItemBookId
    ? [filterItemBookId]
    : collections.map((c) => c.id)

  let badges: ExclusionBadgeRow[] = []
  let totalBadges = 0
  if (visibleItemBookIds.length > 0) {
    const from = (page - 1) * PAGE_SIZE
    const { data: badgesRaw, count } = await supabase
      .from('badges')
      .select('id, name, image_url, rarity, item_book_id, drop_excluded', { count: 'exact' })
      .eq('type', 'item')
      .is('deleted_at', null)
      .in('item_book_id', visibleItemBookIds)
      .order('name', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    badges = (badgesRaw ?? []) as ExclusionBadgeRow[]

    if (count === null && page > 1) {
      // .range()의 offset이 실제 행 수를 초과하면 PostgREST가 416을 반환하며 count가
      // null로 돌아온다(count ?? 0 처리 시 실제로는 데이터가 있는데도 "총 0개"로 오표시됨).
      // 실제 총 건수를 별도로 다시 조회해 정확한 페이지 수를 계산한다.
      const { count: recount } = await supabase
        .from('badges')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'item')
        .is('deleted_at', null)
        .in('item_book_id', visibleItemBookIds)
      totalBadges = recount ?? 0
      const totalPages = Math.max(1, Math.ceil(totalBadges / PAGE_SIZE))
      if (page > totalPages) {
        const redirectParams = new URLSearchParams(
          Object.entries(params).filter(
            (entry): entry is [string, string] => entry[0] !== 'page' && entry[1] !== undefined,
          ),
        )
        const query = redirectParams.toString()
        redirect(`/admin/drop-policy/exclusions${query ? `?${query}` : ''}`)
      }
    } else {
      totalBadges = count ?? 0
    }
  }
  const totalBadgePages = Math.max(1, Math.ceil(totalBadges / PAGE_SIZE))

  const collectionNameById = new Map(collections.map((c) => [c.id, c.name]))

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">드랍 제외 관리</h1>
        <p className="text-muted-foreground text-sm mt-1">
          아이템배지·컬렉션을 드랍 후보에서만 제외합니다. 화면 노출·이미 보유한 유저 이력에는
          영향이 없습니다.{' '}
          <Link href="/admin/drop-policy" className="underline hover:text-foreground">
            드랍 정책 파라미터
          </Link>
          로 돌아가기
        </p>
      </div>

      <Suspense>
        <ExclusionFilterBar tribes={tribes} itemBooks={allCollections} />
      </Suspense>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">컬렉션 전체 드랍 제외</h2>
        <DropExclusionCollectionsTable collections={collections} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">아이템배지 개별 드랍 제외</h2>
        <div className="text-sm text-muted-foreground">총 {totalBadges}개</div>
        <DropExclusionBadgesTable badges={badges} collectionNameById={collectionNameById} />
        <Pagination
          page={page}
          totalPages={totalBadgePages}
          searchParams={params}
          basePath="/admin/drop-policy/exclusions"
        />
      </section>
    </div>
  )
}
