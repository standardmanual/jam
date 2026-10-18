/**
 * 걷기·러닝·트레일 러닝·등산·자전거 활동에 섞인 교통수단(지하철·버스 등) 구간을 감지해 거리·시간을
 * 재산정한다 (티켓 20260909_1012, trail_running 추가는 티켓 20260909_1031).
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

/**
 * jamActivityType → 정책의 임계값 필드 매핑. 인정하는 다섯 종목(걷기·러닝·트레일 러닝·등산·자전거)이 대상이다.
 * trail_running은 러닝과 동일한 임계값(transit_run_max_speed_kmh)을 재사용한다 — 별도
 * 임계값 신설이나 어드민 필드 추가 없이 러닝과 같은 정책을 적용하기로 결정했다(티켓 20260909_1031).
 * hiking(등산)도 걷기 임계값(transit_walk_max_speed_kmh)을 쓴다(티켓 20261017_1421, 운영 로직 16.2절).
 */
const THRESHOLD_FIELD_BY_ACTIVITY_TYPE: Partial<
  Record<string, keyof TransitDetectionPolicy>
> = {
  walking: 'transit_walk_max_speed_kmh',
  hiking: 'transit_walk_max_speed_kmh',
  running: 'transit_run_max_speed_kmh',
  trail_running: 'transit_run_max_speed_kmh',
  cycling: 'transit_cycling_max_speed_kmh',
}

/**
 * 구간 검사에 쓸 종목 기준 속도(km/h) — 검사가 필요하면 그 값, 아니면 null.
 * 기준을 넘는 최대 속도가 있어야만 «기준 속도를 30초 넘게 이어서 넘는 구간»이 있을 수 있으므로,
 * 최대 속도가 기준 이하(또는 없음)이면 스트림을 훑어도 결과가 같아 null이다(최대 속도 사전 거름).
 * {@link detectAndExcludeTransitSegments}가 같은 함수를 써서 판정 결과와 호출 조건이 어긋나지 않는다.
 */
function transitThresholdKmh(
  activity: NormalizedActivity,
  policy: TransitDetectionPolicy
): number | null {
  const thresholdField = THRESHOLD_FIELD_BY_ACTIVITY_TYPE[activity.jamActivityType ?? '']
  if (!thresholdField) return null // 구간 검사 대상 종목이 아님

  const thresholdKmh = policy[thresholdField]
  if (!Number.isFinite(thresholdKmh) || thresholdKmh <= 0) return null // 정책값 이상 — 페일세이프

  // maxSpeedKmh가 없거나 임계값 이하면 애초에 교통수단 구간이 섞였을 가능성이 낮다 —
  // 불필요하게 스트림을 훑지 않는다.
  if (activity.maxSpeedKmh === undefined || activity.maxSpeedKmh <= thresholdKmh) return null
  return thresholdKmh
}

/**
 * 이 활동의 구간 검사에 Streams(속도·시간)가 필요한지 — 호출부가 Strava Streams 조회 여부를 정할 때 쓴다.
 * false이면 {@link detectAndExcludeTransitSegments}는 스트림과 무관하게 원본을 그대로 돌려준다.
 */
export function needsTransitStreams(activity: NormalizedActivity, policy: TransitDetectionPolicy): boolean {
  return transitThresholdKmh(activity, policy) !== null
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
  // 대상 종목이 아니거나 정책값이 이상하거나 최대 속도가 기준 이하면 원본 그대로(최대 속도 사전 거름)
  const thresholdKmh = transitThresholdKmh(activity, policy)
  if (thresholdKmh === null) return activity

  // fail-open — 스트림 조회 실패·부족 시 기존 averageSpeedKmh 기준 판정으로 되돌아간다.
  if (!streams?.velocitySmooth || !streams.time) return activity
  const { velocitySmooth, time } = streams
  if (velocitySmooth.length < 2 || time.length !== velocitySmooth.length) return activity

  const minDurationSec = policy.transit_segment_min_duration_sec

  let excludeDistanceM = 0
  let excludeDurationSec = 0
  let curDistanceM = 0
  let curDurationSec = 0
  let curMaxSpeedMs = 0
  let inSegment = false
  // 뺀 구간을 제외하고 남은 구간의 최대 속도(m/s) — 최고 속도 조건(`max_speed_kmh`)이 교통수단 속도를 보지 않게 한다.
  let keptMaxSpeedMs = 0

  const flush = () => {
    if (inSegment) {
      if (curDurationSec >= minDurationSec) {
        excludeDistanceM += curDistanceM
        excludeDurationSec += curDurationSec
      } else {
        // 지속시간이 짧아 뺀 구간이 아니다 — 이 구간의 속도는 남는다
        keptMaxSpeedMs = Math.max(keptMaxSpeedMs, curMaxSpeedMs)
      }
    }
    inSegment = false
    curDistanceM = 0
    curDurationSec = 0
    curMaxSpeedMs = 0
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
      curMaxSpeedMs = Math.max(curMaxSpeedMs, avgSpeedMs)
    } else {
      flush()
      keptMaxSpeedMs = Math.max(keptMaxSpeedMs, avgSpeedMs)
    }
  }
  flush()

  if (excludeDurationSec <= 0) return activity // 30초 이상 지속 구간 없음 — 재산정 불필요

  const newMovingTimeSec = Math.max(0, Math.round(activity.movingTimeSec - excludeDurationSec))
  const newDistanceKm = Math.max(0, activity.distanceKm - excludeDistanceM / 1000)
  const newAverageSpeedKmh = newMovingTimeSec > 0 ? newDistanceKm / (newMovingTimeSec / 3600) : 0
  // 최고 속도도 교통수단 구간을 뺀다(운영 로직 3장·10장: 모든 조건의 판정에서 교통수단 구간을 뺀다, 티켓 20261018_1815 3회).
  // 남은 구간의 평균 속도 최댓값을 상한으로 쓰고, 원래 값보다 커지지는 않게 한다(스무딩 값이라 실제 순간 최고보다 낮을 수 있다).
  // `transitExcludedSec`는 이 활동에서 구간을 뺐다는 표시다 — 확장 필드 백필이 최고 속도를 원본으로 되돌리지 않게 한다.
  const maxSpeedKmh =
    activity.maxSpeedKmh === undefined ? undefined : Math.min(activity.maxSpeedKmh, keptMaxSpeedMs * 3.6)

  return {
    ...activity,
    distanceKm: newDistanceKm,
    movingTimeSec: newMovingTimeSec,
    averageSpeedKmh: newAverageSpeedKmh,
    ...(maxSpeedKmh === undefined ? {} : { maxSpeedKmh }),
    transitExcludedSec: Math.round(excludeDurationSec),
  }
}
