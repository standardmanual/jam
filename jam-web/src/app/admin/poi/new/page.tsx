import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import PoiForm from '../PoiForm'
import type { BadgeRow, PoiCategoryRow } from '@/types/database'

export default async function NewPoiPage() {
  const supabase = createServiceClient()
  const [{ data: badgesRaw }, { data: categoriesRaw }] = await Promise.all([
    supabase.from('badges').select('id, name').order('name'),
    supabase.from('poi_categories').select('*').order('slug'),
  ])
  const badges = (badgesRaw ?? []) as Pick<BadgeRow, 'id' | 'name'>[]
  const categories = (categoriesRaw ?? []) as PoiCategoryRow[]

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/poi" className="text-[#6b7280] hover:text-[#111111] text-sm transition-colors">
          ← POI 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">POI 등록</h1>
      </div>
      <PoiForm badges={badges} categories={categories} />
    </div>
  )
}
