import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import BadgeForm from '../BadgeForm'
import type { TribeRow, ItemBookRow, PoiCategoryRow } from '@/types/database'

export default async function NewBadgePage() {
  const supabase = createServiceClient()
  const [{ data: tribesRaw }, { data: itemBooksRaw }, { data: poiCategoriesRaw }] = await Promise.all([
    supabase.from('tribes').select('id, name').eq('is_active', true).order('sort_order'),
    supabase.from('item_books').select('id, name').order('name'),
    supabase.from('poi_categories').select('slug, label').order('label'),
  ])
  const tribes = (tribesRaw ?? []) as Pick<TribeRow, 'id' | 'name'>[]
  const itemBooks = (itemBooksRaw ?? []) as Pick<ItemBookRow, 'id' | 'name'>[]
  const poiCategories = (poiCategoriesRaw ?? []) as Pick<PoiCategoryRow, 'slug' | 'label'>[]

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/badges" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
          ← 배지 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">배지 등록</h1>
      </div>
      <BadgeForm tribes={tribes} itemBooks={itemBooks} poiCategories={poiCategories} />
    </div>
  )
}
