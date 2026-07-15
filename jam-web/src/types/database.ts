/**
 * JAM! DB 스키마 기반 TypeScript 타입 정의
 * 기반: PRD/02_DATA_MODEL.md + supabase/migrations/001_initial_schema.sql
 *
 * 주의: supabase gen types typescript 명령으로 자동 생성 가능하나
 * Supabase 프로젝트 연결 전이므로 수동 정의
 */

export type ActivityType = 'cycling' | 'running' | 'hiking' | 'walking'
export type DropRarity = 'common' | 'rare' | 'legendary' | 'mythic' | 'none'
export type BadgeType = 'activity' | 'item'
export type BadgeRarity = 'common' | 'rare' | 'legendary' | 'mythic'
export type PoiCategory = 'mountain' | 'bike_route' | 'trail' | 'park' | 'other'
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
  created_at: string
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

export interface PoiDropRow {
  id: string
  dropper_user_id: string
  poi_id: string
  badge_id: string
  dropped_at: string
  picked_up_by: string | null
  picked_up_at: string | null
  is_available: boolean
  expires_at: string
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
  poi_tier: number
  created_at: string
}

// =========================================
// Phase 6: 드랍/픽업 시스템 Row 타입
// =========================================

export interface DropEventRow {
  id: string
  name: string
  badge_id: string
  latitude: number
  longitude: number
  radius_meters: number
  total_quantity: number
  claimed_quantity: number
  starts_at: string
  ends_at: string | null
  is_active: boolean
  created_at: string
}

export interface DropClaimRow {
  id: string
  drop_event_id: string
  user_id: string
  claimed_at: string
  strava_activity_id: string | null
}

export interface DropProbabilityRow {
  id: string
  rarity: DropRarity
  probability: number
  updated_at: string
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
  result_badge_id: string
  success_rate: number
  hint_text: string | null
  is_public: boolean
  created_at: string
}

// =========================================
// Phase 16: 다이나믹 미션
// =========================================

export type MissionType = 'distance' | 'poi_visit' | 'activity_count' | 'item_collect'
export type MissionRewardType = 'badge' | 'points' | 'item_badge'

export interface MissionCondition {
  /** distance 타입: 목표 거리 km */
  distance_km?: number
  /** distance/activity_count 타입: 활동 종류 필터 */
  activity_type?: ActivityType
  /** poi_visit 타입: 목표 POI ID */
  poi_id?: string
  /** activity_count 타입: 목표 횟수 */
  count?: number
  /** item_collect 타입: 수집 목표 배지 ID */
  badge_id?: string
}

export interface MissionRow {
  id: string
  title: string
  description: string | null
  mission_type: MissionType
  condition_json: MissionCondition
  reward_type: MissionRewardType
  reward_id: string | null
  reward_points: number | null
  starts_at: string
  ends_at: string
  max_completions: number | null
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
  /** 최소 속도 (km/h) */
  min_speed_kmh?: number
  /** POI ID (Phase 2+) */
  poi_id?: string
  /** 단일 활동 최소 이동 시간 (분) */
  duration_minutes?: number
  /** 주말 활동 최소 이동 시간 (시간) */
  weekend_duration_hours?: number
  /** 같은 주 내 최소 활동 횟수 */
  weekly_count?: number
  /** 특정 월 (1-12) */
  month?: number
  /** 특정 월 내 최소 누적 거리 (km) */
  monthly_km?: number
  /** 특정 계절 내 활동 횟수 — condition_json에 season 필드 없어 현재 미구현 */
  season_count?: number
  /** 최저 기온 조건 — 날씨 데이터 미구현 */
  temperature_min_c?: number
  /** 최고 기온 조건 — 날씨 데이터 미구현 */
  temperature_max_c?: number
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
// Supabase Database 제네릭 타입 (createClient에 주입)
// =========================================
export interface Database {
  public: {
    Tables: {
      users: {
        Row: UserRow
        Insert: Omit<UserRow, 'created_at' | 'updated_at'> & {
          created_at?: string
          updated_at?: string
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
      drop_events: {
        Row: DropEventRow
        Insert: Omit<DropEventRow, 'id' | 'claimed_quantity' | 'created_at'> & {
          id?: string
          claimed_quantity?: number
          created_at?: string
        }
        Update: Partial<Omit<DropEventRow, 'id'>>
        Relationships: []
      }
      drop_claims: {
        Row: DropClaimRow
        Insert: Omit<DropClaimRow, 'id' | 'claimed_at'> & {
          id?: string
          claimed_at?: string
        }
        Update: Partial<Omit<DropClaimRow, 'id'>>
        Relationships: []
      }
      drop_probability: {
        Row: DropProbabilityRow
        Insert: Omit<DropProbabilityRow, 'id' | 'updated_at'> & {
          id?: string
          updated_at?: string
        }
        Update: Partial<Omit<DropProbabilityRow, 'id'>>
        Relationships: []
      }
      poi_drops: {
        Row: PoiDropRow
        Insert: Omit<PoiDropRow, 'id' | 'dropped_at' | 'picked_up_by' | 'picked_up_at' | 'is_available'> & {
          id?: string
          dropped_at?: string
          picked_up_by?: string | null
          picked_up_at?: string | null
          is_available?: boolean
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
    }
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: {
      badge_type: BadgeType
      badge_rarity: BadgeRarity
      poi_category: PoiCategory
      trade_status: TradeStatus
    }
  }
}
