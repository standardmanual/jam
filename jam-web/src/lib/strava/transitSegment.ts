/**
 * 걷기·러닝·자전거 활동에 섞인 교통수단(지하철·버스 등) 구간을 감지해 거리·시간을 재산정한다
 * (티켓 20260909_1012).
 *
 * 배경: 걷기 활동 중간에 지하철을 타는 경우처럼, 전체 평균속도(`averageSpeedKmh`)로는 짧은
 * 교통수단 구간이 걸러지지 않는다(짧은 구간이 전체 평균을 크게 끌어올리지 않기 때문). 이 모듈은
 * `maxSpeedKmh`가 활동 타입별 임계값을 넘는 활동에 한해, `velocity_smooth`(m/s) 스트림에서
 * 그 임계값을 **연속으로 최소 지속시간 이상** 초과하는 구간을 찾아 그 구간의 거리·시간을
 * 제외하고 재산정한다.
 *
 * fail-open: 스트림이 없거나(네트워크 오류·404) 길이가 맞지 않으면 원본 활동을 그대로
 * 돌려준다 — 기존 `averageSpeedKmh` 기준 판정(차량속도필터·걷기 게이트)으로 자연히 폴백된다.
 */
import type { AbusingPolicy } from '@/lib/abusing/policy'
import type { NormalizedActivity } from '@/types/strava'

/** {@link detectAndExcludeTransitSegments}가 소비하는 스트림 — `ActivityStreams`의 부분집합 */
export interface TransitDetectionStreams {
  /** m/s 단위 속도 배열 */
  velocitySmooth: number[] | null
  /** 활동 시작 시점부터 누적된 초 단위 경과 시간 (velocitySmooth와 같은 인덱스) */
  time: number[] | null
}

/** 재산정에 필요한 정책 필드만 뽑은 타입 — 어드민 정책 전체를 몰라도 단위 테스트를 짤 수 있다 */
export type TransitDetectionPolicy = Pick<
  AbusingPolicy,
  | 'transit_walk_max_speed_kmh'
  | 'transit_run_max_speed_kmh'
  | 'transit_cycling_max_speed_kmh'
  | 'transit_segment_min_duration_sec'
>

/** jamActivityType → 정책의 임계값 필드 매핑. 걷기·러닝·자전거만 대상이다(티켓 범위) */
const THRESHOLD_FIELD_BY_ACTIVITY_TYPE: Partial<
  Record<string, keyof TransitDetectionPolicy>
> = {
  walking: 'transit_walk_max_speed_kmh',
  running: 'transit_run_max_speed_kmh',
  cycling: 'transit_cycling_max_speed_kmh',
}

/**
 * 활동의 거리·시간·평균속도를 교통수단 구간을 제외하고 재산정한다.
 *
 * @param activity `normalizeActivity()`가 만든 정규화 활동
 * @param streams Strava velocity_smooth·time 스트림. null이면(조회 실패) fail-open — 원본 반환
 * @param policy 활동 타입별 임계값·최소 지속시간 (어뷰징 정책)
 * @returns 재산정된 새 `NormalizedActivity`, 또는 재산정 대상이 아니면 원본 그대로(참조 동일)
 */
export function detectAndExcludeTransitSegments(
  activity: NormalizedActivity,
  streams: TransitDetectionStreams | null,
  policy: TransitDetectionPolicy
): NormalizedActivity {
  const thresholdField = THRESHOLD_FIELD_BY_ACTIVITY_TYPE[activity.jamActivityType ?? '']
  if (!thresholdField) return activity // 걷기·러닝·자전거가 아니면 대상 아님

  const thresholdKmh = policy[thresholdField]
  if (!Number.isFinite(thresholdKmh) || thresholdKmh <= 0) return activity // 정책값 이상 — 페일세이프

  // maxSpeedKmh가 없거나 임계값 이하면 애초에 교통수단 구간이 섞였을 가능성이 낮다 —
  // 불필요하게 스트림을 훑지 않는다.
  if (activity.maxSpeedKmh === undefined || activity.maxSpeedKmh <= thresholdKmh) return activity

  // fail-open — 스트림 조회 실패·부족 시 기존 averageSpeedKmh 기준 판정으로 되돌아간다.
  if (!streams?.velocitySmooth || !streams.time) return activity
  const { velocitySmooth, time } = streams
  if (velocitySmooth.length < 2 || time.length !== velocitySmooth.length) return activity

  const minDurationSec = policy.transit_segment_min_duration_sec

  let excludeDistanceM = 0
  let excludeDurationSec = 0
  let curDistanceM = 0
  let curDurationSec = 0
  let inSegment = false

  const flush = () => {
    if (inSegment && curDurationSec >= minDurationSec) {
      excludeDistanceM += curDistanceM
      excludeDurationSec += curDurationSec
    }
    inSegment = false
    curDistanceM = 0
    curDurationSec = 0
  }

  for (let i = 0; i < time.length - 1; i++) {
    const dt = time[i + 1] - time[i]
    const v0 = velocitySmooth[i]
    const v1 = velocitySmooth[i + 1]
    if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(v0) || !Number.isFinite(v1)) {
      // 비정상 구간(역행하는 타임스탬프·결측값)은 이어지던 구간을 끊는다 — 안전 측 처리
      flush()
      continue
    }
    // 구간 대표 속도는 두 지점의 평균(사다리꼴 적분과 동일한 근사) — velocity_smooth 자체가
    // 이미 Strava 쪽에서 스무딩된 값이라 순간값 하나만 쓰는 것보다 안정적이다.
    const avgSpeedMs = (v0 + v1) / 2
    const avgSpeedKmh = avgSpeedMs * 3.6
    if (avgSpeedKmh > thresholdKmh) {
      inSegment = true
      curDistanceM += avgSpeedMs * dt
      curDurationSec += dt
    } else {
      flush()
    }
  }
  flush()

  if (excludeDurationSec <= 0) return activity // 30초 이상 지속 구간 없음 — 재산정 불필요

  const newMovingTimeSec = Math.max(0, Math.round(activity.movingTimeSec - excludeDurationSec))
  const newDistanceKm = Math.max(0, activity.distanceKm - excludeDistanceM / 1000)
  const newAverageSpeedKmh = newMovingTimeSec > 0 ? newDistanceKm / (newMovingTimeSec / 3600) : 0

  return {
    ...activity,
    distanceKm: newDistanceKm,
    movingTimeSec: newMovingTimeSec,
    averageSpeedKmh: newAverageSpeedKmh,
  }
}
