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
// 주의: Strava `type`은 러닝 세분화가 없어 Run은 기본적으로 road_running으로 처리한다.
//       트레일 러닝 구분은 sport_type을 우선 참조해야 하므로 getJamActivityType()를 사용할 것.
export const STRAVA_TYPE_TO_JAM: Record<string, string> = {
  Ride: 'cycling',
  EBikeRide: 'cycling',
  VirtualRide: 'cycling',
  Run: 'road_running',
  VirtualRun: 'road_running',
  Hike: 'hiking',
  Walk: 'walking',
}

// JAM! 활동 종류 ↔ Strava sport_type 매핑 (더 세분화된 필드, type보다 우선)
export const STRAVA_SPORT_TYPE_TO_JAM: Record<string, string> = {
  TrailRun: 'trail_running',
  TrailRunning: 'trail_running',
  Run: 'road_running',
  VirtualRun: 'road_running',
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
  startDate: string               // ISO 8601
  averageSpeedKmh: number
  startLatLng: [number, number] | null
  endLatLng: [number, number] | null
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
