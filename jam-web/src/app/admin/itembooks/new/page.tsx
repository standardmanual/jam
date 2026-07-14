import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import ItemBookForm from '../ItemBookForm'
import type { BadgeRow, FactionRow } from '@/types/database'

export default async function NewItemBookPage() {
  const supabase = createServiceClient()
  const [{ data: badgesRaw }, { data: factionsRaw }] = await Promise.all([
    supabase.from('badges').select('id, name, type').order('name'),
    supabase.from('factions').select('id, name').eq('is_active', true).order('sort_order'),
  ])

  const badges = (badgesRaw ?? []) as (Pick<BadgeRow, 'id' | 'name'> & { type: string })[]
  const factions = (factionsRaw ?? []) as Pick<FactionRow, 'id' | 'name'>[]
  const activityBadges = badges.filter((b) => b.type === 'activity')

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/itembooks" className="text-white/40 hover:text-white text-sm transition-colors">
          ← 아이템북 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">아이템북 등록</h1>
      </div>
      <ItemBookForm
        factions={factions}
        slottedBadges={[]}
        availableBadges={[]}
        activityBadges={activityBadges}
        allBadges={badges}
      />
    </div>
  )
}
