import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import BadgeForm from '../BadgeForm'
import type { TribeRow, ItemBookRow, PoiCategoryRow } from '@/types/database'
import { getJamPolicy } from '@/lib/jam/policy'
import { lockedMinimumsFrom } from '@/lib/admin/badge-lock-guard'

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
  // 잠긴 아이템 배지의 «여는 데 필요한 양» 등급별 최소값 — 양식의 안내와 저장 전 검사에 쓴다(티켓 20261018_0051)
  const lockedMinimums = lockedMinimumsFrom(await getJamPolicy(supabase))

  return (
    <div className="p-4 md:p-8">
      {/* 제목은 폼의 섹션 열 위에 둔다 — 오른쪽 레일이 페이지 맨 위에서 시작하도록(티켓 20260911_0901) */}
      <BadgeForm
        tribes={tribes}
        itemBooks={itemBooks}
        poiCategories={poiCategories}
        lockedMinimums={lockedMinimums}
        header={
          <div>
            <Link href="/admin/badges" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
              ← 배지 목록
            </Link>
            <h1 className="text-2xl font-bold mt-2">배지 등록</h1>
          </div>
        }
      />
    </div>
  )
}
