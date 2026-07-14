import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ItemBookForm from '../ItemBookForm'
import type { ItemBookRow, BadgeRow, FactionRow } from '@/types/database'

export default async function EditItemBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const [
    { data: bookRaw },
    { data: factionsRaw },
    { data: slottedRaw },
    { data: availableRaw },
    { data: badgesRaw },
  ] = await Promise.all([
    supabase.from('item_books').select('*').eq('id', id).single(),
    supabase.from('factions').select('id, name').eq('is_active', true).order('sort_order'),
    supabase.from('badges').select('id, name, rarity, image_url').eq('item_book_id', id).eq('type', 'item'),
    supabase.from('badges').select('id, name, rarity, image_url').is('item_book_id', null).eq('type', 'item'),
    supabase.from('badges').select('id, name, type').order('name'),
  ])

  if (!bookRaw) notFound()

  const factions = (factionsRaw ?? []) as Pick<FactionRow, 'id' | 'name'>[]
  const slottedBadges = (slottedRaw ?? []) as Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'image_url'>[]
  const availableBadges = (availableRaw ?? []) as Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'image_url'>[]
  const badges = (badgesRaw ?? []) as (Pick<BadgeRow, 'id' | 'name'> & { type: string })[]
  const activityBadges = badges.filter((b) => b.type === 'activity')

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/itembooks" className="text-white/40 hover:text-white text-sm transition-colors">
          ← 아이템북 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">아이템북 수정</h1>
      </div>
      <ItemBookForm
        book={bookRaw as ItemBookRow}
        factions={factions}
        slottedBadges={slottedBadges}
        availableBadges={availableBadges}
        activityBadges={activityBadges}
        allBadges={badges}
      />
    </div>
  )
}
