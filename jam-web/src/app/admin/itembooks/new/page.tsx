import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import ItemBookForm from '../ItemBookForm'
import type { BadgeRow } from '@/types/database'

export default async function NewItemBookPage() {
  const supabase = createServiceClient()
  const { data } = await supabase.from('badges').select('id, name, type').order('name')
  const badges = (data ?? []) as (Pick<BadgeRow, 'id' | 'name'> & { type: string })[]

  const activityBadges = badges.filter((b) => b.type === 'activity')
  const itemBadges = badges.filter((b) => b.type === 'item')

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/itembooks" className="text-white/40 hover:text-white text-sm transition-colors">
          ← 아이템북 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">아이템북 등록</h1>
      </div>
      <ItemBookForm
        activityBadges={activityBadges}
        itemBadges={itemBadges}
        allBadges={badges}
      />
    </div>
  )
}
