import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Suspense } from 'react'
import { Button } from '@/components/ui/shadcn-button'
import type { ItemBookRow, BadgeRow, FactionRow } from '@/types/database'
import { ItemBookList } from '@/components/admin/itembooks/ItemBookList'
import ItemBookFilters from './ItemBookFilters'
import Pagination from '../poi/Pagination'

const PAGE_SIZE = 30

interface AdminItemBooksPageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function AdminItemBooksPage({ searchParams }: AdminItemBooksPageProps) {
  const params = await searchParams
  const faction = params.faction ?? 'all'
  const sort = params.sort ?? 'created_desc'
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)

  const supabase = createServiceClient()

  // 20260826_011 A6: 전체 로드 후 클라이언트 필터·정렬하던 것을 admin/poi/page.tsx와 동일한
  // 구조(searchParams로 세계관/정렬/페이지 구동 + range() 서버 필터링)로 전환.
  let query = supabase.from('item_books').select('*', { count: 'exact' })
  if (faction !== 'all') query = query.eq('faction_id', faction)

  if (sort === 'name_asc') query = query.order('name', { ascending: true })
  else if (sort === 'name_desc') query = query.order('name', { ascending: false })
  else query = query.order('created_at', { ascending: false })

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  query = query.range(from, to)

  const [{ data: booksRaw, count }, { data: factionsRaw }] = await Promise.all([
    query,
    supabase.from('factions').select('id, name'),
  ])

  const books = (booksRaw ?? []) as ItemBookRow[]
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))
  const factions = (factionsRaw ?? []) as Pick<FactionRow, 'id' | 'name'>[]
  const factionMap = new Map(factions.map((f) => [f.id, f.name]))

  // 이 페이지에 보여줄 책들이 참조하는 배지(필요/보상)의 이름만 bounded로 조회 — 배지 테이블
  // 필터 없이 전량(현재 5585건) 조회하면 PostgREST 기본 응답 상한(1000행)에 걸려 뒤쪽 배지가
  // 통째로 빠지는 문제가 있었다(티켓 20260825_029). 페이지네이션 전환 후에는 현재 페이지의
  // 책들만 대상으로 하므로 범위가 더 좁아진다.
  const labelIds = [
    ...new Set(
      books.flatMap((b) => [b.required_activity_badge_id, b.reward_badge_id]).filter((id): id is string => !!id)
    ),
  ]
  const bookIds = books.map((b) => b.id)
  const [{ data: badgesRaw }, { data: itemBadgesRaw }] = await Promise.all([
    labelIds.length > 0
      ? supabase.from('badges').select('id, name').in('id', labelIds)
      : Promise.resolve({ data: [] as Pick<BadgeRow, 'id' | 'name'>[] }),
    bookIds.length > 0
      ? supabase.from('badges').select('id, item_book_id').eq('type', 'item').in('item_book_id', bookIds).is('deleted_at', null)
      : Promise.resolve({ data: [] as { id: string; item_book_id: string }[] }),
  ])
  const badges = (badgesRaw ?? []) as Pick<BadgeRow, 'id' | 'name'>[]
  const badgeMap = new Map(badges.map((b) => [b.id, b.name]))

  const itemBadgeCountMap = new Map<string, number>()
  for (const b of (itemBadgesRaw ?? []) as { id: string; item_book_id: string }[]) {
    if (!b.item_book_id) continue
    itemBadgeCountMap.set(b.item_book_id, (itemBadgeCountMap.get(b.item_book_id) ?? 0) + 1)
  }

  const emptyMessage = faction !== 'all' ? '조건에 맞는 컬렉션이 없습니다.' : '등록된 컬렉션이 없습니다.'

  return (
    <div className="space-y-6 p-4 md:p-8">
      {/* 헤더 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-bold md:text-3xl">컬렉션 관리</h1>
        <Link href="/admin/itembooks/new">
          <Button className="w-full md:w-auto">
            + 컬렉션 등록
          </Button>
        </Link>
      </div>

      {/* 필터 */}
      <Suspense>
        <ItemBookFilters factions={factions} />
      </Suspense>

      {/* 카운트 */}
      <div className="text-sm text-muted-foreground">
        총 {count ?? 0}개
      </div>

      {/* 목록 */}
      <ItemBookList
        itemBooks={books}
        badgeMap={badgeMap}
        factionMap={factionMap}
        itemBadgeCountMap={itemBadgeCountMap}
        emptyMessage={emptyMessage}
      />

      {/* 페이지네이션 */}
      <Pagination page={page} totalPages={totalPages} searchParams={params} basePath="/admin/itembooks" />
    </div>
  )
}
