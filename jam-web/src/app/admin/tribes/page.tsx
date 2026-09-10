import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { TribeRow } from '@/types/database'
import { TribesTable } from './TribesTable'

export default async function AdminTribesPage() {
  const supabase = createServiceClient()
  const [{ data }, { data: badgesRaw }, { data: booksRaw }] = await Promise.all([
    supabase.from('tribes').select('*').order('sort_order', { ascending: true }),
    supabase.from('badges').select('tribe_id').not('tribe_id', 'is', null).is('deleted_at', null),
    supabase.from('item_books').select('tribe_id').not('tribe_id', 'is', null),
  ])
  const tribes = (data ?? []) as TribeRow[]

  const badgeCountMap = new Map<string, number>()
  for (const b of (badgesRaw ?? []) as { tribe_id: string }[]) {
    badgeCountMap.set(b.tribe_id, (badgeCountMap.get(b.tribe_id) ?? 0) + 1)
  }
  const bookCountMap = new Map<string, number>()
  for (const b of (booksRaw ?? []) as { tribe_id: string }[]) {
    bookCountMap.set(b.tribe_id, (bookCountMap.get(b.tribe_id) ?? 0) + 1)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">트라이브 관리</h1>
        <Link
          href="/admin/tribes/new"
          className="bg-primary text-white font-bold px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-colors text-sm"
        >
          + 트라이브 등록
        </Link>
      </div>

      <TribesTable tribes={tribes} badgeCountMap={badgeCountMap} bookCountMap={bookCountMap} />
    </div>
  )
}
