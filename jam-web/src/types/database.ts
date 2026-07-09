/**
 * JAM! DB 스키마 기반 TypeScript 타입 정의
 * 기반: PRD/02_DATA_MODEL.md + supabase/migrations/001_initial_schema.sql
 *
 * 주의: supabase gen types typescript 명령으로 자동 생성 가능하나
 * Supabase 프로젝트 연결 전이므로 수동 정의
 */

export type ActivityType = 'cycling' | 'running' | 'hiking' | 'walking'
export type BadgeType = 'activity' | 'item'
export type BadgeRarity = 'common' | 'rare' | 'legendary' | 'mythic'
export type PoiCategory = 'mountain' | 'bike_route' | 'trail' | 'park' | 'other'
export type TradeStatus = 'pending' | 'accepted' | 'rejected' | 'expired'
export type ItemObtainedBy = 'drop' | 'system_event'

// =========================================
// 테이블 Row 타입
// =========================================

export interface UserRow {
  id: string
  email: string
  display_name: string
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
  image_url: string
  condition_json: BadgeCondition | null
  activity_types: ActivityType[]
  patch_available: boolean
  patch_price_krw: number | null
  created_at: string
}

export interface UserActivityBadgeRow {
  id: string
  user_id: string
  badge_id: string
  earned_at: string
  triggered_by: string | null
  share_card_url: string | null
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
  obtained_at: string
  obtained_by: ItemObtainedBy
  expires_at: string | null
}

export interface ItemBookRow {
  id: string
  name: string
  description: string
  required_activity_badge_id: string
  required_item_badge_ids: string[] // UUID 배열
  reward_badge_id: string | null
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
