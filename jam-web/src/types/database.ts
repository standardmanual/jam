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
export type BadgeType = 'activity' | 'item' | 'checkin'
export type DayOfWeek = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday'
export type BadgeRarity = 'common' | 'rare' | 'legend' | 'mythic'
// poi_categories 테이블에서 어드민이 자유롭게 생성/삭제/수정 가능한 슬러그 — 고정 유니언이 아닌 string
export type PoiCategory = string
export type TradeStatus = 'pending' | 'accepted' | 'rejected' | 'expired'
// 'ambient_drop' — 20260829_2101: 앰비언트(시스템) 드랍이 배치 시점에 InventoryItem을
// 선발급할 때만 쓰인다. assign_random_serial() 트리거가 이 값으로 앰비언트 일련번호
// 범위(50,001~999,999)를 판별한다(migrations/108).
export type ItemObtainedBy = 'drop' | 'drop_event' | 'system_event' | 'pickup' | 'ambient_drop'

// =========================================
// 테이블 Row 타입
// =========================================

export interface UserRow {
  id: string
  email: string
  username: string | null
  /** 자유 형식 표시 이름(20260830_0113). NULL이면 화면 렌더 시점에 username으로 폴백 — DB엔 복사해 채우지 않는다. */
  display_name: string | null
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
  /**
   * 알림함을 마지막으로 연 시각 (마이그레이션 096). 개별 read 플래그 대신 이 한 점으로
   * "어디까지 봤나"를 판정한다. NULL이면 모든 소식이 안 읽음.
   */
  notifications_seen_at: string | null
  /** 어드민 권한 부여 여부. ADMIN_EMAILS 환경변수 화이트리스트와 OR 조건으로 판정한다 (20260827_015). */
  is_admin: boolean
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
  faction_id: string | null
  item_book_id: string | null
  /** 체크인 배지가 속한 지점 계열 태그. poi_categories.slug 참조, nullable (마이그레이션 113).
   *  값이 있으면 연결된 지점의 poi.category보다 우선해 목록/배지함 분류 기준이 된다
   *  (오버라이드, 티켓 20260830_1522). null이면 기존처럼 poi.category로 폴백한다.
   *  발급 판정 로직에는 관여하지 않는다. 체크인 타입 외에는 항상 NULL로 유지. */
  category: string | null
  drop_weight: number
  drop_condition_json: Record<string, unknown> | null
  valid_from: string | null
  valid_until: string | null
  /** 배지 발급 시 함께 지급하는 잼 포인트. 0이면 없음. 발급 시점 값으로 1회 지급(소급 변경 없음). */
  point_reward: number
  /** 소프트 삭제 시각. NULL 아니면 신규 발급/드랍/노출 대상에서 제외 — 기존 보유자 이력은 유지됨 */
  deleted_at: string | null
  created_at: string
  /** 배지 상세화면 배경 테마 컬러값 (20260818_002 선행 구조). background_image_url과 상호 배타적 */
  background_color: string | null
  /** 배지 상세화면 배경 쉐이더 식별자 (20260818_002 선행 구조 — 쉐이더 스택 미정, 아직 UI에서 미사용) */
  background_shader_id: string | null
  /** 배경 제너레이터로 합성 후 구운(bake) 정적 PNG의 Storage URL. background_color와 상호
   *  배타적이며, 있으면 렌더링 시 우선한다(20260819_008).
   *  애니메이션 모드(background_video_url)일 때도 poster/폴백 정지 이미지로 함께 채워진다
   *  (20260819_012) */
  background_image_url: string | null
  /** 배경 제너레이터 애니메이션 모드 결과를 구운 반복 재생 MP4(H.264)의 Storage URL.
   *  값이 있으면 background_image_url은 그 영상의 poster/폴백으로 쓰인다(20260819_012) */
  background_video_url: string | null
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
 * Phase 16: 체크인 배지 획득 이력 (반복 획득 가능)
 * user_activity_badges와 달리 UNIQUE(user_id, badge_id) 제약이 없어 체크인할 때마다 행이 쌓임.
 * UNIQUE(user_id, badge_id, poi_id, triggered_by_strava_id)는 동일 활동 재처리 방지용.
 * poi_id는 지점 참조라 이름을 유지한다 (티켓 20260826_004 경계 규칙 2).
 */
export interface UserCheckinBadgeEarnRow {
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
  /** null = 현재 소유자 없음(Dropped/AtPoi 또는 Orphaned) — 20260829_2101 */
  inventory_id: string | null
  badge_id: string
  serial_number: number
  serial_prefix: string | null
  obtained_at: string
  obtained_by: ItemObtainedBy
  expires_at: string | null
  /** 레거시 필드 — 20260829_2101 이후 새 드랍은 이 컬럼을 더 이상 쓰지 않는다(소유권
   * 이전은 poi_drops.inventory_item_id로 추적). 과거 데이터 호환을 위해 컬럼만 유지. */
  dropped_at: string | null
  drop_id: string | null
  slotted_in: string | null
  /** 개체 파괴(조합 소모/미픽업 만료) 소프트 삭제 시점 — 20260829_2101 */
  destroyed_at: string | null
}

/**
 * 드랍 출처. 'user'=유저가 인벤토리에서 직접 드랍(30일 만료). 'system'=앰비언트(시스템)
 * 배치(만료 없음 — 필요 시 badges.valid_from/valid_until로 대체).
 *
 * 2026-08-25에 앰비언트 드랍이 한 번 전면 제거됐다가(티켓 20260825_004) 2026-08-26에
 * 재도입됐다(티켓 20260826_009, `src/lib/ambient-drop/`). 제거 기간에는 전 행이 'user'였다.
 * assign_random_serial() 트리거와 poi_drops_source_consistency CHECK가 이 컬럼을 참조한다.
 */
export type PoiDropSource = 'user' | 'system'

export interface PoiDropRow {
  id: string
  dropper_user_id: string | null
  poi_id: string
  /** 조인 편의용 파생 컬럼 — 항상 inventory_item_id가 가리키는 개체의 badge_id와 일치
   * (드리프트 없음, 둘 다 row 생성 시 한 번만 설정). 정본은 inventory_items.badge_id —
   * 20260829_2101 */
  badge_id: string
  /** 이 드랍이 가리키는 실제 개체. source 무관하게 항상 "이미 발급된" row를 참조한다
   * (픽업은 소유권 이전일 뿐 재발급이 아님). 마이그레이션 이전 완료(is_available=false)
   * 과거 드랍은 소급 연결하지 않아 null일 수 있다 — 20260829_2101 */
  inventory_item_id: string | null
  dropped_at: string
  picked_up_by: string | null
  picked_up_at: string | null
  is_available: boolean
  expires_at: string | null
  /** PoiDropSource 주석 참고 — 'user'/'system' 둘 다 활성 값 */
  source: PoiDropSource
}

/**
 * InventoryItem 한 개체에 점유(custody) 변화가 생길 때마다 쌓이는 append-only 이력.
 * 8종 이벤트가 상태 전이 다이어그램의 화살표와 1:1 대응한다 — 20260829_2101.
 * from/to/actor는 유저명을 스냅샷 값으로 저장한다(라이브 FK 조인에만 의존 금지 — 탈퇴 후
 * *_user_id는 SET NULL로 비지만 *_username은 영구 보존).
 */
export type CustodyEventType =
  | 'Minted'
  | 'UserDrop'
  | 'Pickup'
  | 'Expire'
  | 'Slot'
  | 'Unslot'
  | 'Consume'
  | 'Orphan'
  /** 어드민 영구 폐기(Orphaned → Destroyed) — 20260829_2150 */
  | 'AdminDestroy'
  /** 어드민 재배정(Orphaned → Held) — 20260829_2150 */
  | 'AdminReassign'

export interface CustodyEventRow {
  id: string
  inventory_item_id: string
  event_type: CustodyEventType
  from_user_id: string | null
  from_username: string | null
  to_user_id: string | null
  to_username: string | null
  actor_user_id: string | null
  actor_username: string | null
  poi_id: string | null
  created_at: string
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
  /** 20260819_013 — 배경 제너레이터 결과(정적 이미지). 하위 배지 일괄 적용 원본 값. */
  background_image_url: string | null
  /** 20260819_013 — 배경 제너레이터 애니메이션 결과(반복 재생 MP4). background_image_url은 poster로 함께 채워진다. */
  background_video_url: string | null
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
  /** 20260830_1619에서 추가, 20260830_1620에서 연동 완료 — false면 드랍 생성·체크인 판정·
   *  앰비언트 드랍 배치·지도/목록 노출에서 제외된다(matcher.ts, api/drops, api/checkin-badges,
   *  lib/ambient-drop 등). 이미 발급된 배지·기존에 놓인 드랍에는 소급 적용되지 않는다. */
  is_active: boolean
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
  | 'checkin'
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
  /** checkin 타입: 목표 지점(POI) ID — 지점 식별자라 키명은 poi_id 유지 (20260825_031 계약) */
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
  /**
   * 티켓 20260825_028: 이 미션을 완료해야 획득 조건이 열리는 본 배지 id.
   * null이면 게이팅 없는 일반 미션. 레벨업 미션 15종만 값을 가진다.
   * 노출 판정(`src/lib/missions/visibility.ts`)이 이 배지의 rarity를 기준으로 판단한다.
   */
  gated_badge_id: string | null
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
  /** 20260819_013 — 배경 제너레이터 결과(정적 이미지). 하위 배지 일괄 적용 원본 값. */
  background_image_url: string | null
  /** 20260819_013 — 배경 제너레이터 애니메이션 결과(반복 재생 MP4). background_image_url은 poster로 함께 채워진다. */
  background_video_url: string | null
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

/**
 * drop_policy 테이블 — **앱 키 기준** 타입이다 (DB 실제 컬럼명과 1:1이 아니다).
 *
 * DB의 실제 컬럼은 `rarity_legendary`인데 앱 전역은 `rarity_legend`를 쓴다.
 * 티켓 20260813_003에서 이 컬럼만 rename이 누락돼 생긴 불일치로,
 * `database.generated.ts`(Supabase 생성 타입)에는 `rarity_legendary`로 나온다.
 * 앱 키 ↔ DB 컬럼 변환은 `src/lib/drop-engine/policy.ts`가 입출력 시점에만 처리한다.
 *
 * ⚠️ 등급명 개명(legend → epic) 후속 작업에서 DB 컬럼이 `rarity_epic`으로 바뀌면
 * 이 타입과 policy.ts의 매핑을 함께 정리할 것. (티켓 20260831_1118)
 */
export interface DropPolicyRow {
  id: number
  rarity_common: number
  rarity_rare: number
  /** DB 실제 컬럼명은 `rarity_legendary` — policy.ts에서 변환한다 */
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

/** 3축 모드 — 명시(explicit) 또는 무작위(random). AmbientDropConfigRow 참고 */
export type AmbientDropAxisMode = 'explicit' | 'random'

/**
 * 앰비언트(시스템) POI 드랍 배치 설정 싱글톤(id=1). 티켓 20260826_009로 재도입.
 * 구 ambient_drop_policy(마이그레이션 044, 100에서 DROP)와 스키마가 다르다 — 전역 커버리지
 * 목표치 모델이 아니라, 실행마다 카테고리/등급비율/대상컬렉션 3축을 명시 또는 무작위로
 * 골라 batch_size개를 배치하는 배치 실행형 모델이다. 로직: `src/lib/ambient-drop/`.
 */
export interface AmbientDropConfigRow {
  id: number
  /** 자동 스케줄 등록 여부. 실제 실행 시각은 vercel.json 고정 cron(코드 상수와 동기화 필요) */
  auto_enabled: boolean
  /** 자동 스케줄 시각 전후 n분 — 이 구간엔 수동 배포 버튼 비활성화 (auto_enabled=false면 무시) */
  exclusion_window_minutes: number
  /** 메타 옵션 — true면 실행 시점에 아래 3축 모드를 전부 'random'으로 취급(비파괴적 오버라이드) */
  all_random: boolean
  category_mode: AmbientDropAxisMode
  /** explicit + null = "전체 카테고리". poi_categories.slug 참조 */
  category_slug: string | null
  rarity_mode: AmbientDropAxisMode
  rarity_common: number
  rarity_rare: number
  rarity_legend: number
  rarity_mythic: number
  collection_mode: AmbientDropAxisMode
  /** explicit + 빈 배열 = "전체 컬렉션". item_books.id 참조(배열이라 DB FK 없음, 앱에서 검증) */
  collection_ids: string[]
  /** 실행 1회당 배치할 POI 개수 (3축에 속하지 않는 실행 파라미터) */
  batch_size: number
  /** POI 1곳이 동시에 보유 가능한 최대 활성 앰비언트 드랍 수 (분산 배치용) */
  max_active_per_poi: number
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
  /**
   * **Strava 활동 시작 시각**이다(기록 시각이 아니다). recordFeedEvent()의 4번째 인자로
   * 활동 시작 시각이 그대로 들어간다.
   * 20260824_006 — 피드 정렬·표시에는 더 이상 이 컬럼을 쓰지 않는다(created_at으로 이전).
   * 원본 데이터로서의 의미(실제로 언제 뛰었는지)만 남는다. badge_earned/item_dropped만
   * 값이 있고(마이그레이션 094에서 strava_activities 근사 매칭으로 소급 보정), 그 외
   * 이벤트 타입은 DEFAULT NOW()로 기록 시각과 사실상 같다.
   */
  event_at: string
  /**
   * 행이 DB에 기록된 시각 (마이그레이션 093). "방금 획득했는가" 판정과 피드 정렬·표시
   * (20260824_006)는 모두 이 컬럼을 쓴다.
   * 093 이전 행은 event_at 기반 근사값이다 — 그 event_at 자체가 로컬 벽시계 오해석으로
   * 부정확했을 수 있어(20260824_006), 093 이전 행의 created_at은 여전히 부정확할 수 있다.
   */
  created_at: string
  /**
   * 이 이벤트가 나온 활동의 **Strava 숫자 id** (마이그레이션 107, 20260827_018).
   * `strava_activities.strava_id`·`user_activity_badges.triggered_by_strava_id`·
   * 결산 알림 payload의 `activity_ids`와 같은 규약이다 — 알림과 피드가 같은 키로 말한다.
   *
   * NULL = 활동 귀속 불명. 활동 단위가 아닌 이벤트(mission_joined·item_picked_up·
   * mission_completed)와 **107 이전에 쌓인 과거 행 전부**가 여기 해당한다(백필하지 않았다).
   * NULL 행은 프로필 피드에서 서로 묶이지 않고 단건으로 렌더된다.
   */
  strava_activity_id: number | null
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

/**
 * 어뷰징 정책 설정 (싱글톤 id=1) — **앱 키 기준** 타입이다 (DB 실제 컬럼명과 1:1이 아니다).
 * src/lib/abusing/policy.ts의 AbusingPolicy와 필드가 일치한다.
 *
 * DB의 실제 컬럼은 `soft_legendary_rate`/`hard_legendary_rate`인데 앱 전역은
 * `soft_legend_rate`/`hard_legend_rate`를 쓴다. 티켓 20260813_003에서 이 두 컬럼만 rename이
 * 누락돼 생긴 불일치로, `database.generated.ts`(Supabase 생성 타입)에는 `..._legendary_rate`로
 * 나온다. 앱 키 ↔ DB 컬럼 변환은 `src/lib/abusing/policy.ts`가 입출력 시점에만 처리한다.
 *
 * ⚠️ 등급명 개명(legend → epic) 후속 작업에서 DB 컬럼이 바뀌면 이 타입과 policy.ts의 매핑을
 * 함께 정리할 것. (티켓 20260831_1149)
 */
export interface AbusingPolicyRow {
  id: number
  soft_common_rate: number
  soft_rare_rate: number
  /** DB 실제 컬럼명은 `soft_legendary_rate` — abusing/policy.ts에서 변환한다 */
  soft_legend_rate: number
  soft_mythic_rate: number
  hard_common_rate: number
  hard_rare_rate: number
  /** DB 실제 컬럼명은 `hard_legendary_rate` — abusing/policy.ts에서 변환한다 */
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

// =========================================
// 알림(소식) — 마이그레이션 096 / 티켓 20260824_019
// Specs/PRD/Notification/PRD.md · DATA_MODEL.md
// =========================================

/**
 * notification_type — 실제로 쓰는 종류.
 *
 * **DB ENUM에는 더 많은 값이 있다.** Postgres는 ENUM 값 제거를 안전하게 지원하지 않아
 * DB에는 그대로 두고 TS 타입에서만 뺀다 — DATA_MODEL §2 「예약됐으나 사용하지 않는 값」.
 * 어떤 코드도 아래 값을 만들지 않으므로, 만에 하나 들어오면 렌더러의 `default` 분기가 받는다.
 *
 * - `following_nearby_drop`·`nearby_drops` — 지역 기반 소식 2종, 2026-08-25 스펙 제거
 * - `mutual_follow` — #27 맞팔, 20260827_014에서 `followed`로 대체
 * - `badge_earned`·`rare_badge_earned`·`item_badge_earned`·`checkin_badge_earned`·
 *   `points_earned`·`first_badge` — ① 보상 획득 6종. 20260827_014에서 활동 결산
 *   (`activity_recap`) 1종으로 재편됐고, 20260827_016에서 죽은 렌더 경로까지 제거했다
 *   (해당 행은 `seed_20260827_notifications_reset.sql`로 전량 삭제됨).
 *
 * **`ActivityFeedEventType`의 `'badge_earned'`와 혼동하지 말 것** — 이름만 같고 축이 다르다.
 * 그쪽은 활동 피드(`user_activity_feed`) 이벤트 타입이며 현행이다.
 */
export type NotificationType =
  // ① 보상 획득 — 활동 결산 (bumps_badge=false 대상)
  | 'activity_recap'
  // ② 컬렉션 (3)
  | 'collection_slottable'
  | 'collection_near_complete'
  | 'collection_completable'
  // ③ 내 드랍 (2)
  | 'drop_picked_up'
  | 'drop_spot_active'
  // ④ 미션 (5)
  | 'mission_milestone'
  | 'mission_deadline'
  | 'mission_completed'
  | 'mission_rank_up'
  | 'mission_ended'
  // ⑤ 소셜(나에게) (1) — #27 맞팔(`mutual_follow`)은 20260827_014에서 제거됐다
  //    (자기 행동의 메아리. 되팔로우당한 쪽에는 `followed`가 대신 나간다)
  | 'followed'
  // ⑥ 소셜(팔로잉 활동) (3)
  | 'following_rare_badge'
  | 'following_collection_complete'
  | 'following_mission_complete'
  // ⑧ 계정·시스템 (5)
  | 'strava_disconnected'
  | 'sync_stalled'
  | 'inventory_full'
  | 'admin_points_changed'
  | 'announcement'

export interface NotificationRow {
  id: string
  /** 받는 사람. 행위자가 아니다 */
  user_id: string
  type: NotificationType
  /** 아바타 탭 대상. 팔로우·픽업됨·팔로잉 활동에만 존재 */
  actor_user_id: string | null
  /** 묶음 인원 — "예린님 외 3명"의 N */
  actor_count: number
  /** 묶음 병합 키. NULL이면 묶지 않는 소식(항상 새 행) */
  group_key: string | null
  /** 문구 슬롯 + 착지점 계산 재료. 닉네임은 넣지 않는다(actor_user_id로 조인) */
  payload: Record<string, unknown>
  /** dot을 켜는가. ① 보상 획득(활동 결산)만 false */
  bumps_badge: boolean
  created_at: string
  /** 정렬·dot 판정의 기준. created_at이 아니다 */
  updated_at: string
}

/** 소식 #18("내 드랍 지점 활성") 계측용 — POI 열람 기록 */
export interface PoiViewRow {
  id: string
  poi_id: string
  user_id: string
  /** KST 기준 날짜 (YYYY-MM-DD) */
  viewed_on: string
  viewed_at: string
}

/**
 * 미션 순위 스냅샷 (마이그레이션 099) — 소식 #23("순위 상승") 판정 기준선.
 * 순위는 어디에도 저장되지 않고 매번 계산되므로, "상승 시만" 조건을 판정하려면
 * 직전 배치의 순위가 필요하다. 025 배치만 읽고 쓴다.
 */
export interface MissionRankSnapshotRow {
  mission_id: string
  user_id: string
  /** 1부터. 025 배치가 lib/missions/ranking.ts의 정렬로 계산한 값 */
  rank: number
  captured_at: string
}

/** create_notification() RPC 인자 — src/lib/notifications/index.ts */
export interface CreateNotificationArgs {
  p_user_id: string
  p_type: NotificationType
  p_payload?: Record<string, unknown>
  p_bumps_badge?: boolean
  p_actor_user_id?: string | null
  p_group_key?: string | null
  /** 'merge'(기본): 같은 group_key면 병합 / 'once': 이미 있으면 아무것도 하지 않음 */
  p_mode?: 'merge' | 'once'
  /** 병합 시 숫자로 더할 payload 키 (예: points_earned의 amount) */
  p_sum_keys?: string[] | null
  /**
   * 병합 시 배열로 이어붙이고 **중복 제거**할 payload 키.
   * actor_ids를 넣으면 actor_count가 병합 횟수가 아니라 고유 인원으로 갱신된다 (DATA_MODEL §4-1)
   */
  p_append_keys?: string[] | null
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
      user_checkin_badge_earns: {
        Row: UserCheckinBadgeEarnRow
        Insert: Omit<UserCheckinBadgeEarnRow, 'id' | 'earned_at'> & {
          id?: string
          earned_at?: string
        }
        Update: Partial<Omit<UserCheckinBadgeEarnRow, 'id'>>
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
        Insert: Omit<InventoryItemRow, 'id' | 'serial_number' | 'obtained_at' | 'destroyed_at'> & {
          id?: string
          obtained_at?: string
          destroyed_at?: string | null
        }
        Update: Partial<Omit<InventoryItemRow, 'id'>>
        Relationships: []
      }
      custody_events: {
        Row: CustodyEventRow
        Insert: Omit<CustodyEventRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<CustodyEventRow, 'id'>>
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
        Insert: Omit<PoiDropRow, 'id' | 'dropped_at' | 'picked_up_by' | 'picked_up_at' | 'is_available' | 'source' | 'inventory_item_id'> & {
          id?: string
          dropped_at?: string
          picked_up_by?: string | null
          picked_up_at?: string | null
          is_available?: boolean
          source?: PoiDropSource
          inventory_item_id?: string | null
        }
        Update: Partial<Omit<PoiDropRow, 'id'>>
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
      user_activity_feed: {
        Row: ActivityFeedRow
        Insert: Omit<ActivityFeedRow, 'id' | 'event_at' | 'created_at' | 'strava_activity_id'> & { id?: string; event_at?: string; created_at?: string; strava_activity_id?: number | null }
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
      ambient_drop_config: {
        Row: AmbientDropConfigRow
        Insert: Partial<AmbientDropConfigRow> & { id: number }
        Update: Partial<Omit<AmbientDropConfigRow, 'id'>>
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
      notifications: {
        Row: NotificationRow
        Insert: Omit<NotificationRow, 'id' | 'actor_count' | 'created_at' | 'updated_at'> & {
          id?: string
          actor_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<NotificationRow, 'id'>>
        Relationships: []
      }
      poi_views: {
        Row: PoiViewRow
        Insert: Omit<PoiViewRow, 'id' | 'viewed_at'> & { id?: string; viewed_at?: string }
        Update: Partial<Omit<PoiViewRow, 'id'>>
        Relationships: []
      }
      mission_rank_snapshots: {
        Row: MissionRankSnapshotRow
        Insert: Omit<MissionRankSnapshotRow, 'captured_at'> & { captured_at?: string }
        Update: Partial<MissionRankSnapshotRow>
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
      create_notification: {
        Args: CreateNotificationArgs
        Returns: NotificationRow
      }
    }
    Enums: {
      badge_type: BadgeType
      badge_rarity: BadgeRarity
      trade_status: TradeStatus
      notification_type: NotificationType
    }
  }
}
