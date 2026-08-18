/**
 * JAM! DB 스키마 기반 TypeScript 타입 정의 (손으로 씀 — 도메인 주석이 값어치라 유지)
 * 기반: PRD/02_DATA_MODEL.md + supabase/migrations/001_initial_schema.sql
 *
 * `database.generated.ts`가 운영 DB에서 자동 생성된 실제 스키마다. 새 컬럼을
 * 추가하거나 기존 컬럼을 바꿀 때는 `npm run db:types`로 그 파일을 재생성한
 * 뒤 이 파일의 해당 Row 인터페이스를 맞춰서 갱신할 것 — 둘이 어긋나도 지금은
 * 자동으로 걸러지지 않으니(하단 참고) 사람이 직접 대조해야 한다.
 *
 * 알려진 한계: 이 파일의 Row 타입들은 하단에서 Supabase 클라이언트 제네릭
 * (`createServerClient<Database>`)에 연결돼 있어 원래는 `.from(table)` 호출마다
 * 타입 체크가 걸리지만, 코드베이스 전반에 `(supabase as any)` 캐스팅이 많이
 * 남아 있어(2026-08-11 기준 51개 파일) 이 보호가 실질적으로 우회되는 곳이
 * 많다 — 전수 제거는 별도 작업으로 필요.
 */

export type ActivityType = 'cycling' | 'running' | 'trail_running' | 'hiking' | 'walking'
export type BadgeType = 'activity' | 'item' | 'poi'
export type DayOfWeek = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday'
export type BadgeRarity = 'common' | 'rare' | 'legend' | 'mythic'
// poi_categories 테이블에서 어드민이 자유롭게 생성/삭제/수정 가능한 슬러그 — 고정 유니언이 아닌 string
export type PoiCategory = string
export type TradeStatus = 'pending' | 'accepted' | 'rejected' | 'expired'
export type ItemObtainedBy = 'drop' | 'drop_event' | 'system_event' | 'pickup'

// =========================================
// 테이블 Row 타입
// =========================================

export interface UserRow {
  id: string
  email: string
  username: string | null
  avatar_url: string | null
  region: string
  activity_types: ActivityType[]
  /** 첫 Strava 싱크 완료 여부 — false이면 배지 엔진이 Common만 발급 */
  initial_sync_done: boolean
  /** GPS 조작 감지(checkAndUpdateLocation)가 유지하는 마지막 픽업/드랍 위치 — 감지 여부와 무관하게 매번 갱신 */
  last_location_lat: number | null
  last_location_lng: number | null
  last_location_at: string | null
  /** 당일(UTC) 누적 이동거리 — gps_daily_distance_date와 다른 날짜면 0으로 리셋해 사용 */
  gps_daily_distance_km: number | null
  gps_daily_distance_date: string | null
  created_at: string
  updated_at: string
}

export interface StravaConnectionRow {
  id: string
  user_id: string
  strava_athlete_id: number
  /** AES-256 암호화된 값 */
  access_token: string
  /** AES-256 암호화된 값 */
  refresh_token: string
  token_expires_at: string
  last_synced_at: string | null
  backfill_completed: boolean
  created_at: string
  updated_at: string
}

/** 동기화 완료된 Strava 활동 — 멱등 처리·누적 조건 평가의 기준 데이터 */
export interface StravaActivityRow {
  id: string
  user_id: string
  strava_id: number
  start_date: string
  jam_activity_type: string | null
  distance_km: number | null
  /** NormalizedActivity 전체 스냅샷 — 배지/미션 누적 조건 평가에 사용 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  normalized: any
  processed_at: string
  /** 'reconcile'은 2026-08-10 정합성 점검 크론 제거 이전 과거 데이터에만 존재 — 신규 기록 없음 */
  processed_via: 'sync' | 'reconcile' | 'manual_backfill'
  created_at: string
}

export interface BadgeRow {
  id: string
  name: string
  description: string
  type: BadgeType
  rarity: BadgeRarity
  image_url: string | null
  condition_json: BadgeCondition | null
  activity_types: ActivityType[]
  patch_available: boolean
  patch_price_krw: number | null
  is_wandering: boolean
  faction_id: string | null
  item_book_id: string | null
  drop_weight: number
  drop_condition_json: Record<string, unknown> | null
  valid_from: string | null
  valid_until: string | null
  /** 배지 발급 시 함께 지급하는 잼 포인트. 0이면 없음. 발급 시점 값으로 1회 지급(소급 변경 없음). */
  point_reward: number
  /** 소프트 삭제 시각. NULL 아니면 신규 발급/드랍/노출 대상에서 제외 — 기존 보유자 이력은 유지됨 */
  deleted_at: string | null
  created_at: string
  /** 배지 상세화면 배경 테마 컬러값 (20260818_002 선행 구조 — 아직 UI에서 미사용, no-op) */
  background_color: string | null
  /** 배지 상세화면 배경 쉐이더 식별자 (20260818_002 선행 구조 — 쉐이더 스택 미정, 아직 UI에서 미사용) */
  background_shader_id: string | null
}

export interface UserActivityBadgeRow {
  id: string
  user_id: string
  badge_id: string
  earned_at: string
  triggered_by: string | null
  /** Phase 2: POI 인증으로 발급된 경우 연결된 POI ID */
  triggered_by_poi_id: string | null
  share_card_url: string | null
  triggered_by_strava_id: number | null
  triggered_by_activity_name: string | null
  triggered_by_distance_km: number | null
  triggered_by_activity_date: string | null
  /** 어드민 전용 — 발급 근거 스냅샷(조건/실측값/트리거 활동). 일반 유저 화면에 노출 금지 */
  condition_snapshot: BadgeConditionSnapshot | null
}

/**
 * Phase 16: POI 배지 획득 이력 (반복 획득 가능)
 * user_activity_badges와 달리 UNIQUE(user_id, badge_id) 제약이 없어 방문할 때마다 행이 쌓임.
 * UNIQUE(user_id, badge_id, poi_id, triggered_by_strava_id)는 동일 활동 재처리 방지용.
 */
export interface UserPoiBadgeEarnRow {
  id: string
  user_id: string
  badge_id: string
  poi_id: string
  earned_at: string
  triggered_by_strava_id: number | null
  triggered_by_activity_name: string | null
  triggered_by_distance_km: number | null
  triggered_by_activity_date: string | null
}

/** 어드민 전용 — 배지 발급 시점의 조건·실측값·트리거 활동 스냅샷 */
export interface BadgeConditionSnapshot {
  condition: BadgeCondition
  actual: string
  required: string
  reason: string
  trigger_activity: {
    stravaId: number | null
    name: string | null
    activityType: string | null
    distanceKm: number | null
    movingTimeSec: number | null
    elevationGainM: number | null
    averageSpeedKmh: number | null
    startDate: string | null
  } | null
}

export interface InventoryRow {
  id: string
  user_id: string
  max_slots: number
  used_slots: number
  created_at: string
}

export interface InventoryItemRow {
  id: string
  inventory_id: string
  badge_id: string
  serial_number: number
  serial_prefix: string | null
  obtained_at: string
  obtained_by: ItemObtainedBy
  expires_at: string | null
  dropped_at: string | null
  drop_id: string | null
  slotted_in: string | null
}

export type PoiDropSource = 'user' | 'system'

export interface PoiDropRow {
  id: string
  /** source='system'(앰비언트 드랍)이면 null */
  dropper_user_id: string | null
  poi_id: string
  badge_id: string
  dropped_at: string
  picked_up_by: string | null
  picked_up_at: string | null
  is_available: boolean
  /** source='system'(앰비언트 드랍)이면 null — 만료 없음 */
  expires_at: string | null
  /** 'user' = 유저가 인벤토리에서 드랍, 'system' = 앰비언트 자동 배치 */
  source: PoiDropSource
}

export interface ItemBookRow {
  id: string
  name: string
  description: string
  image_url: string | null
  required_activity_badge_id: string | null
  reward_badge_id: string | null
  faction_id: string | null
  story_text: string | null
  is_active: boolean
  drop_condition_json: Record<string, unknown> | null
  created_at: string
  /** 20260818_004 — "하위 배지에 일괄 적용" 원본 값. 컬렉션 자체에는 렌더링되지 않는다. */
  background_color: string | null
  background_shader_id: string | null
}

export interface PoiRow {
  id: string
  name: string
  latitude: number
  longitude: number
  radius_meters: number
  category: PoiCategory
  linked_badge_id: string | null
  osm_id: string | null
  naver_id: string | null
  poi_tier: number
  created_at: string
}

export interface PoiCategoryRow {
  slug: string
  label: string
  /** 드랍/픽업 자동검색 파이프라인이 이 카테고리를 검색하는지 여부 */
  pipeline_linked: boolean
  /** 1: 항상 검색, 2: level 1 결과 부족 시 보조 검색. pipeline_linked=false면 null */
  tier: 1 | 2 | null
  /** 네이버 지역검색에 쓸 키워드 목록 (pipeline_linked=true일 때만 의미 있음) */
  keywords: string[]
  created_at: string
}

export interface TradeRow {
  id: string
  sender_id: string
  receiver_id: string
  offer_item_id: string
  request_item_id: string
  status: TradeStatus
  created_at: string
  updated_at: string
}

// =========================================
// Phase 15: 조합 레시피
// =========================================

export interface CombinationRecipeRow {
  id: string
  ingredient_badge_ids: string[]
  /** 결과 배지가 삭제되면 NULL — 결과 미지정 상태(재지정 전까지 매칭돼도 지급 불가) */
  result_badge_id: string | null
  success_rate: number
  hint_text: string | null
  is_public: boolean
  /** 소모되지 않는 보유 조건 — 설정 시 이 액티비티 배지를 보유해야 매칭됨 (item_books.required_activity_badge_id와 동일 패턴) */
  required_activity_badge_id: string | null
  created_at: string
}

/**
 * Phase 19: 조합 v2 — 세계관 다양성 티어 + 피티 정책 (싱글톤 id=1)
 * 패턴: drop_policy — 실패 시 기본값 폴백
 */
export interface CombinePolicyRow {
  id: number
  tier1_max_items: number
  tier1_min_factions: number
  tier1_b_rate: number
  tier1_b_count: number
  tier2_max_items: number
  tier2_min_factions: number
  tier2_b_rate: number
  tier2_b_count: number
  tier3_max_items: number
  tier3_min_factions: number
  tier3_b_rate: number
  tier3_b_count: number
  pity_prob_increment: number
  pity_prob_cap: number
  pity_points_start_streak: number
  pity_points_base: number
  pity_points_step: number
  pity_points_increment: number
  pity_points_cap: number
  updated_at: string
}

/** 유저별 조합 연속 실패 스트릭 (전역 1개 카운터 — 성공 시 리셋) */
export interface UserCombineStateRow {
  user_id: string
  consecutive_fail_count: number
  updated_at: string
}

// =========================================
// Phase 16: 다이나믹 미션
// =========================================

export type MissionType =
  | 'distance'
  | 'poi_visit'
  | 'activity_count'
  | 'item_collect'
  /** 티켓 20260813_001: 배지엔진 evaluateConditionDetailed 재사용 타입 — BadgeCondition과 동일 필드 어휘 */
  | 'streak_days'
  | 'duration_minutes'
  | 'elevation_gain_m'
export type MissionRewardType = 'badge' | 'points' | 'item_badge'
/** Phase13: 미션 상황 표시 방식 — 랭킹형(등수) / 달성형(완료 여부) */
/** individual: 개인형 — 다른 참가자 조회 없이 본인 진행상황/달성여부만 반환 (티켓 20260813_001) */
export type MissionStatusDisplayType = 'ranking' | 'achievement' | 'individual'

export interface MissionCondition {
  /** distance 타입: 목표 거리 km */
  distance_km?: number
  /** distance/activity_count/streak_days/duration_minutes/elevation_gain_m 타입: 활동 종류 필터 */
  activity_type?: ActivityType
  /** poi_visit 타입: 목표 POI ID */
  poi_id?: string
  /** activity_count 타입: 목표 횟수 */
  count?: number
  /** item_collect 타입: 수집 목표 배지 ID */
  badge_id?: string
  /** streak_days 타입: 목표 연속 활동 일수 — badge-engine BadgeCondition.streak_days 재사용 */
  streak_days?: number
  /** duration_minutes 타입: 단일 활동 최소 이동 시간(분) — badge-engine BadgeCondition.duration_minutes 재사용 */
  duration_minutes?: number
  /** elevation_gain_m 타입: 단일 활동 최소 고도 상승(m) — badge-engine BadgeCondition.elevation_gain_m 재사용 */
  elevation_gain_m?: number
}

export interface MissionRow {
  id: string
  title: string
  description: string | null
  mission_type: MissionType
  condition_json: MissionCondition
  /** @deprecated Phase13 이후 미사용(legacy 보존) — 보상은 reward_badge_ids + reward_points 사용 */
  reward_type: MissionRewardType | null
  /** @deprecated Phase13 이후 미사용(legacy 보존) */
  reward_id: string | null
  reward_points: number | null
  /** Phase13: 복수 배지 보상 (활동배지/아이템배지 무관, badges.id 배열) */
  reward_badge_ids: string[]
  /** Phase13: 미션 상황 표시 방식 (기본 ranking) */
  status_display_type: MissionStatusDisplayType
  /** Phase13: 상위 N명 노출 (null = 전체) */
  visible_rank_count: number | null
  starts_at: string
  /** NULL = 상시 미션(종료일 없음) — 티켓 20260813_001 */
  ends_at: string | null
  max_completions: number | null
  /** 티켓 20260815_003: 미션 카드 썸네일 이미지 URL. null이면 이미지 없음. */
  image_url: string | null
  created_at: string
}

export interface UserMissionParticipationRow {
  id: string
  user_id: string
  mission_id: string
  joined_at: string
  progress_value: number
}

export interface UserMissionCompletionRow {
  id: string
  user_id: string
  mission_id: string
  completed_at: string
}

// =========================================
// Phase 17: 떠돌이 신화 아이템
// =========================================

export interface WanderingMythicStateRow {
  id: string
  badge_id: string
  current_poi_id: string | null
  holder_user_id: string | null
  placed_at: string
  expires_at: string
  times_caught: number
}

// =========================================
// Phase 8: 세계관(Factions) + 아이템북 슬롯
// =========================================

export interface FactionRow {
  id: string
  name: string
  tagline: string | null
  description: string | null
  image_url: string | null
  drop_weight: number
  is_active: boolean
  sort_order: number
  drop_condition_json: Record<string, unknown> | null
  created_at: string
  /** 20260818_004 — "하위 배지에 일괄 적용" 원본 값. 세계관 자체에는 렌더링되지 않는다. */
  background_color: string | null
  background_shader_id: string | null
}

export interface FactionAdjacencyRow {
  faction_id: string
  adjacent_faction_id: string
}

export interface UserDropStateRow {
  user_id: string
  last_drop_faction_id: string | null
  last_drop_book_id: string | null
  common_streak: number
  last_piece_pity: Record<string, number>
  daily_drop_count: number
  daily_drop_date: string | null
  total_drops: number
  last_activity_at: string | null
  updated_at: string
}

export interface DropPolicyRow {
  id: number
  rarity_common: number
  rarity_rare: number
  rarity_legend: number
  rarity_mythic: number
  bonus_drop_rate: number
  bonus_drop_rate_intense: number
  intense_duration_min: number
  intense_elevation_m: number
  rare_pity_threshold: number
  daily_downgrade_from: number
  daily_downgrade_common: number
  comeback_gap_days: number
  weekly_first_rare_mult: number
  momentum_weight: number
  adjacent_weight: number
  explore_weight: number
  context_override_rate: number
  mystery_spice_rate: number
  completion_decay: number
  completed_book_weight: number
  same_book_penalty: number
  last_piece_pity_threshold: number
  updated_at: string
}

export interface AmbientDropPolicyRow {
  id: number
  rarity_common: number
  rarity_rare: number
  rarity_legend: number
  target_coverage_ratio: number
  min_target_total: number
  max_target_total: number
  max_active_per_poi: number
  replenish_batch_size: number
  updated_at: string
}

export interface UserItemBookSlotRow {
  id: string
  user_id: string
  item_book_id: string
  badge_id: string
  inventory_item_id: string
  slotted_at: string
}

export interface UserItemBookCompletionRow {
  user_id: string
  item_book_id: string
  completed_at: string
}

// =========================================
// Phase 10: 팔로우 (user_follows)
// =========================================

export interface UserFollowRow {
  id: string
  follower_id: string
  following_id: string
  created_at: string
}

// =========================================
// Phase 15: 투데이 콘텐츠 카드 (today_cards)
// =========================================
export type TodayCardTemplateType =
  | 'badge_spotlight'
  | 'progress_nudge'
  | 'mission_spotlight'
  | 'itembook_milestone'
  | 'location_trend'
  | 'drop_alert'
  | 'editorial_article'

/** 카드가 화면에 어떤 형태로 노출될지 — template_type(콘텐츠 종류)과 별개 축 */
export type TodayCardLayoutType =
  | 'large_thumbnail' // 큰 썸네일형 — 커버 이미지 크게 + 제목/부제
  | 'badge_gallery'    // 배지목록형 — 배지 여러 개를 갤러리/리스트로 나열
  | 'shortcut'         // 바로가기형 — 이미지 없이 짧은 CTA 한 줄
  | 'banner'           // 배너형 — 가로로 넓은 띠 배너, 이미지 위 텍스트 오버레이
  | 'other'            // 기타 — 위 4종에 안 맞는 경우의 기본형

export interface TodayCardRow {
  id: string
  template_type: TodayCardTemplateType
  layout_type: TodayCardLayoutType
  title: string
  subtitle: string | null
  cover_image_url: string | null
  badge_ids: string[]
  mission_id: string | null
  item_book_id: string | null
  region_label: string | null
  body_markdown: string | null
  target_href: string | null
  exposure_tags: string[]
  starts_at: string
  ends_at: string
  sort_order: number
  is_active: boolean
  created_at: string
  created_by: string | null
}

// =========================================
// 배지 발급 조건 타입 (condition_json)
// =========================================
export interface BadgeCondition {
  /** 최소 거리 (km) */
  distance_km?: number
  /** 특정 루트 이름 (예: 'hangang') */
  route?: string
  /** 활동 종류 */
  activity_type?: ActivityType
  /** 누적 활동 횟수 */
  total_count?: number
  /** 연속 활동 일수 */
  streak_days?: number
  /** 고도 상승 (m) */
  elevation_gain_m?: number
  /** 최소 속도 (km/h) — cycling 등에서 사용. 러닝/트레일러닝/걷기는 max_pace_sec_per_km(페이스) 사용 */
  min_speed_kmh?: number
  /** 최대 페이스 (초/km) — 값이 작을수록 빠름. 러닝 계열 속도 조건은 이 필드로 표현 */
  max_pace_sec_per_km?: number
  /** 단일 활동 최소 이동 시간 (분) */
  duration_minutes?: number
  /** 주말 활동 최소 이동 시간 (시간) */
  weekend_duration_hours?: number
  /** 같은 주 내 최소 활동 횟수 */
  weekly_count?: number
  /** 특정 월 (1-12). 배열이면 "그중 한 달"(월별 monthly_km는 개별 월 기준 최대값으로 평가 — 합산 아님) */
  month?: number | number[]
  /** 특정 월 내 최소 누적 거리 (km) */
  monthly_km?: number
  /** 특정 계절 내 활동 횟수 */
  season_count?: number
  /** 계절 구분: spring(3-5월) | summer(6-8월) | fall(9-11월) | winter(12-2월) | all */
  season?: 'spring' | 'summer' | 'fall' | 'winter' | 'all'
  /** 사계절 전부 각각 이 횟수 이상 — 4개 독립 카운터(봄/여름/가을/겨울)가 모두 충족해야 함 */
  season_count_all?: number
  /** 최저 기온 조건 — 활동 중 기온이 이 값 이상이어야 함 (폭염 배지) */
  temperature_min_c?: number
  /** 최고 기온 조건 — 활동 중 기온이 이 값 이하이어야 함 (한파 배지) */
  temperature_max_c?: number
  /** 활동 시작 시간대 조건 { start: "HH:MM", end: "HH:MM" } */
  time_range?: { start: string; end: string }
  /**
   * 활동 시작 요일 조건 (활동의 startDateLocal 기준).
   * - 단일 값: time_range와 동일하게 AND 결합되는 필터 (예: day_of_week:'sunday' + total_count:1000)
   * - 배열 + total_count 동시 지정: "요일별 독립 카운터" 모드 — 배열의 각 요일이 각각
   *   독립적으로 total_count를 만족해야 함 (예: 평일 5일 각각 300회, W08 "평일의 성실함")
   */
  day_of_week?: DayOfWeek | DayOfWeek[]
  /** 걷기(축1 게이트 통과) 활동의 누적 고유 활동일수 — COUNT(DISTINCT date), 연속 아님 */
  active_days_count?: number
  /**
   * 선행 배지 이름 목록 — Rare 이상 배지에 적용.
   * 나열된 이름 중 하나라도 보유하고 있어야 이 배지가 발급 가능해진다.
   * 크로스-어트리뷰트 진행 게이트 구현에 사용.
   */
  prerequisite_badge_names?: string[]
  /**
   * POI UUID — badge-engine 내 직접 평가 불가.
   * GPS 경로 매칭(matchPoisForActivity) 파이프라인에서만 발급 처리됨.
   */
  poi_id?: string
  /** 미션 완료 시에만 지급되는 배지 — 일반 배지 엔진 동기화 대상 아님 */
  mission_reward?: boolean
}

// =========================================
// 활동 피드
// =========================================

export type ActivityFeedEventType =
  | 'badge_earned'
  | 'item_dropped'
  | 'item_picked_up'
  | 'mission_joined'
  | 'mission_completed'
  | 'mission_cancelled'

export interface ActivityFeedRow {
  id: string
  user_id: string
  event_type: ActivityFeedEventType
  event_at: string
  metadata: Record<string, unknown>
}

// =========================================
// 잼 포인트 시스템 (Phase 12, 1a단계)
// =========================================

/** point_transactions.reason 허용값 (마이그레이션 045 CHECK 제약과 일치) */
export type PointReason =
  | 'badge_point_reward'
  | 'mission_point_reward'
  | 'admin_grant'
  | 'admin_deduct'
  | 'combine_pity_reward'

/** 유저별 잔액 캐시 (직접 UPDATE 금지 — award_points RPC로만 변경) */
export interface PointWalletRow {
  user_id: string
  balance: number
  updated_at: string
}

/** 불변 원장 (append-only, 수정/삭제 없음) */
export interface PointTransactionRow {
  id: string
  user_id: string
  amount: number // 양수=적립, 음수=차감
  reason: PointReason
  source_badge_id: string | null
  source_mission_id: string | null
  admin_reason_label: string | null
  admin_reason_note: string | null
  created_at: string
}

/** 서비스 전체 발행 장부 (싱글톤, 어드민 전용) */
export interface PointTreasuryRow {
  id: number
  total_minted: number
  total_reclaimed: number
  updated_at: string
}

export interface ThemePresetRow {
  id: string
  name: string
  main_color: string
  sub_color: string
  is_active: boolean
  created_at: string
}

/**
 * 2026-08-11 발견: 아래 6개 테이블은 실제 운영 DB엔 있었지만 이 파일에 타입이
 * 한 번도 등록된 적이 없었음 — 그래서 관련 코드 전체가 `(supabase as any)`로
 * 타입 체크를 우회하고 있었음(as any 전수 정리 작업에서 발견, DEV_PROCESS_GUARDRAILS.md
 * 패턴 3 참고). `database.generated.ts` 기준으로 채움.
 */
export interface AbusingLogRow {
  id: string
  user_id: string
  event_type: string
  detail: Record<string, unknown> | null
  created_at: string
}

/** 어뷰징 정책 설정 (싱글톤 id=1) — src/lib/abusing/policy.ts의 AbusingPolicy와 필드 일치 */
export interface AbusingPolicyRow {
  id: number
  soft_common_rate: number
  soft_rare_rate: number
  soft_legend_rate: number
  soft_mythic_rate: number
  hard_common_rate: number
  hard_rare_rate: number
  hard_legend_rate: number
  hard_mythic_rate: number
  gps_max_speed_kmh: number
  poi_block_hours: number
  vehicle_speed_filter_kmh: number
  gps_daily_distance_cap_km: number
  updated_at: string
}

/** GPS 조작 감지 후 72시간 POI 드랍/픽업 차단 — src/lib/abusing/poi-block.ts */
export interface PoiBlockRow {
  id: string
  user_id: string
  poi_id: string
  blocked_until: string
  reason: string
  created_at: string
}

/** 네이버 지역검색 결과 캐시(카테고리×그리드 단위 TTL) — src/lib/poi/search-cache.ts */
export interface PoiSearchCacheRow {
  grid_key: string
  category: string
  had_results: boolean
  searched_at: string
}

/** 어뷰징 섀도우밴 — src/lib/abusing/shadow-ban.ts */
export interface UserShadowBanRow {
  id: string
  user_id: string
  ban_level: string
  reason: string
  created_by: string
  expires_at: string | null
  created_at: string
}

/** 배지·드랍 엔진 판정 구조화 로그 — src/lib/engine-log/index.ts */
export interface EngineDecisionLogRow {
  id: string
  user_id: string | null
  engine: string
  event: string
  payload: Record<string, unknown>
  created_at: string
}

/** award_points() RPC 인자 */
export interface AwardPointsArgs {
  p_user_id: string
  p_amount: number
  p_reason: PointReason
  p_source_badge_id?: string | null
  p_source_mission_id?: string | null
  p_admin_reason_label?: string | null
  p_admin_reason_note?: string | null
}

// =========================================
// Supabase Database 제네릭 타입 (createClient에 주입)
// =========================================
export interface Database {
  public: {
    Tables: {
      users: {
        Row: UserRow
        Insert: Omit<UserRow, 'created_at' | 'updated_at' | 'initial_sync_done'> & {
          created_at?: string
          updated_at?: string
          initial_sync_done?: boolean
        }
        Update: Partial<Omit<UserRow, 'id'>>
        Relationships: []
      }
      strava_connections: {
        Row: StravaConnectionRow
        Insert: Omit<StravaConnectionRow, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<StravaConnectionRow, 'id'>>
        Relationships: []
      }
      strava_activities: {
        Row: StravaActivityRow
        Insert: Omit<StravaActivityRow, 'id' | 'processed_at' | 'created_at'> & {
          id?: string
          processed_at?: string
          created_at?: string
        }
        Update: Partial<Omit<StravaActivityRow, 'id'>>
        Relationships: []
      }
      badges: {
        Row: BadgeRow
        Insert: Omit<BadgeRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<BadgeRow, 'id'>>
        Relationships: []
      }
      user_activity_badges: {
        Row: UserActivityBadgeRow
        Insert: Omit<UserActivityBadgeRow, 'id' | 'earned_at'> & {
          id?: string
          earned_at?: string
          triggered_by_poi_id?: string | null
        }
        Update: Partial<Omit<UserActivityBadgeRow, 'id'>>
        Relationships: []
      }
      user_poi_badge_earns: {
        Row: UserPoiBadgeEarnRow
        Insert: Omit<UserPoiBadgeEarnRow, 'id' | 'earned_at'> & {
          id?: string
          earned_at?: string
        }
        Update: Partial<Omit<UserPoiBadgeEarnRow, 'id'>>
        Relationships: []
      }
      inventory: {
        Row: InventoryRow
        Insert: Omit<InventoryRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<InventoryRow, 'id'>>
        Relationships: []
      }
      inventory_items: {
        Row: InventoryItemRow
        Insert: Omit<InventoryItemRow, 'id' | 'serial_number' | 'obtained_at'> & {
          id?: string
          obtained_at?: string
        }
        Update: Partial<Omit<InventoryItemRow, 'id'>>
        Relationships: []
      }
      item_books: {
        Row: ItemBookRow
        Insert: Omit<ItemBookRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<ItemBookRow, 'id'>>
        Relationships: []
      }
      poi: {
        Row: PoiRow
        Insert: Omit<PoiRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<PoiRow, 'id'>>
        Relationships: []
      }
      poi_categories: {
        Row: PoiCategoryRow
        Insert: Omit<PoiCategoryRow, 'created_at'> & { created_at?: string }
        Update: Partial<Omit<PoiCategoryRow, 'slug'>>
        Relationships: []
      }
      trades: {
        Row: TradeRow
        Insert: Omit<TradeRow, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<TradeRow, 'id'>>
        Relationships: []
      }
      poi_drops: {
        Row: PoiDropRow
        Insert: Omit<PoiDropRow, 'id' | 'dropped_at' | 'picked_up_by' | 'picked_up_at' | 'is_available' | 'source'> & {
          id?: string
          dropped_at?: string
          picked_up_by?: string | null
          picked_up_at?: string | null
          is_available?: boolean
          source?: PoiDropSource
        }
        Update: Partial<Omit<PoiDropRow, 'id'>>
        Relationships: []
      }
      ambient_drop_policy: {
        Row: AmbientDropPolicyRow
        Insert: Partial<AmbientDropPolicyRow> & { id: number }
        Update: Partial<Omit<AmbientDropPolicyRow, 'id'>>
        Relationships: []
      }
      combination_recipes: {
        Row: CombinationRecipeRow
        Insert: Omit<CombinationRecipeRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<CombinationRecipeRow, 'id'>>
        Relationships: []
      }
      combine_policy: {
        Row: CombinePolicyRow
        Insert: Partial<CombinePolicyRow> & { id: number }
        Update: Partial<Omit<CombinePolicyRow, 'id'>>
        Relationships: []
      }
      user_combine_state: {
        Row: UserCombineStateRow
        Insert: Partial<UserCombineStateRow> & { user_id: string }
        Update: Partial<Omit<UserCombineStateRow, 'user_id'>>
        Relationships: []
      }
      missions: {
        Row: MissionRow
        Insert: Omit<MissionRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<MissionRow, 'id'>>
        Relationships: []
      }
      user_mission_completions: {
        Row: UserMissionCompletionRow
        Insert: Omit<UserMissionCompletionRow, 'id' | 'completed_at'> & { id?: string; completed_at?: string }
        Update: Partial<Omit<UserMissionCompletionRow, 'id'>>
        Relationships: []
      }
      user_mission_participations: {
        Row: UserMissionParticipationRow
        Insert: Omit<UserMissionParticipationRow, 'id' | 'joined_at' | 'progress_value'> & { id?: string; joined_at?: string; progress_value?: number }
        Update: Partial<Omit<UserMissionParticipationRow, 'id'>>
        Relationships: []
      }
      wandering_mythic_state: {
        Row: WanderingMythicStateRow
        Insert: Omit<WanderingMythicStateRow, 'id'> & { id?: string }
        Update: Partial<Omit<WanderingMythicStateRow, 'id'>>
        Relationships: []
      }
      user_activity_feed: {
        Row: ActivityFeedRow
        Insert: Omit<ActivityFeedRow, 'id' | 'event_at'> & { id?: string; event_at?: string }
        Update: Partial<Omit<ActivityFeedRow, 'id'>>
        Relationships: []
      }
      factions: {
        Row: FactionRow
        Insert: Omit<FactionRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<FactionRow, 'id'>>
        Relationships: []
      }
      faction_adjacency: {
        Row: FactionAdjacencyRow
        Insert: FactionAdjacencyRow
        Update: Partial<FactionAdjacencyRow>
        Relationships: []
      }
      user_drop_state: {
        Row: UserDropStateRow
        Insert: Omit<UserDropStateRow, 'updated_at'> & { updated_at?: string }
        Update: Partial<Omit<UserDropStateRow, 'user_id'>>
        Relationships: []
      }
      drop_policy: {
        Row: DropPolicyRow
        Insert: Partial<DropPolicyRow> & { id: number }
        Update: Partial<Omit<DropPolicyRow, 'id'>>
        Relationships: []
      }
      user_item_book_slots: {
        Row: UserItemBookSlotRow
        Insert: Omit<UserItemBookSlotRow, 'id' | 'slotted_at'> & { id?: string; slotted_at?: string }
        Update: Partial<Omit<UserItemBookSlotRow, 'id'>>
        Relationships: []
      }
      user_item_book_completions: {
        Row: UserItemBookCompletionRow
        Insert: Omit<UserItemBookCompletionRow, 'completed_at'> & { completed_at?: string }
        Update: Partial<UserItemBookCompletionRow>
        Relationships: []
      }
      user_follows: {
        Row: UserFollowRow
        Insert: Omit<UserFollowRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<UserFollowRow, 'id'>>
        Relationships: []
      }
      point_wallets: {
        Row: PointWalletRow
        Insert: Omit<PointWalletRow, 'updated_at'> & { updated_at?: string }
        Update: Partial<Omit<PointWalletRow, 'user_id'>>
        Relationships: []
      }
      point_transactions: {
        Row: PointTransactionRow
        Insert: Omit<PointTransactionRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<PointTransactionRow, 'id'>>
        Relationships: []
      }
      point_treasury: {
        Row: PointTreasuryRow
        Insert: Partial<PointTreasuryRow> & { id: number }
        Update: Partial<Omit<PointTreasuryRow, 'id'>>
        Relationships: []
      }
      today_cards: {
        Row: TodayCardRow
        Insert: Omit<TodayCardRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<TodayCardRow, 'id'>>
        Relationships: []
      }
      abusing_logs: {
        Row: AbusingLogRow
        Insert: Omit<AbusingLogRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<AbusingLogRow, 'id'>>
        Relationships: []
      }
      abusing_policy: {
        Row: AbusingPolicyRow
        Insert: Partial<AbusingPolicyRow> & { id: number }
        Update: Partial<Omit<AbusingPolicyRow, 'id'>>
        Relationships: []
      }
      poi_blocks: {
        Row: PoiBlockRow
        Insert: Omit<PoiBlockRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<PoiBlockRow, 'id'>>
        Relationships: []
      }
      poi_search_cache: {
        Row: PoiSearchCacheRow
        Insert: PoiSearchCacheRow
        Update: Partial<PoiSearchCacheRow>
        Relationships: []
      }
      user_shadow_bans: {
        Row: UserShadowBanRow
        Insert: Omit<UserShadowBanRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<UserShadowBanRow, 'id'>>
        Relationships: []
      }
      engine_decision_log: {
        Row: EngineDecisionLogRow
        Insert: Omit<EngineDecisionLogRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<EngineDecisionLogRow, 'id'>>
        Relationships: []
      }
      theme_presets: {
        Row: ThemePresetRow
        Insert: Omit<ThemePresetRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<ThemePresetRow, 'id'>>
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: {
      award_points: {
        Args: AwardPointsArgs
        Returns: PointTransactionRow
      }
      activate_theme_preset: {
        Args: { p_preset_id: string }
        Returns: void
      }
    }
    Enums: {
      badge_type: BadgeType
      badge_rarity: BadgeRarity
      trade_status: TradeStatus
    }
  }
}
