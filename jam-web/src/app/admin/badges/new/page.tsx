import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import BadgeForm from '../BadgeForm'
import type { FactionRow, ItemBookRow } from '@/types/database'

export default async function NewBadgePage() {
  const supabase = createServiceClient()
  const [{ data: factionsRaw }, { data: itemBooksRaw }] = await Promise.all([
    supabase.from('factions').select('id, name').eq('is_active', true).order('sort_order'),
    supabase.from('item_books').select('id, name').order('name'),
  ])
  const factions = (factionsRaw ?? []) as Pick<FactionRow, 'id' | 'name'>[]
  const itemBooks = (itemBooksRaw ?? []) as Pick<ItemBookRow, 'id' | 'name'>[]

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/badges" className="text-white/40 hover:text-white text-sm transition-colors">
          ← 배지 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">배지 등록</h1>
      </div>
      <BadgeForm factions={factions} itemBooks={itemBooks} />
    </div>
  )
}
