import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/shadcn-button'
import type { ItemBookRow, BadgeRow, FactionRow } from '@/types/database'
import { ItemBookList } from '@/components/admin/itembooks/ItemBookList'

export default async function AdminItemBooksPage() {
  const supabase = createServiceClient()
  const [{ data: booksRaw }, { data: itemBadgesRaw }, { data: factionsRaw }] = await Promise.all([
    supabase.from('item_books').select('*').order('created_at', { ascending: false }),
    supabase.from('badges').select('id, item_book_id').eq('type', 'item').not('item_book_id', 'is', null).is('deleted_at', null),
    supabase.from('factions').select('id, name'),
  ])

  const books = (booksRaw ?? []) as ItemBookRow[]

  // 티켓 20260825_029: 이전에는 badges 테이블을 필터 없이 전량(현재 5585건) 조회해
  // badgeMap을 만들었다 — PostgREST 기본 응답 상한(1000행)에 걸려 뒤쪽 배지는 통째로
  // 빠지므로, book.required_activity_badge_id/reward_badge_id가 잘린 구간을 가리키면
  // 목록 화면에 배지 이름이 빈 값으로 표시된다. badgeMap의 실제 용도는 각 북이 참조하는
  // 두 id(필요/보상 배지)의 이름 조회뿐이므로 그 id만 모아 bounded로 조회한다
  // (admin/itembooks/[id]/page.tsx의 labelIds 조회와 동일 패턴).
  const labelIds = [
    ...new Set(
      books.flatMap((b) => [b.required_activity_badge_id, b.reward_badge_id]).filter((id): id is string => !!id)
    ),
  ]
  const { data: badgesRaw } = labelIds.length > 0
    ? await supabase.from('badges').select('id, name').in('id', labelIds)
    : { data: [] as Pick<BadgeRow, 'id' | 'name'>[] }
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
