import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import BadgeDetail, { type BadgeDetailLinkedPoi } from '@/components/admin/badges/BadgeDetail'
import type { BadgeRow, TribeRow, ItemBookRow, PoiCategoryRow } from '@/types/database'

export default async function BadgeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  // 연결된 지점은 서버에서 조회한다(티켓 20260911_0901) — 관계는 `poi.linked_badge_id` 하나로만
  // 표현한다(조인 테이블 없음, `api/admin/badges/[id]/poi-links` GET과 같은 조회).
  const [{ data }, { data: tribesRaw }, { data: itemBooksRaw }, { data: poiCategoriesRaw }, { data: poisRaw }] =
    await Promise.all([
      supabase.from('badges').select('*').eq('id', id).single(),
      supabase.from('tribes').select('id, name'),
      supabase.from('item_books').select('id, name'),
      supabase.from('poi_categories').select('slug, label'),
      supabase.from('poi').select('id, name, category, radius_meters').eq('linked_badge_id', id).order('name', { ascending: true }),
    ])

  if (!data) notFound()

  const badge = data as BadgeRow
  const tribeMap = new Map(((tribesRaw ?? []) as Pick<TribeRow, 'id' | 'name'>[]).map((f) => [f.id, f.name]))
  const itemBookMap = new Map(((itemBooksRaw ?? []) as Pick<ItemBookRow, 'id' | 'name'>[]).map((b) => [b.id, b.name]))
  const poiCategoryLabels = Object.fromEntries(
    ((poiCategoriesRaw ?? []) as Pick<PoiCategoryRow, 'slug' | 'label'>[]).map((c) => [c.slug, c.label])
  )

  return (
    <div className="p-4 md:p-8">
      <BadgeDetail
        badge={badge}
        tribeName={badge.tribe_id ? tribeMap.get(badge.tribe_id) : undefined}
        itemBookName={badge.item_book_id ? itemBookMap.get(badge.item_book_id) : undefined}
        linkedPois={(poisRaw ?? []) as BadgeDetailLinkedPoi[]}
        poiCategoryLabels={poiCategoryLabels}
      />
    </div>
  )
}
