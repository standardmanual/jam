import { createServiceClient } from '@/lib/supabase/server'
import BadgeMetricLabelsManager from './BadgeMetricLabelsManager'
import type { BadgeMetricLabelRow } from '@/types/database'

export default async function AdminBadgeMetricLabelsPage() {
  const supabase = createServiceClient()
  const { data: labelsRaw } = await supabase.from('badge_metric_labels').select('*').order('metric_key')
  const labels = (labelsRaw ?? []) as BadgeMetricLabelRow[]

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">배지 지표 라벨</h1>
        <p className="text-muted-foreground text-sm mt-1">
          배지 조건 필드(distance_km 등)와 요일/계절 값(friday, winter 등)에 대응하는 한글
          라벨·단위입니다. 배지 트리 진행 화면이 이 값을 조회해 축 라벨을 채웁니다 — 여기
          없는 키는 원문 그대로 노출됩니다. 저장 즉시 반영되며 배포가 필요 없습니다.
        </p>
      </div>
      <BadgeMetricLabelsManager initial={labels} />
    </div>
  )
}
