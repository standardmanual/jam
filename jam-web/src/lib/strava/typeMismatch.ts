/**
 * 종목과 움직임이 맞지 않는 활동을 걷기로 바꾼다 (티켓 20261017_1421 2회, 운영 로직 16.2절).
 *
 * 러닝으로 기록했는데 평균 속도가 `mismatch_run_min_speed_kmh`(기본 6km/h)보다 느리거나, 자전거로 기록했는데
 * 평균 속도가 `mismatch_cycling_min_speed_kmh`(기본 10km/h)보다 느리면 걷기로 계산한다. 트레일러닝·등산·걷기는
 * 판정하지 않는다. 걷기(가벼움) 강도로 잼에 반영하는 일은 2-3 티켓의 몫이라 여기서는 종목 값만 바꾸고,
 * 바꾼 사실과 원래 종목을 `source_meta`에 남길 수 있게 돌려준다.
 *
 * 순수 함수다 — 평균 속도는 교통수단 구간을 뺀 뒤의 값(`activity.averageSpeedKmh`)을 그대로 쓴다.
 */
import type { AbusingPolicy } from '@/lib/abusing/policy'
import type { NormalizedActivity } from '@/types/strava'

/** 판정에 쓰는 정책 필드만 뽑은 타입 — 정책 전체를 몰라도 단위 시험을 짤 수 있다 */
export type TypeMismatchPolicy = Pick<
  AbusingPolicy,
  'mismatch_run_min_speed_kmh' | 'mismatch_cycling_min_speed_kmh'
>

/** 판정 대상 종목 → 정책 기준값 칸. 이 표에 없는 종목(트레일러닝·등산·걷기)은 판정하지 않는다 */
const MIN_SPEED_FIELD_BY_ACTIVITY_TYPE: Record<string, keyof TypeMismatchPolicy> = {
  running: 'mismatch_run_min_speed_kmh',
  cycling: 'mismatch_cycling_min_speed_kmh',
}

export interface TypeMismatchResult {
  /** 걷기로 바꿨으면 바뀐 활동, 아니면 원본 그대로(참조 동일) */
  activity: NormalizedActivity
  /** 바꿨을 때만 원래 종목('running' | 'cycling'), 아니면 null */
  changedFrom: 'running' | 'cycling' | null
}

export function applyTypeMismatch(
  activity: NormalizedActivity,
  policy: TypeMismatchPolicy
): TypeMismatchResult {
  const unchanged: TypeMismatchResult = { activity, changedFrom: null }
  const field = MIN_SPEED_FIELD_BY_ACTIVITY_TYPE[activity.jamActivityType ?? '']
  if (!field) return unchanged

  const minSpeedKmh = policy[field]
  // 정책값 이상 — 페일세이프(바꾸지 않는다). 정상 경로는 로더가 비정상 값을 기본값으로 대체한다
  if (!Number.isFinite(minSpeedKmh) || minSpeedKmh <= 0) return unchanged
  if (!Number.isFinite(activity.averageSpeedKmh) || !(activity.averageSpeedKmh < minSpeedKmh)) return unchanged

  return {
    activity: { ...activity, jamActivityType: 'walking' },
    changedFrom: activity.jamActivityType as 'running' | 'cycling',
  }
}
