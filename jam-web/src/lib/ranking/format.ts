/**
 * 랭킹보드 정렬 지표 값 표시 포맷터 (티켓 20260911_1440)
 *
 * `lib/missions/format.ts`의 `formatMissionProgress`(미션 진행도 전용)를 대체하지 않는다 —
 * `metric_type='mission_progress'`일 때는 기존 미션 상세 화면과 **같은 문구**가 나가야 하므로
 * 그 함수를 그대로 감싸 호출한다(단위 접미사 없음 — 기존 랭킹 리스트 표시 관례 그대로).
 *
 * `condition_field`·`badge_count`는 미션이라는 맥락이 없는 홈 피드 카드라 단위를 붙인다 —
 * 배지 조건 레지스트리의 칩·상세 문구 관례(`conditionRegistry.ts`, 예: `12.3km`·`7회`·
 * `128명`)와 동일하게 숫자와 단위 사이에 공백을 두지 않는다.
 */
import { formatMissionProgress } from '@/lib/missions/format'
import { getConditionField } from '@/lib/badge-engine/conditionRegistry'
import type { MissionType, RankingModeMetricType } from '@/types/database'

export interface FormatRankingMetricValueOptions {
  /** metric_type='mission_progress'일 때 필요 */
  missionType?: MissionType | null
  /** metric_type='condition_field'일 때 필요 — 단위·소수 여부를 레지스트리에서 읽는다 */
  conditionFieldKey?: string | null
}

function formatNumber(value: number, decimalKey: boolean): string {
  return decimalKey ? value.toFixed(1) : String(Math.floor(value))
}

export function formatRankingMetricValue(
  metricType: RankingModeMetricType,
  value: number,
  options: FormatRankingMetricValueOptions = {}
): string {
  if (metricType === 'mission_progress') {
    return formatMissionProgress(value, options.missionType ?? '')
  }
  if (metricType === 'badge_count') {
    return `${formatNumber(value, false)}개`
  }
  // condition_field
  const key = options.conditionFieldKey ?? undefined
  const meta = key ? getConditionField(key) : undefined
  const formatted = formatNumber(value, key === 'distance_km')
  return meta?.unit ? `${formatted}${meta.unit}` : formatted
}
