import { createServiceClient } from '@/lib/supabase/server'
import BadgeMetricLabelsManager from './BadgeMetricLabelsManager'
import type { BadgeMetricLabelRow } from '@/types/database'

export default async function AdminBadgeMetricLabelsPage() {
  const supabase = createServiceClient()
  const { data: labelsRaw } = await supabase.from('badge_metric_labels').select('*').order('metric_key')
  const labels = (labelsRaw ?? []) as BadgeMetricLabelRow[]

  return (
    <div className="w-full p-4 md:p-8 space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">지표 라벨</h1>
        <p className="text-muted-foreground text-sm mt-1 break-keep wrap-break-word text-pretty">
          배지 조건 필드와 요일·계절 값에 대응하는 한글 라벨과 단위를 관리해요. 저장하면 즉시 반영돼요
        </p>
      </div>
      <BadgeMetricLabelsManager initial={labels} />
    </div>
  )
}
