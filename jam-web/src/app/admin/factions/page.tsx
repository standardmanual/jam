import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { FactionRow } from '@/types/database'
import { FactionsTable } from './FactionsTable'

export default async function AdminFactionsPage() {
  const supabase = createServiceClient()
  const [{ data }, { data: badgesRaw }, { data: booksRaw }] = await Promise.all([
    supabase.from('factions').select('*').order('sort_order', { ascending: true }),
    supabase.from('badges').select('faction_id').not('faction_id', 'is', null).is('deleted_at', null),
    supabase.from('item_books').select('faction_id').not('faction_id', 'is', null),
  ])
  const factions = (data ?? []) as FactionRow[]

  const badgeCountMap = new Map<string, number>()
  for (const b of (badgesRaw ?? []) as { faction_id: string }[]) {
    badgeCountMap.set(b.faction_id, (badgeCountMap.get(b.faction_id) ?? 0) + 1)
  }
  const bookCountMap = new Map<string, number>()
  for (const b of (booksRaw ?? []) as { faction_id: string }[]) {
    bookCountMap.set(b.faction_id, (bookCountMap.get(b.faction_id) ?? 0) + 1)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">세계관 관리</h1>
        <Link
          href="/admin/factions/new"
          className="bg-[#111111] text-white font-bold px-5 py-2.5 rounded-xl hover:bg-[#242424] transition-colors text-sm"
        >
          + 세계관 등록
        </Link>
      </div>

      <FactionsTable factions={factions} badgeCountMap={badgeCountMap} bookCountMap={bookCountMap} />
    </div>
  )
}
