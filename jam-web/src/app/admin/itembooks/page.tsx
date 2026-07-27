import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { ItemBookRow, BadgeRow, FactionRow } from '@/types/database'

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
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">아이템북 관리</h1>
        <Link
          href="/admin/itembooks/new"
          className="bg-[#111111] text-white font-bold px-4 py-2 rounded-xl hover:bg-[#242424] transition-colors text-sm"
        >
          + 아이템북 등록
        </Link>
      </div>

      <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e5e7eb] text-[#6b7280] text-left">
              <th className="px-5 py-3 font-medium">이름</th>
              <th className="px-5 py-3 font-medium">세계관</th>
              <th className="px-5 py-3 font-medium">필수 액티비티 배지</th>
              <th className="px-5 py-3 font-medium">아이템 배지 수</th>
              <th className="px-5 py-3 font-medium">보상 배지</th>
            </tr>
          </thead>
          <tbody>
            {books.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-[#898989]">
                  등록된 아이템북이 없습니다.
                </td>
              </tr>
            )}
            {books.map((book) => (
              <tr key={book.id} className="border-b border-[#f3f4f6] hover:bg-[#f8f9fa] transition-colors">
                <td className="px-5 py-3">
                  <Link
                    href={`/admin/itembooks/${book.id}`}
                    className="font-medium hover:text-[#111111] transition-colors"
                  >
                    {book.name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-[#374151]">
                  {book.faction_id ? (factionMap.get(book.faction_id) ?? '—') : '—'}
                </td>
                <td className="px-5 py-3 text-[#374151]">
                  {book.required_activity_badge_id ? (badgeMap.get(book.required_activity_badge_id) ?? '—') : '—'}
                </td>
                <td className="px-5 py-3 text-[#374151]">
                  {itemBadgeCountMap.get(book.id) ?? 0}개
                </td>
                <td className="px-5 py-3 text-[#374151]">
                  {book.reward_badge_id ? badgeMap.get(book.reward_badge_id) ?? '—' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
