import { createServiceClient } from '@/lib/supabase/server'
import { getAmbientDropConfig } from '@/lib/ambient-drop/config'
import { isWithinAmbientDropExclusionWindow } from '@/lib/ambient-drop/schedule'
import { listAmbientDropSchedules } from '@/lib/ambient-drop/scheduleList'
import type { PoiCategoryRow, ItemBookRow } from '@/types/database'
import AmbientDropForm, { type AmbientDropHistoryEntry } from './AmbientDropForm'
import ScheduleSection from './ScheduleSection'

export default async function AdminAmbientDropPage() {
  const supabase = createServiceClient()
  const config = await getAmbientDropConfig()

  const now = new Date()
  const [{ data: categoriesRaw }, { data: booksRaw }, { data: historyRaw }, { data: tribesRaw }, schedules] = await Promise.all([
    supabase.from('poi_categories').select('slug, label').order('label'),
    supabase.from('item_books').select('id, name, valid_from, valid_until').eq('is_active', true).order('name'),
    supabase
      .from('engine_decision_log')
      .select('id, created_at, payload')
      .eq('engine', 'drop')
      .eq('event', 'ambient_batch_result')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('tribes').select('id, name').order('name'),
    listAmbientDropSchedules(supabase, now),
  ])

  const categories = (categoriesRaw ?? []) as Pick<PoiCategoryRow, 'slug' | 'label'>[]
  const books = (booksRaw ?? []) as Pick<ItemBookRow, 'id' | 'name' | 'valid_from' | 'valid_until'>[]
  const tribes = (tribesRaw ?? []) as { id: string; name: string }[]
  const history = (historyRaw ?? []) as AmbientDropHistoryEntry[]

  const isBlocked =
    config.auto_enabled &&
    isWithinAmbientDropExclusionWindow(now, config.schedule_hour_kst, config.exclusion_window_minutes)

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">앰비언트 드랍</h1>
        <p className="text-muted-foreground text-sm mt-1">
          시스템이 POI에 아이템배지를 직접 배치해요. 배포 시각(KST)은 아래 「배포 트리거」에서
          정해요. 로직: docs/specs/badge-engine/BADGE_ENGINE_UNIFIED.md §3.12
        </p>
      </div>
      <AmbientDropForm
        initial={config}
        categories={categories}
        books={books}
        history={history}
        initialBlocked={isBlocked}
        scheduleSection={
          <ScheduleSection
            initialItems={schedules.ok ? schedules.schedules : []}
            initialNames={schedules.ok ? schedules.names : { pois: {}, badges: {}, collections: {} }}
            initialError={schedules.ok ? null : schedules.error}
            nowIso={now.toISOString()}
            categories={categories}
            books={books}
            tribes={tribes}
          />
        }
      />
    </div>
  )
}
