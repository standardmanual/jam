export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      abusing_logs: {
        Row: {
          created_at: string
          detail: Json | null
          event_type: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          detail?: Json | null
          event_type: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          detail?: Json | null
          event_type?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "abusing_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      abusing_policy: {
        Row: {
          gps_daily_distance_cap_km: number
          gps_max_speed_kmh: number
          hard_common_rate: number
          hard_epic_rate: number
          hard_mystic_rate: number
          hard_rare_rate: number
          id: number
          poi_block_hours: number
          soft_common_rate: number
          soft_epic_rate: number
          soft_mystic_rate: number
          soft_rare_rate: number
          updated_at: string
          vehicle_speed_filter_kmh: number
        }
        Insert: {
          gps_daily_distance_cap_km?: number
          gps_max_speed_kmh?: number
          hard_common_rate?: number
          hard_epic_rate?: number
          hard_mystic_rate?: number
          hard_rare_rate?: number
          id?: number
          poi_block_hours?: number
          soft_common_rate?: number
          soft_epic_rate?: number
          soft_mystic_rate?: number
          soft_rare_rate?: number
          updated_at?: string
          vehicle_speed_filter_kmh?: number
        }
        Update: {
          gps_daily_distance_cap_km?: number
          gps_max_speed_kmh?: number
          hard_common_rate?: number
          hard_epic_rate?: number
          hard_mystic_rate?: number
          hard_rare_rate?: number
          id?: number
          poi_block_hours?: number
          soft_common_rate?: number
          soft_epic_rate?: number
          soft_mystic_rate?: number
          soft_rare_rate?: number
          updated_at?: string
          vehicle_speed_filter_kmh?: number
        }
        Relationships: []
      }
      ambient_drop_config: {
        Row: {
          all_random: boolean
          auto_enabled: boolean
          batch_size: number
          category_mode: string
          category_slug: string | null
          collection_ids: string[]
          collection_mode: string
          exclusion_window_minutes: number
          id: number
          max_active_per_poi: number
          rarity_common: number
          rarity_epic: number
          rarity_mode: string
          rarity_mystic: number
          rarity_rare: number
          updated_at: string
        }
        Insert: {
          all_random?: boolean
          auto_enabled?: boolean
          batch_size?: number
          category_mode?: string
          category_slug?: string | null
          collection_ids?: string[]
          collection_mode?: string
          exclusion_window_minutes?: number
          id?: number
          max_active_per_poi?: number
          rarity_common?: number
          rarity_epic?: number
          rarity_mode?: string
          rarity_mystic?: number
          rarity_rare?: number
          updated_at?: string
        }
        Update: {
          all_random?: boolean
          auto_enabled?: boolean
          batch_size?: number
          category_mode?: string
          category_slug?: string | null
          collection_ids?: string[]
          collection_mode?: string
          exclusion_window_minutes?: number
          id?: number
          max_active_per_poi?: number
          rarity_common?: number
          rarity_epic?: number
          rarity_mode?: string
          rarity_mystic?: number
          rarity_rare?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ambient_drop_config_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "poi_categories"
            referencedColumns: ["slug"]
          },
        ]
      }
      badge_metric_labels: {
        Row: {
          label_ko: string
          metric_key: string
          unit_ko: string | null
          updated_at: string
        }
        Insert: {
          label_ko: string
          metric_key: string
          unit_ko?: string | null
          updated_at?: string
        }
        Update: {
          label_ko?: string
          metric_key?: string
          unit_ko?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      badges: {
        Row: {
          activity_types: string[]
          background_animation: Json | null
          background_color: string | null
          background_image_url: string | null
          background_shader_id: string | null
          background_video_url: string | null
          category: string | null
          condition_json: Json | null
          created_at: string
          deleted_at: string | null
          description: string
          drop_condition_json: Json | null
          drop_weight: number
          faction_id: string | null
          id: string
          image_gen_params: Json | null
          image_url: string | null
          item_book_id: string | null
          name: string
          patch_available: boolean
          patch_price_krw: number | null
          point_reward: number
          rarity: Database["public"]["Enums"]["badge_rarity"]
          type: Database["public"]["Enums"]["badge_type"]
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          activity_types?: string[]
          background_animation?: Json | null
          background_color?: string | null
          background_image_url?: string | null
          background_shader_id?: string | null
          background_video_url?: string | null
          category?: string | null
          condition_json?: Json | null
          created_at?: string
          deleted_at?: string | null
          description: string
          drop_condition_json?: Json | null
          drop_weight?: number
          faction_id?: string | null
          id?: string
          image_gen_params?: Json | null
          image_url?: string | null
          item_book_id?: string | null
          name: string
          patch_available?: boolean
          patch_price_krw?: number | null
          point_reward?: number
          rarity?: Database["public"]["Enums"]["badge_rarity"]
          type: Database["public"]["Enums"]["badge_type"]
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          activity_types?: string[]
          background_animation?: Json | null
          background_color?: string | null
          background_image_url?: string | null
          background_shader_id?: string | null
          background_video_url?: string | null
          category?: string | null
          condition_json?: Json | null
          created_at?: string
          deleted_at?: string | null
          description?: string
          drop_condition_json?: Json | null
          drop_weight?: number
          faction_id?: string | null
          id?: string
          image_gen_params?: Json | null
          image_url?: string | null
          item_book_id?: string | null
          name?: string
          patch_available?: boolean
          patch_price_krw?: number | null
          point_reward?: number
          rarity?: Database["public"]["Enums"]["badge_rarity"]
          type?: Database["public"]["Enums"]["badge_type"]
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "badges_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "poi_categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "badges_faction_id_fkey"
            columns: ["faction_id"]
            isOneToOne: false
            referencedRelation: "factions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "badges_item_book_id_fkey"
            columns: ["item_book_id"]
            isOneToOne: false
            referencedRelation: "item_books"
            referencedColumns: ["id"]
          },
        ]
      }
      combination_recipes: {
        Row: {
          created_at: string
          hint_text: string | null
          id: string
          ingredient_badge_ids: string[]
          is_public: boolean
          required_activity_badge_id: string | null
          result_badge_id: string | null
          success_rate: number
        }
        Insert: {
          created_at?: string
          hint_text?: string | null
          id?: string
          ingredient_badge_ids: string[]
          is_public?: boolean
          required_activity_badge_id?: string | null
          result_badge_id?: string | null
          success_rate?: number
        }
        Update: {
          created_at?: string
          hint_text?: string | null
          id?: string
          ingredient_badge_ids?: string[]
          is_public?: boolean
          required_activity_badge_id?: string | null
          result_badge_id?: string | null
          success_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "combination_recipes_required_activity_badge_id_fkey"
            columns: ["required_activity_badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combination_recipes_result_badge_id_fkey"
            columns: ["result_badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
      }
      combine_policy: {
        Row: {
          id: number
          pity_points_base: number
          pity_points_cap: number
          pity_points_increment: number
          pity_points_start_streak: number
          pity_points_step: number
          pity_prob_cap: number
          pity_prob_increment: number
          tier1_b_count: number
          tier1_b_rate: number
          tier1_max_items: number
          tier1_min_factions: number
          tier2_b_count: number
          tier2_b_rate: number
          tier2_max_items: number
          tier2_min_factions: number
          tier3_b_count: number
          tier3_b_rate: number
          tier3_max_items: number
          tier3_min_factions: number
          updated_at: string
        }
        Insert: {
          id?: number
          pity_points_base?: number
          pity_points_cap?: number
          pity_points_increment?: number
          pity_points_start_streak?: number
          pity_points_step?: number
          pity_prob_cap?: number
          pity_prob_increment?: number
          tier1_b_count?: number
          tier1_b_rate?: number
          tier1_max_items?: number
          tier1_min_factions?: number
          tier2_b_count?: number
          tier2_b_rate?: number
          tier2_max_items?: number
          tier2_min_factions?: number
          tier3_b_count?: number
          tier3_b_rate?: number
          tier3_max_items?: number
          tier3_min_factions?: number
          updated_at?: string
        }
        Update: {
          id?: number
          pity_points_base?: number
          pity_points_cap?: number
          pity_points_increment?: number
          pity_points_start_streak?: number
          pity_points_step?: number
          pity_prob_cap?: number
          pity_prob_increment?: number
          tier1_b_count?: number
          tier1_b_rate?: number
          tier1_max_items?: number
          tier1_min_factions?: number
          tier2_b_count?: number
          tier2_b_rate?: number
          tier2_max_items?: number
          tier2_min_factions?: number
          tier3_b_count?: number
          tier3_b_rate?: number
          tier3_max_items?: number
          tier3_min_factions?: number
          updated_at?: string
        }
        Relationships: []
      }
      custody_events: {
        Row: {
          actor_user_id: string | null
          actor_username: string | null
          created_at: string
          event_type: string
          from_user_id: string | null
          from_username: string | null
          id: string
          inventory_item_id: string
          poi_id: string | null
          to_user_id: string | null
          to_username: string | null
        }
        Insert: {
          actor_user_id?: string | null
          actor_username?: string | null
          created_at?: string
          event_type: string
          from_user_id?: string | null
          from_username?: string | null
          id?: string
          inventory_item_id: string
          poi_id?: string | null
          to_user_id?: string | null
          to_username?: string | null
        }
        Update: {
          actor_user_id?: string | null
          actor_username?: string | null
          created_at?: string
          event_type?: string
          from_user_id?: string | null
          from_username?: string | null
          id?: string
          inventory_item_id?: string
          poi_id?: string | null
          to_user_id?: string | null
          to_username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custody_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custody_events_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custody_events_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custody_events_poi_id_fkey"
            columns: ["poi_id"]
            isOneToOne: false
            referencedRelation: "poi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custody_events_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      drop_policy: {
        Row: {
          adjacent_weight: number
          bonus_drop_rate: number
          bonus_drop_rate_intense: number
          comeback_gap_days: number
          completed_book_weight: number
          completion_decay: number
          context_override_rate: number
          daily_downgrade_common: number
          daily_downgrade_from: number
          explore_weight: number
          id: number
          intense_duration_min: number
          intense_elevation_m: number
          last_piece_pity_threshold: number
          momentum_weight: number
          mystery_spice_rate: number
          rare_pity_threshold: number
          rarity_common: number
          rarity_epic: number
          rarity_mystic: number
          rarity_rare: number
          same_book_penalty: number
          updated_at: string
          weekly_first_rare_mult: number
        }
        Insert: {
          adjacent_weight?: number
          bonus_drop_rate?: number
          bonus_drop_rate_intense?: number
          comeback_gap_days?: number
          completed_book_weight?: number
          completion_decay?: number
          context_override_rate?: number
          daily_downgrade_common?: number
          daily_downgrade_from?: number
          explore_weight?: number
          id?: number
          intense_duration_min?: number
          intense_elevation_m?: number
          last_piece_pity_threshold?: number
          momentum_weight?: number
          mystery_spice_rate?: number
          rare_pity_threshold?: number
          rarity_common?: number
          rarity_epic?: number
          rarity_mystic?: number
          rarity_rare?: number
          same_book_penalty?: number
          updated_at?: string
          weekly_first_rare_mult?: number
        }
        Update: {
          adjacent_weight?: number
          bonus_drop_rate?: number
          bonus_drop_rate_intense?: number
          comeback_gap_days?: number
          completed_book_weight?: number
          completion_decay?: number
          context_override_rate?: number
          daily_downgrade_common?: number
          daily_downgrade_from?: number
          explore_weight?: number
          id?: number
          intense_duration_min?: number
          intense_elevation_m?: number
          last_piece_pity_threshold?: number
          momentum_weight?: number
          mystery_spice_rate?: number
          rare_pity_threshold?: number
          rarity_common?: number
          rarity_epic?: number
          rarity_mystic?: number
          rarity_rare?: number
          same_book_penalty?: number
          updated_at?: string
          weekly_first_rare_mult?: number
        }
        Relationships: []
      }
      engine_decision_log: {
        Row: {
          created_at: string
          engine: string
          event: string
          id: string
          payload: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          engine: string
          event: string
          id?: string
          payload?: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          engine?: string
          event?: string
          id?: string
          payload?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engine_decision_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      faction_adjacency: {
        Row: {
          adjacent_faction_id: string
          faction_id: string
        }
        Insert: {
          adjacent_faction_id: string
          faction_id: string
        }
        Update: {
          adjacent_faction_id?: string
          faction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "faction_adjacency_adjacent_faction_id_fkey"
            columns: ["adjacent_faction_id"]
            isOneToOne: false
            referencedRelation: "factions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faction_adjacency_faction_id_fkey"
            columns: ["faction_id"]
            isOneToOne: false
            referencedRelation: "factions"
            referencedColumns: ["id"]
          },
        ]
      }
      factions: {
        Row: {
          background_animation: Json | null
          background_color: string | null
          background_image_url: string | null
          background_shader_id: string | null
          background_video_url: string | null
          created_at: string
          description: string | null
          drop_condition_json: Json | null
          drop_weight: number
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          sort_order: number
          tagline: string | null
        }
        Insert: {
          background_animation?: Json | null
          background_color?: string | null
          background_image_url?: string | null
          background_shader_id?: string | null
          background_video_url?: string | null
          created_at?: string
          description?: string | null
          drop_condition_json?: Json | null
          drop_weight?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          sort_order?: number
          tagline?: string | null
        }
        Update: {
          background_animation?: Json | null
          background_color?: string | null
          background_image_url?: string | null
          background_shader_id?: string | null
          background_video_url?: string | null
          created_at?: string
          description?: string | null
          drop_condition_json?: Json | null
          drop_weight?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          sort_order?: number
          tagline?: string | null
        }
        Relationships: []
      }
      inventory: {
        Row: {
          created_at: string
          id: string
          max_slots: number
          used_slots: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_slots?: number
          used_slots?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          max_slots?: number
          used_slots?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          badge_id: string
          destroyed_at: string | null
          drop_id: string | null
          dropped_at: string | null
          expires_at: string | null
          id: string
          inventory_id: string | null
          obtained_at: string
          obtained_by: string
          serial_number: number
          serial_prefix: string | null
          slotted_in: string | null
        }
        Insert: {
          badge_id: string
          destroyed_at?: string | null
          drop_id?: string | null
          dropped_at?: string | null
          expires_at?: string | null
          id?: string
          inventory_id?: string | null
          obtained_at?: string
          obtained_by?: string
          serial_number: number
          serial_prefix?: string | null
          slotted_in?: string | null
        }
        Update: {
          badge_id?: string
          destroyed_at?: string | null
          drop_id?: string | null
          dropped_at?: string | null
          expires_at?: string | null
          id?: string
          inventory_id?: string | null
          obtained_at?: string
          obtained_by?: string
          serial_number?: number
          serial_prefix?: string | null
          slotted_in?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "poi_drops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_slotted_in_fkey"
            columns: ["slotted_in"]
            isOneToOne: false
            referencedRelation: "user_item_book_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      item_books: {
        Row: {
          background_animation: Json | null
          background_color: string | null
          background_image_url: string | null
          background_shader_id: string | null
          background_video_url: string | null
          created_at: string
          description: string
          drop_condition_json: Json | null
          faction_id: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          required_activity_badge_id: string | null
          reward_badge_id: string | null
          story_text: string | null
        }
        Insert: {
          background_animation?: Json | null
          background_color?: string | null
          background_image_url?: string | null
          background_shader_id?: string | null
          background_video_url?: string | null
          created_at?: string
          description: string
          drop_condition_json?: Json | null
          faction_id?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          required_activity_badge_id?: string | null
          reward_badge_id?: string | null
          story_text?: string | null
        }
        Update: {
          background_animation?: Json | null
          background_color?: string | null
          background_image_url?: string | null
          background_shader_id?: string | null
          background_video_url?: string | null
          created_at?: string
          description?: string
          drop_condition_json?: Json | null
          faction_id?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          required_activity_badge_id?: string | null
          reward_badge_id?: string | null
          story_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_books_faction_id_fkey"
            columns: ["faction_id"]
            isOneToOne: false
            referencedRelation: "factions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_books_required_activity_badge_id_fkey"
            columns: ["required_activity_badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_books_reward_badge_id_fkey"
            columns: ["reward_badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_rank_snapshots: {
        Row: {
          captured_at: string
          mission_id: string
          rank: number
          user_id: string
        }
        Insert: {
          captured_at?: string
          mission_id: string
          rank: number
          user_id: string
        }
        Update: {
          captured_at?: string
          mission_id?: string
          rank?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_rank_snapshots_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_rank_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          condition_json: Json
          created_at: string
          description: string | null
          ends_at: string | null
          gated_badge_id: string | null
          id: string
          image_url: string | null
          max_completions: number | null
          mission_type: string
          reward_badge_ids: string[]
          reward_id: string | null
          reward_points: number | null
          reward_type: string | null
          starts_at: string
          status_display_type: string
          title: string
          visible_rank_count: number | null
        }
        Insert: {
          condition_json: Json
          created_at?: string
          description?: string | null
          ends_at?: string | null
          gated_badge_id?: string | null
          id?: string
          image_url?: string | null
          max_completions?: number | null
          mission_type: string
          reward_badge_ids?: string[]
          reward_id?: string | null
          reward_points?: number | null
          reward_type?: string | null
          starts_at: string
          status_display_type?: string
          title: string
          visible_rank_count?: number | null
        }
        Update: {
          condition_json?: Json
          created_at?: string
          description?: string | null
          ends_at?: string | null
          gated_badge_id?: string | null
          id?: string
          image_url?: string | null
          max_completions?: number | null
          mission_type?: string
          reward_badge_ids?: string[]
          reward_id?: string | null
          reward_points?: number | null
          reward_type?: string | null
          starts_at?: string
          status_display_type?: string
          title?: string
          visible_rank_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "missions_gated_badge_id_fkey"
            columns: ["gated_badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_count: number
          actor_user_id: string | null
          bumps_badge: boolean
          created_at: string
          group_key: string | null
          id: string
          payload: Json
          type: Database["public"]["Enums"]["notification_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          actor_count?: number
          actor_user_id?: string | null
          bumps_badge?: boolean
          created_at?: string
          group_key?: string | null
          id?: string
          payload?: Json
          type: Database["public"]["Enums"]["notification_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          actor_count?: number
          actor_user_id?: string | null
          bumps_badge?: boolean
          created_at?: string
          group_key?: string | null
          id?: string
          payload?: Json
          type?: Database["public"]["Enums"]["notification_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      poi: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean
          latitude: number
          linked_badge_id: string | null
          longitude: number
          name: string
          naver_id: string | null
          osm_id: string | null
          poi_tier: number
          radius_meters: number
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          latitude: number
          linked_badge_id?: string | null
          longitude: number
          name: string
          naver_id?: string | null
          osm_id?: string | null
          poi_tier?: number
          radius_meters?: number
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number
          linked_badge_id?: string | null
          longitude?: number
          name?: string
          naver_id?: string | null
          osm_id?: string | null
          poi_tier?: number
          radius_meters?: number
        }
        Relationships: [
          {
            foreignKeyName: "poi_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "poi_categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "poi_linked_badge_id_fkey"
            columns: ["linked_badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
      }
      poi_blocks: {
        Row: {
          blocked_until: string
          created_at: string
          id: string
          poi_id: string
          reason: string
          user_id: string
        }
        Insert: {
          blocked_until: string
          created_at?: string
          id?: string
          poi_id: string
          reason?: string
          user_id: string
        }
        Update: {
          blocked_until?: string
          created_at?: string
          id?: string
          poi_id?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poi_blocks_poi_id_fkey"
            columns: ["poi_id"]
            isOneToOne: false
            referencedRelation: "poi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poi_blocks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      poi_categories: {
        Row: {
          created_at: string
          keywords: string[]
          label: string
          pipeline_linked: boolean
          slug: string
          tier: number | null
        }
        Insert: {
          created_at?: string
          keywords?: string[]
          label: string
          pipeline_linked?: boolean
          slug: string
          tier?: number | null
        }
        Update: {
          created_at?: string
          keywords?: string[]
          label?: string
          pipeline_linked?: boolean
          slug?: string
          tier?: number | null
        }
        Relationships: []
      }
      poi_drops: {
        Row: {
          badge_id: string
          dropped_at: string
          dropper_user_id: string | null
          expires_at: string | null
          id: string
          inventory_item_id: string | null
          is_available: boolean
          picked_up_at: string | null
          picked_up_by: string | null
          poi_id: string
          source: string
        }
        Insert: {
          badge_id: string
          dropped_at?: string
          dropper_user_id?: string | null
          expires_at?: string | null
          id?: string
          inventory_item_id?: string | null
          is_available?: boolean
          picked_up_at?: string | null
          picked_up_by?: string | null
          poi_id: string
          source?: string
        }
        Update: {
          badge_id?: string
          dropped_at?: string
          dropper_user_id?: string | null
          expires_at?: string | null
          id?: string
          inventory_item_id?: string | null
          is_available?: boolean
          picked_up_at?: string | null
          picked_up_by?: string | null
          poi_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "poi_drops_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poi_drops_dropper_user_id_fkey"
            columns: ["dropper_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poi_drops_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poi_drops_picked_up_by_fkey"
            columns: ["picked_up_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poi_drops_poi_id_fkey"
            columns: ["poi_id"]
            isOneToOne: false
            referencedRelation: "poi"
            referencedColumns: ["id"]
          },
        ]
      }
      poi_search_cache: {
        Row: {
          category: string
          grid_key: string
          had_results: boolean
          searched_at: string
        }
        Insert: {
          category: string
          grid_key: string
          had_results?: boolean
          searched_at?: string
        }
        Update: {
          category?: string
          grid_key?: string
          had_results?: boolean
          searched_at?: string
        }
        Relationships: []
      }
      poi_views: {
        Row: {
          id: string
          poi_id: string
          user_id: string
          viewed_at: string
          viewed_on: string
        }
        Insert: {
          id?: string
          poi_id: string
          user_id: string
          viewed_at?: string
          viewed_on: string
        }
        Update: {
          id?: string
          poi_id?: string
          user_id?: string
          viewed_at?: string
          viewed_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "poi_views_poi_id_fkey"
            columns: ["poi_id"]
            isOneToOne: false
            referencedRelation: "poi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poi_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      point_transactions: {
        Row: {
          admin_reason_label: string | null
          admin_reason_note: string | null
          amount: number
          created_at: string
          id: string
          reason: string
          source_badge_id: string | null
          source_mission_id: string | null
          user_id: string
        }
        Insert: {
          admin_reason_label?: string | null
          admin_reason_note?: string | null
          amount: number
          created_at?: string
          id?: string
          reason: string
          source_badge_id?: string | null
          source_mission_id?: string | null
          user_id: string
        }
        Update: {
          admin_reason_label?: string | null
          admin_reason_note?: string | null
          amount?: number
          created_at?: string
          id?: string
          reason?: string
          source_badge_id?: string | null
          source_mission_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "point_transactions_source_badge_id_fkey"
            columns: ["source_badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_transactions_source_mission_id_fkey"
            columns: ["source_mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      point_treasury: {
        Row: {
          id: number
          total_minted: number
          total_reclaimed: number
          updated_at: string
        }
        Insert: {
          id?: number
          total_minted?: number
          total_reclaimed?: number
          updated_at?: string
        }
        Update: {
          id?: number
          total_minted?: number
          total_reclaimed?: number
          updated_at?: string
        }
        Relationships: []
      }
      point_wallets: {
        Row: {
          balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "point_wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      strava_activities: {
        Row: {
          created_at: string
          distance_km: number | null
          id: string
          jam_activity_type: string | null
          normalized: Json
          processed_at: string
          processed_via: string
          start_date: string
          strava_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          distance_km?: number | null
          id?: string
          jam_activity_type?: string | null
          normalized?: Json
          processed_at?: string
          processed_via?: string
          start_date: string
          strava_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          distance_km?: number | null
          id?: string
          jam_activity_type?: string | null
          normalized?: Json
          processed_at?: string
          processed_via?: string
          start_date?: string
          strava_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strava_activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      strava_connections: {
        Row: {
          access_token: string
          backfill_completed: boolean
          created_at: string
          id: string
          last_synced_at: string | null
          refresh_token: string
          strava_athlete_id: number
          token_expires_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          backfill_completed?: boolean
          created_at?: string
          id?: string
          last_synced_at?: string | null
          refresh_token: string
          strava_athlete_id: number
          token_expires_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          backfill_completed?: boolean
          created_at?: string
          id?: string
          last_synced_at?: string | null
          refresh_token?: string
          strava_athlete_id?: number
          token_expires_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strava_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      theme_presets: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          main_color: string
          name: string
          sub_color: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          main_color: string
          name: string
          sub_color: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          main_color?: string
          name?: string
          sub_color?: string
        }
        Relationships: []
      }
      today_cards: {
        Row: {
          badge_ids: string[]
          body_markdown: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          ends_at: string
          exposure_tags: string[]
          id: string
          is_active: boolean
          item_book_id: string | null
          layout_type: string
          mission_id: string | null
          region_label: string | null
          sort_order: number
          starts_at: string
          subtitle: string | null
          target_href: string | null
          template_type: string
          title: string
        }
        Insert: {
          badge_ids?: string[]
          body_markdown?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          ends_at: string
          exposure_tags?: string[]
          id?: string
          is_active?: boolean
          item_book_id?: string | null
          layout_type?: string
          mission_id?: string | null
          region_label?: string | null
          sort_order?: number
          starts_at: string
          subtitle?: string | null
          target_href?: string | null
          template_type: string
          title: string
        }
        Update: {
          badge_ids?: string[]
          body_markdown?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string
          exposure_tags?: string[]
          id?: string
          is_active?: boolean
          item_book_id?: string | null
          layout_type?: string
          mission_id?: string | null
          region_label?: string | null
          sort_order?: number
          starts_at?: string
          subtitle?: string | null
          target_href?: string | null
          template_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "today_cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "today_cards_item_book_id_fkey"
            columns: ["item_book_id"]
            isOneToOne: false
            referencedRelation: "item_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "today_cards_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          created_at: string
          id: string
          offer_item_id: string
          receiver_id: string
          request_item_id: string
          sender_id: string
          status: Database["public"]["Enums"]["trade_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          offer_item_id: string
          receiver_id: string
          request_item_id: string
          sender_id: string
          status?: Database["public"]["Enums"]["trade_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          offer_item_id?: string
          receiver_id?: string
          request_item_id?: string
          sender_id?: string
          status?: Database["public"]["Enums"]["trade_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_offer_item_id_fkey"
            columns: ["offer_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_request_item_id_fkey"
            columns: ["request_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_badges: {
        Row: {
          badge_id: string
          condition_snapshot: Json | null
          earned_at: string
          id: string
          share_card_url: string | null
          triggered_by: string | null
          triggered_by_activity_date: string | null
          triggered_by_activity_name: string | null
          triggered_by_distance_km: number | null
          triggered_by_poi_id: string | null
          triggered_by_strava_id: number | null
          user_id: string
        }
        Insert: {
          badge_id: string
          condition_snapshot?: Json | null
          earned_at?: string
          id?: string
          share_card_url?: string | null
          triggered_by?: string | null
          triggered_by_activity_date?: string | null
          triggered_by_activity_name?: string | null
          triggered_by_distance_km?: number | null
          triggered_by_poi_id?: string | null
          triggered_by_strava_id?: number | null
          user_id: string
        }
        Update: {
          badge_id?: string
          condition_snapshot?: Json | null
          earned_at?: string
          id?: string
          share_card_url?: string | null
          triggered_by?: string | null
          triggered_by_activity_date?: string | null
          triggered_by_activity_name?: string | null
          triggered_by_distance_km?: number | null
          triggered_by_poi_id?: string | null
          triggered_by_strava_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_activity_badges_triggered_by_poi_id_fkey"
            columns: ["triggered_by_poi_id"]
            isOneToOne: false
            referencedRelation: "poi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_activity_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_feed: {
        Row: {
          created_at: string
          event_at: string
          event_type: Database["public"]["Enums"]["feed_event_type"]
          id: string
          metadata: Json
          strava_activity_id: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_at?: string
          event_type: Database["public"]["Enums"]["feed_event_type"]
          id?: string
          metadata?: Json
          strava_activity_id?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_at?: string
          event_type?: Database["public"]["Enums"]["feed_event_type"]
          id?: string
          metadata?: Json
          strava_activity_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_feed_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_checkin_badge_earns: {
        Row: {
          badge_id: string
          earned_at: string
          id: string
          poi_id: string
          triggered_by_activity_date: string | null
          triggered_by_activity_name: string | null
          triggered_by_distance_km: number | null
          triggered_by_strava_id: number | null
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          id?: string
          poi_id: string
          triggered_by_activity_date?: string | null
          triggered_by_activity_name?: string | null
          triggered_by_distance_km?: number | null
          triggered_by_strava_id?: number | null
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          id?: string
          poi_id?: string
          triggered_by_activity_date?: string | null
          triggered_by_activity_name?: string | null
          triggered_by_distance_km?: number | null
          triggered_by_strava_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_checkin_badge_earns_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_checkin_badge_earns_poi_id_fkey"
            columns: ["poi_id"]
            isOneToOne: false
            referencedRelation: "poi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_checkin_badge_earns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_combine_state: {
        Row: {
          consecutive_fail_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          consecutive_fail_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          consecutive_fail_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_combine_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_drop_state: {
        Row: {
          common_streak: number
          daily_drop_count: number
          daily_drop_date: string | null
          last_activity_at: string | null
          last_drop_book_id: string | null
          last_drop_faction_id: string | null
          last_piece_pity: Json
          total_drops: number
          updated_at: string
          user_id: string
        }
        Insert: {
          common_streak?: number
          daily_drop_count?: number
          daily_drop_date?: string | null
          last_activity_at?: string | null
          last_drop_book_id?: string | null
          last_drop_faction_id?: string | null
          last_piece_pity?: Json
          total_drops?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          common_streak?: number
          daily_drop_count?: number
          daily_drop_date?: string | null
          last_activity_at?: string | null
          last_drop_book_id?: string | null
          last_drop_faction_id?: string | null
          last_piece_pity?: Json
          total_drops?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_drop_state_last_drop_book_id_fkey"
            columns: ["last_drop_book_id"]
            isOneToOne: false
            referencedRelation: "item_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_drop_state_last_drop_faction_id_fkey"
            columns: ["last_drop_faction_id"]
            isOneToOne: false
            referencedRelation: "factions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_drop_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_family_progress: {
        Row: {
          activity_type: string
          current: Json
          family_name: string
          last_activity_id: string | null
          prev: Json | null
          progress: number
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_type: string
          current: Json
          family_name: string
          last_activity_id?: string | null
          prev?: Json | null
          progress: number
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_type?: string
          current?: Json
          family_name?: string
          last_activity_id?: string | null
          prev?: Json | null
          progress?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_family_progress_last_activity_id_fkey"
            columns: ["last_activity_id"]
            isOneToOne: false
            referencedRelation: "strava_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_family_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_follows: {
        Row: {
          created_at: string | null
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string | null
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string | null
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_item_book_completions: {
        Row: {
          completed_at: string
          item_book_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          item_book_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          item_book_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_item_book_completions_item_book_id_fkey"
            columns: ["item_book_id"]
            isOneToOne: false
            referencedRelation: "item_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_item_book_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_item_book_slots: {
        Row: {
          badge_id: string
          id: string
          inventory_item_id: string
          item_book_id: string
          slotted_at: string
          user_id: string
        }
        Insert: {
          badge_id: string
          id?: string
          inventory_item_id: string
          item_book_id: string
          slotted_at?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          id?: string
          inventory_item_id?: string
          item_book_id?: string
          slotted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_item_book_slots_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_item_book_slots_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_item_book_slots_item_book_id_fkey"
            columns: ["item_book_id"]
            isOneToOne: false
            referencedRelation: "item_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_item_book_slots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_mission_completions: {
        Row: {
          completed_at: string
          id: string
          mission_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          id?: string
          mission_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          id?: string
          mission_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_mission_completions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mission_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_mission_participations: {
        Row: {
          id: string
          joined_at: string
          mission_id: string
          progress_value: number
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          mission_id: string
          progress_value?: number
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          mission_id?: string
          progress_value?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_mission_participations_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mission_participations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_shadow_bans: {
        Row: {
          ban_level: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          ban_level: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          reason?: string
          user_id: string
        }
        Update: {
          ban_level?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_shadow_bans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          activity_types: string[]
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          gps_daily_distance_date: string | null
          gps_daily_distance_km: number
          id: string
          initial_sync_done: boolean
          is_admin: boolean
          last_location_at: string | null
          last_location_lat: number | null
          last_location_lng: number | null
          notifications_seen_at: string | null
          region: string
          updated_at: string
          username: string | null
        }
        Insert: {
          activity_types?: string[]
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          gps_daily_distance_date?: string | null
          gps_daily_distance_km?: number
          id: string
          initial_sync_done?: boolean
          is_admin?: boolean
          last_location_at?: string | null
          last_location_lat?: number | null
          last_location_lng?: number | null
          notifications_seen_at?: string | null
          region?: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          activity_types?: string[]
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          gps_daily_distance_date?: string | null
          gps_daily_distance_km?: number
          id?: string
          initial_sync_done?: boolean
          is_admin?: boolean
          last_location_at?: string | null
          last_location_lat?: number | null
          last_location_lng?: number | null
          notifications_seen_at?: string | null
          region?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_theme_preset: {
        Args: { p_preset_id: string }
        Returns: undefined
      }
      admin_destroy_orphaned_item: {
        Args: { p_admin_id: string; p_item_id: string }
        Returns: Json
      }
      admin_reassign_orphaned_item: {
        Args: {
          p_admin_id: string
          p_item_id: string
          p_target_user_id: string
        }
        Returns: Json
      }
      apply_faction_background_cascade: {
        Args: { p_faction_id: string }
        Returns: {
          direct_badges: number
          item_book_badges: number
          item_books: number
        }[]
      }
      award_points: {
        Args: {
          p_admin_reason_label?: string
          p_admin_reason_note?: string
          p_amount: number
          p_reason: string
          p_source_badge_id?: string
          p_source_mission_id?: string
          p_user_id: string
        }
        Returns: {
          admin_reason_label: string | null
          admin_reason_note: string | null
          amount: number
          created_at: string
          id: string
          reason: string
          source_badge_id: string | null
          source_mission_id: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "point_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      count_faction_background_cascade: {
        Args: { p_faction_id: string }
        Returns: {
          direct_badges: number
          item_book_badges: number
          item_books: number
        }[]
      }
      create_notification: {
        Args: {
          p_actor_user_id?: string
          p_append_keys?: string[]
          p_bumps_badge?: boolean
          p_group_key?: string
          p_mode?: string
          p_payload?: Json
          p_sum_keys?: string[]
          p_type: Database["public"]["Enums"]["notification_type"]
          p_user_id: string
        }
        Returns: {
          actor_count: number
          actor_user_id: string | null
          bumps_badge: boolean
          created_at: string
          group_key: string | null
          id: string
          payload: Json
          type: Database["public"]["Enums"]["notification_type"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_user_drop: {
        Args: {
          p_dropper_id: string
          p_inventory_item_id: string
          p_poi_id: string
        }
        Returns: Json
      }
      expire_stale_poi_drops: { Args: never; Returns: Json }
      jsonb_as_array: { Args: { p_value: Json }; Returns: Json }
      jsonb_merge_sum: {
        Args: {
          p_append_keys?: string[]
          p_new: Json
          p_old: Json
          p_sum_keys: string[]
        }
        Returns: Json
      }
      mint_and_place_ambient_drop: {
        Args: { p_badge_id: string; p_poi_id: string }
        Returns: Json
      }
      pickup_drop: {
        Args: { p_drop_id: string; p_inventory_id: string; p_picker_id: string }
        Returns: Json
      }
      slot_item_into_book: {
        Args: {
          p_inventory_item_id: string
          p_item_book_id: string
          p_user_id: string
        }
        Returns: Json
      }
      unslot_item_from_book: {
        Args: { p_slot_id: string; p_user_id: string }
        Returns: Json
      }
    }
    Enums: {
      badge_rarity: "common" | "rare" | "epic" | "mystic"
      badge_type: "activity" | "item" | "checkin"
      feed_event_type:
        | "badge_earned"
        | "item_dropped"
        | "item_picked_up"
        | "mission_joined"
        | "mission_completed"
        | "mission_cancelled"
      notification_type:
        | "badge_earned"
        | "rare_badge_earned"
        | "item_badge_earned"
        | "checkin_badge_earned"
        | "points_earned"
        | "first_badge"
        | "collection_slottable"
        | "collection_near_complete"
        | "collection_completable"
        | "drop_picked_up"
        | "drop_spot_active"
        | "mission_milestone"
        | "mission_deadline"
        | "mission_completed"
        | "mission_rank_up"
        | "mission_ended"
        | "followed"
        | "mutual_follow"
        | "following_rare_badge"
        | "following_collection_complete"
        | "following_mission_complete"
        | "following_nearby_drop"
        | "nearby_drops"
        | "strava_disconnected"
        | "sync_stalled"
        | "inventory_full"
        | "admin_points_changed"
        | "announcement"
        | "activity_recap"
      trade_status: "pending" | "accepted" | "rejected" | "expired"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      badge_rarity: ["common", "rare", "epic", "mystic"],
      badge_type: ["activity", "item", "checkin"],
      feed_event_type: [
        "badge_earned",
        "item_dropped",
        "item_picked_up",
        "mission_joined",
        "mission_completed",
        "mission_cancelled",
      ],
      notification_type: [
        "badge_earned",
        "rare_badge_earned",
        "item_badge_earned",
        "checkin_badge_earned",
        "points_earned",
        "first_badge",
        "collection_slottable",
        "collection_near_complete",
        "collection_completable",
        "drop_picked_up",
        "drop_spot_active",
        "mission_milestone",
        "mission_deadline",
        "mission_completed",
        "mission_rank_up",
        "mission_ended",
        "followed",
        "mutual_follow",
        "following_rare_badge",
        "following_collection_complete",
        "following_mission_complete",
        "following_nearby_drop",
        "nearby_drops",
        "strava_disconnected",
        "sync_stalled",
        "inventory_full",
        "admin_points_changed",
        "announcement",
        "activity_recap",
      ],
      trade_status: ["pending", "accepted", "rejected", "expired"],
    },
  },
} as const
