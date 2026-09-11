import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import BadgeForm from '../../BadgeForm'
import type { BadgeRow, TribeRow, ItemBookRow, PoiCategoryRow } from '@/types/database'

export default async function EditBadgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const [{ data }, { data: tribesRaw }, { data: itemBooksRaw }, { data: poiCategoriesRaw }] = await Promise.all([
    supabase.from('badges').select('*').eq('id', id).single(),
    supabase.from('tribes').select('id, name').eq('is_active', true).order('sort_order'),
    supabase.from('item_books').select('id, name').order('name'),
    supabase.from('poi_categories').select('slug, label').order('label'),
  ])
  if (!data) notFound()
  const tribes = (tribesRaw ?? []) as Pick<TribeRow, 'id' | 'name'>[]
  const itemBooks = (itemBooksRaw ?? []) as Pick<ItemBookRow, 'id' | 'name'>[]
  const poiCategories = (poiCategoriesRaw ?? []) as Pick<PoiCategoryRow, 'slug' | 'label'>[]

  return (
    <div className="p-4 md:p-8">
      {/* 제목은 폼의 섹션 열 위에 둔다 — 오른쪽 레일이 페이지 맨 위에서 시작하도록(티켓 20260911_0901) */}
      <BadgeForm
        badge={data as BadgeRow}
        tribes={tribes}
        itemBooks={itemBooks}
        poiCategories={poiCategories}
        header={
          <div>
            <Link href={`/admin/badges/${id}`} className="text-muted-foreground hover:text-foreground text-sm transition-colors">
              ← 배지 상세
            </Link>
            <h1 className="text-2xl font-bold mt-2">배지 수정</h1>
          </div>
        }
      />
    </div>
  )
}
