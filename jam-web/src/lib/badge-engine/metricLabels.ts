/**
 * 배지 지표(metric) 라벨·단위 배치 조회 — `badge_metric_labels` 테이블 (티켓 20260904_0430)
 *
 * condition_json의 측정 필드 키(distance_km 등)나 day_of_week/season 값(friday, winter
 * 등)에 대응하는 한글 라벨·단위를 여러 키를 한 번에 조회한다. 배지 192개마다 개별 쿼리하면
 * 안 되므로 배치 함수 하나로 둔다.
 *
 * 실제 소비처(예: computeBadgeProgress())는 후속 티켓(2b) 몫 — 이 티켓은 인터페이스 확정과
 * 테이블·시드 데이터까지만 담당한다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { BadgeMetricLabelRow } from '@/types/database'

export type MetricLabel = { label: string; unit: string | null }

/**
 * 주어진 metric_key 목록에 대한 라벨·단위를 한 번의 쿼리로 조회한다.
 *
 * 행이 없는 키는 반환 Map에 아예 포함되지 않는다 — 호출부가 "key 원문을 그대로 노출"하는
 * 폴백을 직접 판단한다(§08 G: 라벨이 안 보이는 게 아니라 아직 안 채워진 게 눈에 띄게 만드는
 * 의도적 설계).
 */
export async function getMetricLabels(keys: string[]): Promise<Map<string, MetricLabel>> {
  const result = new Map<string, MetricLabel>()
  const uniqueKeys = [...new Set(keys)]
  if (uniqueKeys.length === 0) return result

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('badge_metric_labels')
    .select('metric_key, label_ko, unit_ko')
    .in('metric_key', uniqueKeys)

  if (error) {
    console.error('[getMetricLabels] 조회 실패:', error)
    return result
  }

  for (const row of (data ?? []) as Pick<BadgeMetricLabelRow, 'metric_key' | 'label_ko' | 'unit_ko'>[]) {
    result.set(row.metric_key, { label: row.label_ko, unit: row.unit_ko })
  }
  return result
}
