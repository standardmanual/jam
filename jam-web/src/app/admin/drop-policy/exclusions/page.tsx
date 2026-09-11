import Link from 'next/link'
import { Suspense } from 'react'
import { createServiceClient } from '@/lib/supabase/server'
import type { BadgeRow, ItemBookRow } from '@/types/database'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'
import { ExclusionFilterBar } from './ExclusionFilterBar'
import { DropExclusionCollectionsTable } from '@/components/admin/drop-policy/DropExclusionCollectionsTable'
import { DropExclusionBadgesTable } from '@/components/admin/drop-policy/DropExclusionBadgesTable'

interface Props {
  searchParams: SearchParamsPromise
}

type CollectionRow = Pick<ItemBookRow, 'id' | 'name' | 'tribe_id' | 'drop_excluded'>
type ExclusionBadgeRow = Pick<BadgeRow, 'id' | 'name' | 'image_url' | 'rarity' | 'item_book_id' | 'drop_excluded'>

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
  if (visibleItemBookIds.length > 0) {
    const { data: badgesRaw } = await supabase
      .from('badges')
      .select('id, name, image_url, rarity, item_book_id, drop_excluded')
      .eq('type', 'item')
      .is('deleted_at', null)
      .in('item_book_id', visibleItemBookIds)
      .order('name', { ascending: true })
      .limit(500)
    badges = (badgesRaw ?? []) as ExclusionBadgeRow[]
  }

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
        <DropExclusionBadgesTable badges={badges} collectionNameById={collectionNameById} />
      </section>
    </div>
  )
}
