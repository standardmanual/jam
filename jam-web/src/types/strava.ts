/**
 * Strava API 응답 타입 정의
 * 참조: https://developers.strava.com/docs/reference/
 * 주의: any 사용 금지 — 모든 필드 명시적으로 정의
 */

// =========================================
// Strava OAuth 토큰 응답
// =========================================
export interface StravaTokenResponse {
  token_type: string
  expires_at: number   // Unix timestamp
  expires_in: number   // 초 단위
  refresh_token: string
  access_token: string
  athlete: StravaAthlete
}

export interface StravaRefreshResponse {
  token_type: string
  access_token: string
  expires_at: number
  expires_in: number
  refresh_token: string
}

// =========================================
// Strava 운동선수 (Athlete) 정보
// =========================================
export interface StravaAthlete {
  id: number
  username: string | null
  resource_state: 1 | 2 | 3
  firstname: string
  lastname: string
  city: string | null
  state: string | null
  country: string | null
  sex: 'M' | 'F' | null
  premium: boolean
  created_at: string  // ISO 8601
  updated_at: string  // ISO 8601
  badge_type_id: number
  profile_medium: string  // URL
  profile: string         // URL
  friend: null
  follower: null
}

// =========================================
// Strava 활동 (Activity) — 목록 조회용 (resource_state: 2)
// =========================================
export interface StravaSummaryActivity {
  id: number
  resource_state: 2
  name: string
  distance: number          // 미터
  moving_time: number       // 초
  elapsed_time: number      // 초
  total_elevation_gain: number  // 미터
  type: StravaActivityType
  sport_type: string
  start_date: string        // ISO 8601 UTC
  start_date_local: string  // 로컬 시각
  timezone: string
  utc_offset: number
  location_city: string | null
  location_state: string | null
  location_country: string | null
  achievement_count: number
  kudos_count: number
  comment_count: number
  athlete_count: number
  photo_count: number
  map: StravaMap
  trainer: boolean
  commute: boolean
  manual: boolean
  private: boolean
  visibility: 'everyone' | 'followers_only' | 'only_me'
  flagged: boolean
  gear_id: string | null
  start_latlng: [number, number] | []
  end_latlng: [number, number] | []
  average_speed: number     // m/s
  max_speed: number         // m/s
  average_cadence?: number
  average_watts?: number
  max_watts?: number
  weighted_average_watts?: number
  kilojoules?: number
  device_watts?: boolean
  has_heartrate: boolean
  average_heartrate?: number
  max_heartrate?: number
  heartrate_opt_out: boolean
  display_hide_heartrate_option: boolean
  elev_high?: number
  elev_low?: number
  upload_id: number | null
  upload_id_str: string | null
  external_id: string | null
  pr_count: number
  total_photo_count: number
  has_kudoed: boolean
  workout_type: number | null
  suffer_score: number | null
  average_temp?: number | null   // 섭씨, Strava가 제공하는 경우만 존재
}

// =========================================
// Strava 활동 (Activity) — 단일 조회용 (resource_state: 3, Detailed)
// =========================================
/**
 * 단일 활동 상세 응답의 구간 분할(1km / 1mile 단위).
 * 목록(Summary) 응답에는 **오지 않는다** — 상세 조회에서만 채워진다.
 */
export interface StravaSplit {
  distance: number            // 미터
  elapsed_time: number        // 초
  elevation_difference: number | null  // 미터
  moving_time: number         // 초
  split: number               // 1부터 시작하는 구간 번호
  average_speed: number       // m/s
  average_heartrate?: number
  pace_zone?: number
}

/**
 * `GET /activities/{id}` 응답 (Detailed). Summary의 모든 필드를 포함하고 상세 전용 필드가 더 붙는다.
 *
 * `getActivityById()`가 이 엔드포인트를 호출하면서도 반환 타입을 `StravaSummaryActivity`로
 * 잘못 좁혀 두고 있었다(티켓 20260905_0029). 그 탓에 상세 전용 필드가 타입에 아예 존재하지
 * 않아 컴파일 단계에서 접근이 막혔다.
 *
 * ⚠️ `splits_metric`은 선언만 해 둔다 — **수집·저장하지 않는다.** 활동 1건당 상세 호출이
 * 1회 더 들어 백필 비용이 러닝만 697회다. `negative_split` 조건은 별도 티켓으로 분리됐고
 * 그때까지 레지스트리에서 `evaluation: 'pending'`으로 남아 fail-closed가 막는다.
 */
export interface StravaDetailedActivity extends Omit<StravaSummaryActivity, 'resource_state'> {
  resource_state: 3
  description: string | null
  calories?: number
  /** 1km 단위 구간 분할 — `negative_split` 조건의 원천 (현재 미수집) */
  splits_metric?: StravaSplit[]
  /** 1mile 단위 구간 분할 */
  splits_standard?: StravaSplit[]
  /** 기록 기기명. 목록 응답에는 없다 */
  device_name?: string | null
  embed_token?: string
  photos?: unknown
  gear?: unknown
  laps?: unknown[]
  best_efforts?: unknown[]
  segment_efforts?: unknown[]
}

// Strava 활동 타입 (JAM!에서 사용하는 주요 타입)
export type StravaActivityType =
  | 'Ride'
  | 'Run'
  | 'Walk'
  | 'Hike'
  | 'VirtualRide'
  | 'EBikeRide'
  | 'Swim'
  | 'Yoga'
  | 'WeightTraining'
  | 'Workout'
  | string  // 기타 Strava 지원 타입

// JAM! 활동 종류 ↔ Strava 활동 타입(type) 매핑
// 주의: Strava `type`은 러닝 세분화가 없어 Run은 기본적으로 running(로드 러닝)으로 처리한다.
//       트레일 러닝 구분은 sport_type을 우선 참조해야 하므로 getJamActivityType()를 사용할 것.
export const STRAVA_TYPE_TO_JAM: Record<string, string> = {
  Ride: 'cycling',
  EBikeRide: 'cycling',
  VirtualRide: 'cycling',
  Run: 'running',
  VirtualRun: 'running',
  Hike: 'hiking',
  Walk: 'walking',
}

// JAM! 활동 종류 ↔ Strava sport_type 매핑 (더 세분화된 필드, type보다 우선)
export const STRAVA_SPORT_TYPE_TO_JAM: Record<string, string> = {
  TrailRun: 'trail_running',
  TrailRunning: 'trail_running',
  Run: 'running',
  VirtualRun: 'running',
  Ride: 'cycling',
  MountainBikeRide: 'cycling',
  GravelRide: 'cycling',
  VirtualRide: 'cycling',
  EBikeRide: 'cycling',
  Hike: 'hiking',
  Walk: 'walking',
}

/**
 * Strava 활동의 sport_type을 우선 참조하여 JAM! 활동 종류를 결정한다.
 * sport_type이 매핑에 없으면 type 기반 매핑으로 폴백한다.
 */
export function getJamActivityType(activity: {
  type: string
  sport_type?: string | null
}): string | null {
  if (activity.sport_type && STRAVA_SPORT_TYPE_TO_JAM[activity.sport_type]) {
    return STRAVA_SPORT_TYPE_TO_JAM[activity.sport_type]
  }
  return STRAVA_TYPE_TO_JAM[activity.type] ?? null
}

// =========================================
// Strava 맵 (요약 폴리라인)
// =========================================
export interface StravaMap {
  id: string
  summary_polyline: string | null
  resource_state: number
}

// =========================================
// Strava Webhook 이벤트 (Phase 2+ 준비)
// =========================================
export interface StravaWebhookEvent {
  object_type: 'activity' | 'athlete'
  object_id: number
  aspect_type: 'create' | 'update' | 'delete'
  updates: Record<string, string>
  owner_id: number
  subscription_id: number
  event_time: number  // Unix timestamp
}

// =========================================
// 내부 정규화 타입 (Strava → JAM! 변환)
// =========================================
export interface NormalizedActivity {
  stravaId: number
  name: string
  distanceKm: number
  movingTimeSec: number
  elevationGainM: number
  jamActivityType: string | null  // cycling | running | hiking | walking | null
  startDate: string               // ISO 8601 UTC
  startDateLocal?: string         // Strava start_date_local (현지시간, time_range 평가에 사용)
  averageSpeedKmh: number
  startLatLng: [number, number] | null
  endLatLng: [number, number] | null
  weatherTempC?: number | null    // Strava average_temp (섭씨, 없으면 null)

  // ── v5 확장 6필드 (티켓 20260905_0029) ─────────────────────────────────
  //
  // 전부 Strava **Summary 응답**(목록 엔드포인트)에 이미 오던 값이다. `normalizeActivity`가
  // 읽지 않아 버려지고 있었을 뿐이라 추가 API 호출이 없다.
  //
  // ⚠️ **값이 없으면 키 자체를 넣지 않는다** — `null`을 넣지 않는다. 심박계·파워미터가 없는
  // 유저의 활동이 «데이터 없음 = 카운트 안 함»으로 자연히 동작해야 하고, 화면에
  // 「심박 데이터가 있는 활동에서만 계산돼요」 같은 안내를 넣지 않기로 확정했다(마스터 0026).
  // `weatherTempC`가 `null`을 저장하는 기존 관례를 따르지 않는 이유이기도 하다.
  //
  // 조건 필드(snake_case) ↔ 이 필드(camelCase)의 대응은 `conditionRegistry.ts`의
  // `activityField`가 단일 출처다. 이름이 어긋나면 `condition-registry.test.ts`가 깨진다.

  /** Strava `elapsed_time`(초). 휴식 시간 = elapsedTimeSec - movingTimeSec */
  elapsedTimeSec?: number
  /** Strava `max_speed`(m/s)를 km/h로 변환한 값 — 조건 `max_speed_kmh` */
  maxSpeedKmh?: number
  /** Strava `elev_high`(m) — 조건 `max_elevation_m`. 고도 상승량(elevationGainM)이 아니라 도달 고도다 */
  maxElevationM?: number
  /** Strava `average_heartrate`(bpm) — 조건 `avg_heartrate_bpm` */
  avgHeartrateBpm?: number
  /** Strava `average_watts`(W) — 조건 `avg_watts` */
  avgWatts?: number
  /** Strava `average_cadence` — 조건 `avg_cadence`. 단위가 종목마다 다르다(러닝 spm · 자전거 rpm) */
  avgCadence?: number

  // ── 아래 3필드는 티켓 20260905_0029 리뷰에서 추가됐다 ─────────────────
  // 전부 **같은 Summary 응답에 이미 오던 값**이라 지금 담는 비용이 0이다. 나중에 필요해지면
  // 873행을 다시 훑어야 하므로(백필 재실행), 재백필 위험을 없애는 쪽을 택했다.
  /** Strava `max_heartrate`(bpm). 평균과 별개 축이다 */
  maxHeartrateBpm?: number
  /** Strava `weighted_average_watts`(W). 이른바 정규화 파워 */
  weightedAvgWatts?: number
  /**
   * Strava `device_watts` — **파워가 실측인지 추정인지**를 가른다.
   * Strava는 파워미터가 없는 활동에도 `average_watts`를 추정값으로 채워 준다. 이 값이 없으면
   * 「실측 파워만 인정」 정책을 나중에 세울 수 없다(티켓 20260905_0029 개선 리뷰).
   * 조건 평가에서 쓸지는 티켓 20260905_0030이 정한다.
   */
  deviceWatts?: boolean
}

/** v5 확장 9필드만 떼어낸 조각. 값이 없는 필드는 **키 자체가 없다** */
export type ExtendedActivityFields = Pick<
  NormalizedActivity,
  | 'elapsedTimeSec'
  | 'maxSpeedKmh'
  | 'maxElevationM'
  | 'avgHeartrateBpm'
  | 'avgWatts'
  | 'avgCadence'
  | 'maxHeartrateBpm'
  | 'weightedAvgWatts'
  | 'deviceWatts'
>

/** 확장 필드 키 목록 — 백필이 «무엇을 덮어쓸 것인가»를 이 목록으로 한정한다 */
export const EXTENDED_ACTIVITY_FIELD_KEYS = [
  'elapsedTimeSec',
  'maxSpeedKmh',
  'maxElevationM',
  'avgHeartrateBpm',
  'avgWatts',
  'avgCadence',
  'maxHeartrateBpm',
  'weightedAvgWatts',
  'deviceWatts',
] as const satisfies readonly (keyof ExtendedActivityFields)[]

/**
 * 확장 필드 전용 «있으면 넣고 없으면 키를 만들지 않는다» 헬퍼.
 *
 * `?? null` 관례(`weatherTempC`)를 쓰지 않는 이유는 티켓 20260905_0029의 확정 사항이다 —
 * 심박계·파워미터가 없는 유저의 활동에 `null`을 박아 두면 조건 평가가 «값이 0»과
 * «측정 안 됨»을 구분하려고 매번 분기해야 한다. 키 자체가 없으면 `undefined` 하나로 수렴한다.
 *
 * `0`은 **버리지 않는다** — Strava가 실제로 0을 돌려준 경우(해수면 고도 0m 등)와 필드가
 * 오지 않은 경우는 다른 사실이다. 유한한 숫자가 아니면(undefined·null·NaN) 키를 만들지 않는다.
 */
function putIfNumber(
  target: Record<string, unknown>,
  key: string,
  value: number | null | undefined,
  transform: (v: number) => number = (v) => v
): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) return
  target[key] = transform(value)
}

/** `putIfNumber`의 불리언 짝. `deviceWatts`처럼 값 자체가 참/거짓인 필드에 쓴다 */
function putIfBoolean(target: Record<string, unknown>, key: string, value: boolean | undefined): void {
  if (typeof value !== 'boolean') return
  target[key] = value
}

/**
 * Strava Summary 응답 → v5 확장 9필드 (티켓 20260905_0029).
 *
 * 전부 목록 엔드포인트 응답에 이미 오던 값이라 추가 API 호출이 없다.
 * `normalizeActivity`(신규 싱크)와 백필이 **같은 함수를 쓴다** — 두 경로가 갈라지면
 * 백필된 활동과 신규 활동의 형태가 달라진다.
 */
export function extractExtendedActivityFields(
  activity: Pick<
    StravaSummaryActivity,
    | 'elapsed_time'
    | 'max_speed'
    | 'elev_high'
    | 'average_heartrate'
    | 'average_watts'
    | 'average_cadence'
    | 'max_heartrate'
    | 'weighted_average_watts'
    | 'device_watts'
  >
): ExtendedActivityFields {
  const out: Record<string, unknown> = {}
  putIfNumber(out, 'elapsedTimeSec', activity.elapsed_time)
  // m/s → km/h. 평균 속도(averageSpeedKmh)와 같은 변환·같은 반올림을 쓴다
  putIfNumber(out, 'maxSpeedKmh', activity.max_speed, metersPerSecToKmH)
  // elev_high는 «도달한 가장 높은 고도»다. total_elevation_gain(누적 상승량)과 다른 값이다
  putIfNumber(out, 'maxElevationM', activity.elev_high)
  putIfNumber(out, 'avgHeartrateBpm', activity.average_heartrate)
  putIfNumber(out, 'avgWatts', activity.average_watts)
  putIfNumber(out, 'avgCadence', activity.average_cadence)
  putIfNumber(out, 'maxHeartrateBpm', activity.max_heartrate)
  putIfNumber(out, 'weightedAvgWatts', activity.weighted_average_watts)
  // Strava는 파워미터가 없어도 average_watts를 추정값으로 채운다 — 이게 그 구분자다
  putIfBoolean(out, 'deviceWatts', activity.device_watts)
  return out as ExtendedActivityFields
}

/**
 * Strava m/s → km/h 변환
 */
export function metersPerSecToKmH(mps: number): number {
  return Math.round(mps * 3.6 * 10) / 10
}

/**
 * Strava 미터 → km 변환 (소수점 2자리)
 */
export function metersToKm(meters: number): number {
  return Math.round(meters / 10) / 100
}

/**
 * km/h → 페이스(초/km) 변환. 러닝/트레일러닝/걷기는 속도가 아닌 페이스로 배지 조건을 표현한다.
 * 속도와 방향이 반대(값이 작을수록 빠름)이므로 배지 조건 비교 시 부등호도 반대로 적용해야 한다.
 */
export function kmhToPaceSecPerKm(kmh: number): number {
  return kmh > 0 ? Math.round(3600 / kmh) : Infinity
}

/**
 * 페이스(초/km) → "m:ss/km" 문자열 (예: 330 → "5:30/km")
 */
export function formatPaceSecPerKm(sec: number): string {
  if (!Number.isFinite(sec)) return '-'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}/km`
}
