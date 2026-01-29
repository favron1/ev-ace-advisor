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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      arbitrage_config: {
        Row: {
          created_at: string | null
          default_stake_amount: number | null
          id: string
          max_exposure_per_event: number | null
          min_confidence: number | null
          min_edge_percent: number | null
          min_liquidity: number | null
          notifications_enabled: boolean | null
          time_to_resolution_hours: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          default_stake_amount?: number | null
          id?: string
          max_exposure_per_event?: number | null
          min_confidence?: number | null
          min_edge_percent?: number | null
          min_liquidity?: number | null
          notifications_enabled?: boolean | null
          time_to_resolution_hours?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          default_stake_amount?: number | null
          id?: string
          max_exposure_per_event?: number | null
          min_confidence?: number | null
          min_edge_percent?: number | null
          min_liquidity?: number | null
          notifications_enabled?: boolean | null
          time_to_resolution_hours?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      bookmaker_signals: {
        Row: {
          bookmaker: string
          captured_at: string | null
          commence_time: string | null
          confirming_books: number | null
          event_name: string
          id: string
          implied_probability: number
          is_sharp_book: boolean | null
          market_type: string
          movement_speed: number | null
          odds: number
          odds_movement: number | null
          outcome: string
          previous_odds: number | null
        }
        Insert: {
          bookmaker: string
          captured_at?: string | null
          commence_time?: string | null
          confirming_books?: number | null
          event_name: string
          id?: string
          implied_probability: number
          is_sharp_book?: boolean | null
          market_type: string
          movement_speed?: number | null
          odds: number
          odds_movement?: number | null
          outcome: string
          previous_odds?: number | null
        }
        Update: {
          bookmaker?: string
          captured_at?: string | null
          commence_time?: string | null
          confirming_books?: number | null
          event_name?: string
          id?: string
          implied_probability?: number
          is_sharp_book?: boolean | null
          market_type?: string
          movement_speed?: number | null
          odds?: number
          odds_movement?: number | null
          outcome?: string
          previous_odds?: number | null
        }
        Relationships: []
      }
      event_watch_state: {
        Row: {
          active_until: string | null
          bookmaker_market_key: string | null
          bookmaker_source: string | null
          commence_time: string | null
          created_at: string | null
          current_probability: number | null
          escalated_at: string | null
          event_key: string
          event_name: string
          hold_start_at: string | null
          id: string
          initial_probability: number | null
          last_poly_refresh: string | null
          movement_pct: number | null
          movement_velocity: number | null
          outcome: string | null
          peak_probability: number | null
          polymarket_condition_id: string | null
          polymarket_market_id: string | null
          polymarket_matched: boolean | null
          polymarket_price: number | null
          polymarket_question: string | null
          polymarket_volume: number | null
          polymarket_yes_price: number | null
          reverted: boolean | null
          samples_since_hold: number | null
          updated_at: string | null
          watch_state: string | null
        }
        Insert: {
          active_until?: string | null
          bookmaker_market_key?: string | null
          bookmaker_source?: string | null
          commence_time?: string | null
          created_at?: string | null
          current_probability?: number | null
          escalated_at?: string | null
          event_key: string
          event_name: string
          hold_start_at?: string | null
          id?: string
          initial_probability?: number | null
          last_poly_refresh?: string | null
          movement_pct?: number | null
          movement_velocity?: number | null
          outcome?: string | null
          peak_probability?: number | null
          polymarket_condition_id?: string | null
          polymarket_market_id?: string | null
          polymarket_matched?: boolean | null
          polymarket_price?: number | null
          polymarket_question?: string | null
          polymarket_volume?: number | null
          polymarket_yes_price?: number | null
          reverted?: boolean | null
          samples_since_hold?: number | null
          updated_at?: string | null
          watch_state?: string | null
        }
        Update: {
          active_until?: string | null
          bookmaker_market_key?: string | null
          bookmaker_source?: string | null
          commence_time?: string | null
          created_at?: string | null
          current_probability?: number | null
          escalated_at?: string | null
          event_key?: string
          event_name?: string
          hold_start_at?: string | null
          id?: string
          initial_probability?: number | null
          last_poly_refresh?: string | null
          movement_pct?: number | null
          movement_velocity?: number | null
          outcome?: string | null
          peak_probability?: number | null
          polymarket_condition_id?: string | null
          polymarket_market_id?: string | null
          polymarket_matched?: boolean | null
          polymarket_price?: number | null
          polymarket_question?: string | null
          polymarket_volume?: number | null
          polymarket_yes_price?: number | null
          reverted?: boolean | null
          samples_since_hold?: number | null
          updated_at?: string | null
          watch_state?: string | null
        }
        Relationships: []
      }
      movement_logs: {
        Row: {
          actual_outcome: boolean | null
          created_at: string | null
          edge_at_confirmation: number | null
          event_key: string
          event_name: string
          final_state: string | null
          hold_duration_seconds: number | null
          id: string
          movement_pct: number | null
          polymarket_matched: boolean | null
          profit_loss: number | null
          samples_captured: number | null
          velocity: number | null
        }
        Insert: {
          actual_outcome?: boolean | null
          created_at?: string | null
          edge_at_confirmation?: number | null
          event_key: string
          event_name: string
          final_state?: string | null
          hold_duration_seconds?: number | null
          id?: string
          movement_pct?: number | null
          polymarket_matched?: boolean | null
          profit_loss?: number | null
          samples_captured?: number | null
          velocity?: number | null
        }
        Update: {
          actual_outcome?: boolean | null
          created_at?: string | null
          edge_at_confirmation?: number | null
          event_key?: string
          event_name?: string
          final_state?: string | null
          hold_duration_seconds?: number | null
          id?: string
          movement_pct?: number | null
          polymarket_matched?: boolean | null
          profit_loss?: number | null
          samples_captured?: number | null
          velocity?: number | null
        }
        Relationships: []
      }
      polymarket_h2h_cache: {
        Row: {
          best_ask: number | null
          best_bid: number | null
          condition_id: string
          created_at: string | null
          event_date: string | null
          event_title: string
          extracted_entity: string | null
          extracted_league: string | null
          extracted_threshold: number | null
          id: string
          last_bulk_sync: string | null
          last_price_update: string | null
          liquidity: number | null
          market_type: string | null
          monitoring_status: string | null
          no_price: number
          orderbook_depth: number | null
          question: string
          sport_category: string | null
          spread_pct: number | null
          status: string | null
          team_away: string | null
          team_away_normalized: string | null
          team_home: string | null
          team_home_normalized: string | null
          token_id_no: string | null
          token_id_yes: string | null
          volume: number | null
          yes_price: number
        }
        Insert: {
          best_ask?: number | null
          best_bid?: number | null
          condition_id: string
          created_at?: string | null
          event_date?: string | null
          event_title: string
          extracted_entity?: string | null
          extracted_league?: string | null
          extracted_threshold?: number | null
          id?: string
          last_bulk_sync?: string | null
          last_price_update?: string | null
          liquidity?: number | null
          market_type?: string | null
          monitoring_status?: string | null
          no_price: number
          orderbook_depth?: number | null
          question: string
          sport_category?: string | null
          spread_pct?: number | null
          status?: string | null
          team_away?: string | null
          team_away_normalized?: string | null
          team_home?: string | null
          team_home_normalized?: string | null
          token_id_no?: string | null
          token_id_yes?: string | null
          volume?: number | null
          yes_price: number
        }
        Update: {
          best_ask?: number | null
          best_bid?: number | null
          condition_id?: string
          created_at?: string | null
          event_date?: string | null
          event_title?: string
          extracted_entity?: string | null
          extracted_league?: string | null
          extracted_threshold?: number | null
          id?: string
          last_bulk_sync?: string | null
          last_price_update?: string | null
          liquidity?: number | null
          market_type?: string | null
          monitoring_status?: string | null
          no_price?: number
          orderbook_depth?: number | null
          question?: string
          sport_category?: string | null
          spread_pct?: number | null
          status?: string | null
          team_away?: string | null
          team_away_normalized?: string | null
          team_home?: string | null
          team_home_normalized?: string | null
          token_id_no?: string | null
          token_id_yes?: string | null
          volume?: number | null
          yes_price?: number
        }
        Relationships: []
      }
      polymarket_markets: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          end_date: string | null
          id: string
          last_updated: string | null
          liquidity: number | null
          market_id: string
          no_price: number
          question: string
          status: string | null
          volume: number | null
          yes_price: number
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          last_updated?: string | null
          liquidity?: number | null
          market_id: string
          no_price: number
          question: string
          status?: string | null
          volume?: number | null
          yes_price: number
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          last_updated?: string | null
          liquidity?: number | null
          market_id?: string
          no_price?: number
          question?: string
          status?: string | null
          volume?: number | null
          yes_price?: number
        }
        Relationships: []
      }
      probability_snapshots: {
        Row: {
          captured_at: string
          event_key: string
          event_name: string
          fair_probability: number
          id: string
          outcome: string
          source: string | null
        }
        Insert: {
          captured_at?: string
          event_key: string
          event_name: string
          fair_probability: number
          id?: string
          outcome: string
          source?: string | null
        }
        Update: {
          captured_at?: string
          event_key?: string
          event_name?: string
          fair_probability?: number
          id?: string
          outcome?: string
          source?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          bankroll: number | null
          created_at: string | null
          display_name: string | null
          id: string
          phone_number: string | null
          total_bets: number | null
          total_profit: number | null
          total_wins: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          bankroll?: number | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          phone_number?: string | null
          total_bets?: number | null
          total_profit?: number | null
          total_wins?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          bankroll?: number | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          phone_number?: string | null
          total_bets?: number | null
          total_profit?: number | null
          total_wins?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      scan_config: {
        Row: {
          active_poll_interval_seconds: number | null
          active_window_minutes: number | null
          adaptive_scanning_enabled: boolean
          base_frequency_minutes: number
          created_at: string
          daily_requests_used: number
          enabled_market_types: string[] | null
          enabled_sports: string[] | null
          event_horizon_hours: number
          focus_mode: string | null
          hold_window_minutes: number | null
          id: string
          last_request_reset: string | null
          last_scan_at: string | null
          max_daily_requests: number
          max_monthly_requests: number
          max_simultaneous_active: number | null
          min_event_horizon_hours: number
          min_poly_volume: number | null
          monthly_requests_used: number
          movement_threshold_pct: number | null
          next_scheduled_scan_at: string | null
          poly_sync_interval_hours: number | null
          samples_required: number | null
          scanning_paused: boolean
          sharp_book_weight: number
          sharp_book_weighting_enabled: boolean
          total_scans_today: number
          turbo_frequency_minutes: number
          turbo_mode_enabled: boolean
          updated_at: string
          user_id: string | null
          watch_poll_interval_minutes: number | null
        }
        Insert: {
          active_poll_interval_seconds?: number | null
          active_window_minutes?: number | null
          adaptive_scanning_enabled?: boolean
          base_frequency_minutes?: number
          created_at?: string
          daily_requests_used?: number
          enabled_market_types?: string[] | null
          enabled_sports?: string[] | null
          event_horizon_hours?: number
          focus_mode?: string | null
          hold_window_minutes?: number | null
          id?: string
          last_request_reset?: string | null
          last_scan_at?: string | null
          max_daily_requests?: number
          max_monthly_requests?: number
          max_simultaneous_active?: number | null
          min_event_horizon_hours?: number
          min_poly_volume?: number | null
          monthly_requests_used?: number
          movement_threshold_pct?: number | null
          next_scheduled_scan_at?: string | null
          poly_sync_interval_hours?: number | null
          samples_required?: number | null
          scanning_paused?: boolean
          sharp_book_weight?: number
          sharp_book_weighting_enabled?: boolean
          total_scans_today?: number
          turbo_frequency_minutes?: number
          turbo_mode_enabled?: boolean
          updated_at?: string
          user_id?: string | null
          watch_poll_interval_minutes?: number | null
        }
        Update: {
          active_poll_interval_seconds?: number | null
          active_window_minutes?: number | null
          adaptive_scanning_enabled?: boolean
          base_frequency_minutes?: number
          created_at?: string
          daily_requests_used?: number
          enabled_market_types?: string[] | null
          enabled_sports?: string[] | null
          event_horizon_hours?: number
          focus_mode?: string | null
          hold_window_minutes?: number | null
          id?: string
          last_request_reset?: string | null
          last_scan_at?: string | null
          max_daily_requests?: number
          max_monthly_requests?: number
          max_simultaneous_active?: number | null
          min_event_horizon_hours?: number
          min_poly_volume?: number | null
          monthly_requests_used?: number
          movement_threshold_pct?: number | null
          next_scheduled_scan_at?: string | null
          poly_sync_interval_hours?: number | null
          samples_required?: number | null
          scanning_paused?: boolean
          sharp_book_weight?: number
          sharp_book_weighting_enabled?: boolean
          total_scans_today?: number
          turbo_frequency_minutes?: number
          turbo_mode_enabled?: boolean
          updated_at?: string
          user_id?: string | null
          watch_poll_interval_minutes?: number | null
        }
        Relationships: []
      }
      sharp_book_snapshots: {
        Row: {
          bookmaker: string
          captured_at: string
          event_key: string
          event_name: string
          id: string
          implied_probability: number
          outcome: string
          raw_odds: number | null
        }
        Insert: {
          bookmaker: string
          captured_at?: string
          event_key: string
          event_name: string
          id?: string
          implied_probability: number
          outcome: string
          raw_odds?: number | null
        }
        Update: {
          bookmaker?: string
          captured_at?: string
          event_key?: string
          event_name?: string
          id?: string
          implied_probability?: number
          outcome?: string
          raw_odds?: number | null
        }
        Relationships: []
      }
      signal_logs: {
        Row: {
          actual_result: boolean | null
          confidence_at_signal: number
          created_at: string | null
          edge_at_signal: number
          entry_price: number
          event_name: string
          id: string
          opportunity_id: string | null
          outcome: string | null
          polymarket_condition_id: string | null
          profit_loss: number | null
          settled_at: string | null
          side: string
          stake_amount: number | null
        }
        Insert: {
          actual_result?: boolean | null
          confidence_at_signal: number
          created_at?: string | null
          edge_at_signal: number
          entry_price: number
          event_name: string
          id?: string
          opportunity_id?: string | null
          outcome?: string | null
          polymarket_condition_id?: string | null
          profit_loss?: number | null
          settled_at?: string | null
          side: string
          stake_amount?: number | null
        }
        Update: {
          actual_result?: boolean | null
          confidence_at_signal?: number
          created_at?: string | null
          edge_at_signal?: number
          entry_price?: number
          event_name?: string
          id?: string
          opportunity_id?: string | null
          outcome?: string | null
          polymarket_condition_id?: string | null
          profit_loss?: number | null
          settled_at?: string | null
          side?: string
          stake_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "signal_logs_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "signal_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_opportunities: {
        Row: {
          bookmaker_prob_fair: number | null
          bookmaker_probability: number
          confidence_score: number
          created_at: string | null
          edge_percent: number
          event_name: string
          expires_at: string | null
          id: string
          is_true_arbitrage: boolean | null
          movement_confirmed: boolean | null
          movement_velocity: number | null
          polymarket_condition_id: string | null
          polymarket_market_id: string | null
          polymarket_match_confidence: number | null
          polymarket_price: number
          polymarket_updated_at: string | null
          polymarket_volume: number | null
          polymarket_yes_price: number | null
          recommended_outcome: string | null
          side: string
          signal_factors: Json | null
          signal_strength: number | null
          signal_tier: string | null
          status: string | null
          urgency: string | null
          user_id: string | null
        }
        Insert: {
          bookmaker_prob_fair?: number | null
          bookmaker_probability: number
          confidence_score: number
          created_at?: string | null
          edge_percent: number
          event_name: string
          expires_at?: string | null
          id?: string
          is_true_arbitrage?: boolean | null
          movement_confirmed?: boolean | null
          movement_velocity?: number | null
          polymarket_condition_id?: string | null
          polymarket_market_id?: string | null
          polymarket_match_confidence?: number | null
          polymarket_price: number
          polymarket_updated_at?: string | null
          polymarket_volume?: number | null
          polymarket_yes_price?: number | null
          recommended_outcome?: string | null
          side: string
          signal_factors?: Json | null
          signal_strength?: number | null
          signal_tier?: string | null
          status?: string | null
          urgency?: string | null
          user_id?: string | null
        }
        Update: {
          bookmaker_prob_fair?: number | null
          bookmaker_probability?: number
          confidence_score?: number
          created_at?: string | null
          edge_percent?: number
          event_name?: string
          expires_at?: string | null
          id?: string
          is_true_arbitrage?: boolean | null
          movement_confirmed?: boolean | null
          movement_velocity?: number | null
          polymarket_condition_id?: string | null
          polymarket_market_id?: string | null
          polymarket_match_confidence?: number | null
          polymarket_price?: number
          polymarket_updated_at?: string | null
          polymarket_volume?: number | null
          polymarket_yes_price?: number | null
          recommended_outcome?: string | null
          side?: string
          signal_factors?: Json | null
          signal_strength?: number | null
          signal_tier?: string | null
          status?: string | null
          urgency?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signal_opportunities_polymarket_market_id_fkey"
            columns: ["polymarket_market_id"]
            isOneToOne: false
            referencedRelation: "polymarket_markets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_sharp_book_snapshots: { Args: never; Returns: undefined }
    }
    Enums: {
      bet_result: "pending" | "win" | "loss" | "void"
      bet_status: "pending" | "won" | "lost" | "void"
      confidence_level: "low" | "moderate" | "high"
      event_status: "upcoming" | "live" | "completed"
      market_type:
        | "1x2"
        | "over_under"
        | "btts"
        | "handicap"
        | "correct_score"
        | "other"
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
      bet_result: ["pending", "win", "loss", "void"],
      bet_status: ["pending", "won", "lost", "void"],
      confidence_level: ["low", "moderate", "high"],
      event_status: ["upcoming", "live", "completed"],
      market_type: [
        "1x2",
        "over_under",
        "btts",
        "handicap",
        "correct_score",
        "other",
      ],
    },
  },
} as const
