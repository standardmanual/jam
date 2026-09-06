import { createServiceClient } from '@/lib/supabase/server'
import { getAmbientDropConfig } from '@/lib/ambient-drop/config'
import { isWithinAmbientDropExclusionWindow } from '@/lib/ambient-drop/schedule'
import type { PoiCategoryRow, ItemBookRow } from '@/types/database'
import AmbientDropForm, { type AmbientDropHistoryEntry } from './AmbientDropForm'

export default async function AdminAmbientDropPage() {
  const supabase = createServiceClient()
  const config = await getAmbientDropConfig()

  const [{ data: categoriesRaw }, { data: booksRaw }, { data: historyRaw }] = await Promise.all([
    supabase.from('poi_categories').select('slug, label').order('label'),
    supabase.from('item_books').select('id, name').eq('is_active', true).order('name'),
    supabase
      .from('engine_decision_log')
      .select('id, created_at, payload')
      .eq('engine', 'drop')
      .eq('event', 'ambient_batch_result')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const categories = (categoriesRaw ?? []) as Pick<PoiCategoryRow, 'slug' | 'label'>[]
  const books = (booksRaw ?? []) as Pick<ItemBookRow, 'id' | 'name'>[]
  const history = (historyRaw ?? []) as AmbientDropHistoryEntry[]

  const isBlocked =
    config.auto_enabled &&
    isWithinAmbientDropExclusionWindow(new Date(), config.schedule_hour_kst, config.exclusion_window_minutes)

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">앰비언트 드랍</h1>
        <p className="text-muted-foreground text-sm mt-1">
          시스템이 POI에 아이템배지를 직접 배치해요. 배포 시각(KST)은 아래 「배포 트리거」에서
          정해요. 로직: BadgeEngine/BADGE_ENGINE_UNIFIED.md §3.12
        </p>
      </div>
      <AmbientDropForm
        initial={config}
        categories={categories}
        books={books}
        history={history}
        initialBlocked={isBlocked}
      />
    </div>
  )
}
