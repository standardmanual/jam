/**
 * 행동 횟수 급증 (티켓 20261001_1155 A10, 순수 함수 — DB 접근 없음).
 *
 * 지표 5개(믹스 시도·유저 드랍·픽업·미션 완료·컬렉션 완성)의 전체 유저 원시 건수를 본다. 최근 7일 합계가 직전 `actionSpikeBaselineWeeks`주의
 * 주평균 × `actionSpikeMultiplier` 이상이고 지표별 최소 건수 이상이면 뜬다. 최소 건수가 있는 이유는 평소 건수가 작은 지표가 한두 건만
 * 늘어도 배수만 크게 나오기 때문이다. 해석은 카즈하가 브리핑에서 한다 — 이 신호는 「평소보다 늘었다」는 사실만 알린다.
 *
 * 건수는 조회 함수(`load.ts`)가 센다: 최근 7일 합계와 직전 기간의 주평균을 지표마다 넘겨 받는다.
 */
import { makeSignalResult, type OpsSignalResult } from '@/lib/admin/opsSignals/catalog'
import type { OpsSignalThresholdKey, OpsSignalThresholdValues } from '@/lib/admin/opsSignals/thresholds'

export const ACTION_METRIC_KEYS = ['mix_attempt', 'user_drop', 'pickup', 'mission_complete', 'collection_complete'] as const

export type ActionMetricKey = (typeof ACTION_METRIC_KEYS)[number]

export const ACTION_METRIC_LABELS: Record<ActionMetricKey, string> = {
  mix_attempt: '믹스 시도',
  user_drop: '유저 드랍',
  pickup: '픽업',
  mission_complete: '미션 완료',
  collection_complete: '컬렉션 완성',
}

/** 지표마다 최소 건수를 적은 기준값 키. */
export const ACTION_METRIC_MIN_KEYS: Record<ActionMetricKey, Extract<OpsSignalThresholdKey, `actionSpikeMin${string}`>> = {
  mix_attempt: 'actionSpikeMinMixAttempt',
  user_drop: 'actionSpikeMinUserDrop',
  pickup: 'actionSpikeMinPickup',
  mission_complete: 'actionSpikeMinMissionComplete',
  collection_complete: 'actionSpikeMinCollectionComplete',
}

/** 「최근 7일」의 일수. 주평균과 맞대어 보는 기간이라 기준값 표에 두지 않고 고정한다. */
export const ACTION_RECENT_DAYS = 7

export interface ActionMetricCount {
  /** 최근 7일 합계. */
  recent: number
  /** 직전 기간(`actionSpikeBaselineWeeks`주)의 주평균. */
  baselineWeeklyAverage: number
}

export type ActionCounts = Record<ActionMetricKey, ActionMetricCount>

/** 최근 7일 합계가 직전 주평균 × 배수 이상이고 지표별 최소 건수 이상인 지표마다 결과 한 건을 돌려준다. */
export function evaluateActionSpike(counts: ActionCounts, thresholds: OpsSignalThresholdValues): OpsSignalResult[] {
  const results: OpsSignalResult[] = []
  for (const metric of ACTION_METRIC_KEYS) {
    const { recent, baselineWeeklyAverage } = counts[metric]
    const minCount = thresholds[ACTION_METRIC_MIN_KEYS[metric]]
    if (recent < minCount) continue
    if (recent < baselineWeeklyAverage * thresholds.actionSpikeMultiplier) continue

    const label = ACTION_METRIC_LABELS[metric]
    const weeks = thresholds.actionSpikeBaselineWeeks
    if (baselineWeeklyAverage <= 0) {
      results.push(
        makeSignalResult(`${label}: 최근 ${ACTION_RECENT_DAYS}일 ${recent}건이에요. 직전 ${weeks}주에는 한 건도 없었어요.`)
      )
      continue
    }
    const average = Math.round(baselineWeeklyAverage * 10) / 10
    const ratio = Math.round((recent / baselineWeeklyAverage) * 10) / 10
    results.push(
      makeSignalResult(
        `${label}: 최근 ${ACTION_RECENT_DAYS}일 ${recent}건으로, 직전 ${weeks}주 평균(주 ${average}건)의 ${ratio}배예요.`
      )
    )
  }
  return results
}
