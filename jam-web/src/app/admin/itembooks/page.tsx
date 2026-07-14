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
          className="bg-[#AEEA00] text-black font-bold px-4 py-2 rounded-xl hover:bg-[#c6ff00] transition-colors text-sm"
        >
          + 아이템북 등록
        </Link>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/40 text-left">
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
                <td colSpan={5} className="px-5 py-10 text-center text-white/30">
                  등록된 아이템북이 없습니다.
                </td>
              </tr>
            )}
            {books.map((book) => (
              <tr key={book.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="px-5 py-3">
                  <Link
                    href={`/admin/itembooks/${book.id}`}
                    className="font-medium hover:text-[#AEEA00] transition-colors"
                  >
                    {book.name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-white/60">
                  {book.faction_id ? (factionMap.get(book.faction_id) ?? '—') : '—'}
                </td>
                <td className="px-5 py-3 text-white/60">
                  {book.required_activity_badge_id ? (badgeMap.get(book.required_activity_badge_id) ?? '—') : '—'}
                </td>
                <td className="px-5 py-3 text-white/60">
                  {itemBadgeCountMap.get(book.id) ?? 0}개
                </td>
                <td className="px-5 py-3 text-white/60">
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
