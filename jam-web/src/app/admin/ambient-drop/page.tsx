import { createServiceClient } from '@/lib/supabase/server'
import { getAmbientDropConfig } from '@/lib/ambient-drop/config'
import {
  AMBIENT_DROP_SCHEDULE_UTC_HOUR,
  AMBIENT_DROP_SCHEDULE_UTC_MINUTE,
  isWithinAmbientDropExclusionWindow,
} from '@/lib/ambient-drop/schedule'
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
    config.auto_enabled && isWithinAmbientDropExclusionWindow(new Date(), config.exclusion_window_minutes)

  const scheduleLabel = `매일 ${String(AMBIENT_DROP_SCHEDULE_UTC_HOUR).padStart(2, '0')}:${String(
    AMBIENT_DROP_SCHEDULE_UTC_MINUTE
  ).padStart(2, '0')} UTC (한국시간 익일 ${String((AMBIENT_DROP_SCHEDULE_UTC_HOUR + 9) % 24).padStart(2, '0')}:${String(
    AMBIENT_DROP_SCHEDULE_UTC_MINUTE
  ).padStart(2, '0')})`

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">앰비언트 드랍</h1>
        <p className="text-muted-foreground text-sm mt-1">
          시스템이 POI에 아이템배지를 직접 배치합니다. 자동 스케줄은 {scheduleLabel}에 고정되어
          있어요(변경하려면 코드 배포 필요 — Vercel Hobby 플랜 일 1회 제약). 로직:
          BadgeEngine/BADGE_ENGINE_UNIFIED.md §3.12
        </p>
      </div>
      <AmbientDropForm
        initial={config}
        categories={categories}
        books={books}
        history={history}
        initialBlocked={isBlocked}
        scheduleLabel={scheduleLabel}
      />
    </div>
  )
}
