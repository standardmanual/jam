/**
 * 차량 이용 활동 판정 (티켓 20261103_1115, 운영 로직 16.2절)
 *
 * 동기화의 어뷰징 필터(`checkAbusingFilters`)가 «이 활동은 사람이 낸 속도·이동이 아니다»를 가리는 한 곳이다.
 * 세 규칙을 이 순서로 본다. 하나라도 걸리면 걸러진 사유는 계속 `vehicle_speed` 하나다.
 *
 * 1. 평균 속도 필터 — 구간 감지 뒤 평균 속도가 `vehicle_speed_filter_kmh`를 넘는다(기존 규칙).
 * 2. 교통수단 비율 — 구간 감지가 뺀 거리가 원래 거리의 `transit_ratio_filter_pct`% 이상이다.
 *    시간이 아니라 거리로 센다(GPS가 끊긴 시간은 구간에서 빠지지 않아 시간 비율은 낮게 나온다).
 * 3. 걷기·등산 평균 속도 상한 — 구간을 뺀 뒤 평균 속도가 `walk_avg_max_speed_kmh`를 넘는다.
 *    러닝·자전거에는 적용하지 않는다(이 속도가 정상일 수 있다).
 *
 * 지난 활동은 다시 판정하지 않는다(동기화 때만 쓴다).
 */
import type { NormalizedActivity } from '@/types/strava'
import { DEFAULT_POLICY, effectiveVehicleSpeedFilterKmh, type AbusingPolicy } from './policy'

export type VehicleFilterReason = 'speed' | 'transit_ratio' | 'walk_avg'

export interface VehicleJudgement {
  filtered: boolean
  reason: VehicleFilterReason | null
}

export type VehicleFilterPolicy = Pick<
  AbusingPolicy,
  'vehicle_speed_filter_kmh' | 'transit_ratio_filter_pct' | 'walk_avg_max_speed_kmh'
>

/** 걷기 평균 속도 상한을 적용하는 종목 */
const WALK_LIKE_TYPES: readonly string[] = ['walking', 'hiking']

/** 유한하고 0보다 크면 그 값, 아니면 기본값 — 정책 값이 비정상이어도 모든 활동이 걸리지 않게 한다 */
function positiveOrDefault(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * @param before 교통수단 구간 감지 전 정규화 활동
 * @param after 감지 뒤(종목 불일치 보정까지 마친) 정규화 활동
 */
export function judgeVehicleActivity(args: {
  before: NormalizedActivity
  after: NormalizedActivity
  policy: VehicleFilterPolicy
}): VehicleJudgement {
  const { before, after, policy } = args

  if (after.averageSpeedKmh > effectiveVehicleSpeedFilterKmh(policy)) {
    return { filtered: true, reason: 'speed' }
  }

  // before 거리가 0(또는 비정상)이면 비율을 낼 수 없어 이 규칙은 건너뛴다
  if (Number.isFinite(before.distanceKm) && before.distanceKm > 0) {
    const ratioPct = positiveOrDefault(policy.transit_ratio_filter_pct, DEFAULT_POLICY.transit_ratio_filter_pct)
    // (뺀 거리 / 원래 거리) × 100 >= 기준 — 나눗셈을 피해 경계(정확히 50%)가 부동소수점에 흔들리지 않게 한다
    if ((before.distanceKm - after.distanceKm) * 100 >= ratioPct * before.distanceKm) {
      return { filtered: true, reason: 'transit_ratio' }
    }
  }

  if (after.jamActivityType && WALK_LIKE_TYPES.includes(after.jamActivityType)) {
    const walkMax = positiveOrDefault(policy.walk_avg_max_speed_kmh, DEFAULT_POLICY.walk_avg_max_speed_kmh)
    if (after.averageSpeedKmh > walkMax) {
      return { filtered: true, reason: 'walk_avg' }
    }
  }

  return { filtered: false, reason: null }
}
