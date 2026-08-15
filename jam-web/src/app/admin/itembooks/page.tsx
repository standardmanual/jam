import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/shadcn-button'
import type { ItemBookRow, BadgeRow, FactionRow } from '@/types/database'
import { ItemBookList } from '@/components/admin/itembooks/ItemBookList'

export default async function AdminItemBooksPage() {
  const supabase = createServiceClient()
  const [{ data: booksRaw }, { data: badgesRaw }, { data: itemBadgesRaw }, { data: factionsRaw }] = await Promise.all([
    supabase.from('item_books').select('*').order('created_at', { ascending: false }),
    supabase.from('badges').select('id, name'),
    supabase.from('badges').select('id, item_book_id').eq('type', 'item').not('item_book_id', 'is', null),
    supabase.from('factions').select('id, name'),
  ])

  const books = (booksRaw ?? []) as ItemBookRow[]
  const badges = (badgesRaw ?? []) as Pick<BadgeRow, 'id' | 'name'>[]
  const badgeMap = new Map(badges.map((b) => [b.id, b.name]))
  const factionMap = new Map(((factionsRaw ?? []) as Pick<FactionRow, 'id' | 'name'>[]).map((f) => [f.id, f.name]))

  const itemBadgeCountMap = new Map<string, number>()
  for (const b of (itemBadgesRaw ?? []) as { id: string; item_book_id: string }[]) {
    if (!b.item_book_id) continue
    itemBadgeCountMap.set(b.item_book_id, (itemBadgeCountMap.get(b.item_book_id) ?? 0) + 1)
  }

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

      {/* 목록 */}
      <ItemBookList
        itemBooks={books}
        badgeMap={badgeMap}
        factionMap={factionMap}
        itemBadgeCountMap={itemBadgeCountMap}
      />
    </div>
  )
}
