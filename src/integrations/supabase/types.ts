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
      ai_advisor_logs: {
        Row: {
          analysis_type: string
          applied_at: string | null
          created_at: string | null
          id: string
          insight_category: string | null
          priority: string | null
          recommendation: string
          status: string | null
          supporting_data: Json | null
        }
        Insert: {
          analysis_type: string
          applied_at?: string | null
          created_at?: string | null
          id?: string
          insight_category?: string | null
          priority?: string | null
          recommendation: string
          status?: string | null
          supporting_data?: Json | null
        }
        Update: {
          analysis_type?: string
          applied_at?: string | null
          created_at?: string | null
          id?: string
          insight_category?: string | null
          priority?: string | null
          recommendation?: string
          status?: string | null
          supporting_data?: Json | null
        }
        Relationships: []
      }
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
          source: string | null
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
          source?: string | null
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
          source?: string | null
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
          pipeline_stage: string
          polymarket_condition_id: string | null
          polymarket_market_id: string | null
          polymarket_matched: boolean | null
          polymarket_price: number | null
          polymarket_question: string | null
          polymarket_volume: number | null
          polymarket_yes_price: number | null
          reverted: boolean | null
          samples_since_hold: number | null
          source: string | null
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
          pipeline_stage?: string
          polymarket_condition_id?: string | null
          polymarket_market_id?: string | null
          polymarket_matched?: boolean | null
          polymarket_price?: number | null
          polymarket_question?: string | null
          polymarket_volume?: number | null
          polymarket_yes_price?: number | null
          reverted?: boolean | null
          samples_since_hold?: number | null
          source?: string | null
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
          pipeline_stage?: string
          polymarket_condition_id?: string | null
          polymarket_market_id?: string | null
          polymarket_matched?: boolean | null
          polymarket_price?: number | null
          polymarket_question?: string | null
          polymarket_volume?: number | null
          polymarket_yes_price?: number | null
          reverted?: boolean | null
          samples_since_hold?: number | null
          source?: string | null
          updated_at?: string | null
          watch_state?: string | null
        }
        Relationships: []
      }
      match_failures: {
        Row: {
          failure_reason: string
          first_seen_at: string
          id: string
          last_seen_at: string
          occurrence_count: number
          poly_condition_id: string | null
          poly_event_title: string
          poly_team_a: string
          poly_team_b: string
          resolution_status: string
          resolved_at: string | null
          resolved_mapping: string | null
          sport_code: string | null
        }
        Insert: {
          failure_reason?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          occurrence_count?: number
          poly_condition_id?: string | null
          poly_event_title: string
          poly_team_a: string
          poly_team_b: string
          resolution_status?: string
          resolved_at?: string | null
          resolved_mapping?: string | null
          sport_code?: string | null
        }
        Update: {
          failure_reason?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          occurrence_count?: number
          poly_condition_id?: string | null
          poly_event_title?: string
          poly_team_a?: string
          poly_team_b?: string
          resolution_status?: string
          resolved_at?: string | null
          resolved_mapping?: string | null
          sport_code?: string | null
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
      multi_leg_opportunities: {
        Row: {
          combined_edge: number | null
          combined_probability: number | null
          correlation_score: number | null
          created_at: string | null
          detected_at: string | null
          event_name: string
          expires_at: string | null
          id: string
          legs: Json
          sport: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          combined_edge?: number | null
          combined_probability?: number | null
          correlation_score?: number | null
          created_at?: string | null
          detected_at?: string | null
          event_name: string
          expires_at?: string | null
          id?: string
          legs?: Json
          sport?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          combined_edge?: number | null
          combined_probability?: number | null
          correlation_score?: number | null
          created_at?: string | null
          detected_at?: string | null
          event_name?: string
          expires_at?: string | null
          id?: string
          legs?: Json
          sport?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      polymarket_h2h_cache: {
        Row: {
          best_ask: number | null
          best_bid: number | null
          bookmaker_commence_time: string | null
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
          last_token_repair_at: string | null
          liquidity: number | null
          market_type: string | null
          monitoring_status: string | null
          no_price: number
          orderbook_depth: number | null
          polymarket_slug: string | null
          question: string
          source: string | null
          sport_category: string | null
          spread_pct: number | null
          status: string | null
          team_away: string | null
          team_away_normalized: string | null
          team_home: string | null
          team_home_normalized: string | null
          token_confidence: number | null
          token_id_no: string | null
          token_id_yes: string | null
          token_source: string | null
          tradeable: boolean | null
          untradeable_reason: string | null
          volume: number | null
          yes_price: number
        }
        Insert: {
          best_ask?: number | null
          best_bid?: number | null
          bookmaker_commence_time?: string | null
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
          last_token_repair_at?: string | null
          liquidity?: number | null
          market_type?: string | null
          monitoring_status?: string | null
          no_price: number
          orderbook_depth?: number | null
          polymarket_slug?: string | null
          question: string
          source?: string | null
          sport_category?: string | null
          spread_pct?: number | null
          status?: string | null
          team_away?: string | null
          team_away_normalized?: string | null
          team_home?: string | null
          team_home_normalized?: string | null
          token_confidence?: number | null
          token_id_no?: string | null
          token_id_yes?: string | null
          token_source?: string | null
          tradeable?: boolean | null
          untradeable_reason?: string | null
          volume?: number | null
          yes_price: number
        }
        Update: {
          best_ask?: number | null
          best_bid?: number | null
          bookmaker_commence_time?: string | null
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
          last_token_repair_at?: string | null
          liquidity?: number | null
          market_type?: string | null
          monitoring_status?: string | null
          no_price?: number
          orderbook_depth?: number | null
          polymarket_slug?: string | null
          question?: string
          source?: string | null
          sport_category?: string | null
          spread_pct?: number | null
          status?: string | null
          team_away?: string | null
          team_away_normalized?: string | null
          team_home?: string | null
          team_home_normalized?: string | null
          token_confidence?: number | null
          token_id_no?: string | null
          token_id_yes?: string | null
          token_source?: string | null
          tradeable?: boolean | null
          untradeable_reason?: string | null
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
      ps_api_keys: {
        Row: {
          created_at: string | null
          key_hash: string
          last_request: string | null
          requests_today: number | null
          tier: string
          user_email: string | null
        }
        Insert: {
          created_at?: string | null
          key_hash: string
          last_request?: string | null
          requests_today?: number | null
          tier?: string
          user_email?: string | null
        }
        Update: {
          created_at?: string | null
          key_hash?: string
          last_request?: string | null
          requests_today?: number | null
          tier?: string
          user_email?: string | null
        }
        Relationships: []
      }
      ps_events: {
        Row: {
          away_team: string
          created_at: string | null
          home_team: string
          id: string
          polymarket_event_id: string | null
          polymarket_slug: string | null
          sport_slug: string
          start_time: string
          status: string
          updated_at: string | null
        }
        Insert: {
          away_team: string
          created_at?: string | null
          home_team: string
          id: string
          polymarket_event_id?: string | null
          polymarket_slug?: string | null
          sport_slug: string
          start_time: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          away_team?: string
          created_at?: string | null
          home_team?: string
          id?: string
          polymarket_event_id?: string | null
          polymarket_slug?: string | null
          sport_slug?: string
          start_time?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ps_events_sport_slug_fkey"
            columns: ["sport_slug"]
            isOneToOne: false
            referencedRelation: "ps_sports"
            referencedColumns: ["slug"]
          },
        ]
      }
      ps_markets: {
        Row: {
          condition_id: string | null
          event_id: string
          id: string
          liquidity: number | null
          no_price: number | null
          outcomes: string | null
          polymarket_url: string | null
          question: string | null
          token_ids: string[] | null
          updated_at: string | null
          volume: number | null
          yes_price: number | null
        }
        Insert: {
          condition_id?: string | null
          event_id: string
          id: string
          liquidity?: number | null
          no_price?: number | null
          outcomes?: string | null
          polymarket_url?: string | null
          question?: string | null
          token_ids?: string[] | null
          updated_at?: string | null
          volume?: number | null
          yes_price?: number | null
        }
        Update: {
          condition_id?: string | null
          event_id?: string
          id?: string
          liquidity?: number | null
          no_price?: number | null
          outcomes?: string | null
          polymarket_url?: string | null
          question?: string | null
          token_ids?: string[] | null
          updated_at?: string | null
          volume?: number | null
          yes_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ps_markets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "ps_events"
            referencedColumns: ["id"]
          },
        ]
      }
      ps_odds_snapshots: {
        Row: {
          captured_at: string | null
          id: number
          market_id: string
          no_price: number
          volume: number | null
          yes_price: number
        }
        Insert: {
          captured_at?: string | null
          id?: number
          market_id: string
          no_price: number
          volume?: number | null
          yes_price: number
        }
        Update: {
          captured_at?: string | null
          id?: number
          market_id?: string
          no_price?: number
          volume?: number | null
          yes_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "ps_odds_snapshots_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "ps_markets"
            referencedColumns: ["id"]
          },
        ]
      }
      ps_sharp_odds: {
        Row: {
          away_odds: number
          captured_at: string | null
          event_id: string
          home_odds: number
          id: number
          source: string
        }
        Insert: {
          away_odds: number
          captured_at?: string | null
          event_id: string
          home_odds: number
          id?: number
          source?: string
        }
        Update: {
          away_odds?: number
          captured_at?: string | null
          event_id?: string
          home_odds?: number
          id?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "ps_sharp_odds_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "ps_events"
            referencedColumns: ["id"]
          },
        ]
      }
      ps_sports: {
        Row: {
          created_at: string | null
          icon: string | null
          name: string
          slug: string
          sport_type: string
        }
        Insert: {
          created_at?: string | null
          icon?: string | null
          name: string
          slug: string
          sport_type: string
        }
        Update: {
          created_at?: string | null
          icon?: string | null
          name?: string
          slug?: string
          sport_type?: string
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
      sharp_book_lines: {
        Row: {
          bookmaker: string
          captured_at: string | null
          event_name: string
          event_start_time: string | null
          id: string
          implied_probability: number
          is_sharp: boolean | null
          line_value: number | null
          market_type: string
          odds: number
          outcome: string
          sport: string
          total_value: number | null
        }
        Insert: {
          bookmaker: string
          captured_at?: string | null
          event_name: string
          event_start_time?: string | null
          id?: string
          implied_probability: number
          is_sharp?: boolean | null
          line_value?: number | null
          market_type: string
          odds: number
          outcome: string
          sport: string
          total_value?: number | null
        }
        Update: {
          bookmaker?: string
          captured_at?: string | null
          event_name?: string
          event_start_time?: string | null
          id?: string
          implied_probability?: number
          is_sharp?: boolean | null
          line_value?: number | null
          market_type?: string
          odds?: number
          outcome?: string
          sport?: string
          total_value?: number | null
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
      sharp_consensus: {
        Row: {
          calculated_at: string | null
          confidence_score: number
          consensus_probability: number
          contributing_books: string[] | null
          event_name: string
          id: string
          line_value: number | null
          market_type: string
          outcome: string
          total_value: number | null
        }
        Insert: {
          calculated_at?: string | null
          confidence_score: number
          consensus_probability: number
          contributing_books?: string[] | null
          event_name: string
          id?: string
          line_value?: number | null
          market_type: string
          outcome: string
          total_value?: number | null
        }
        Update: {
          calculated_at?: string | null
          confidence_score?: number
          consensus_probability?: number
          contributing_books?: string[] | null
          event_name?: string
          id?: string
          line_value?: number | null
          market_type?: string
          outcome?: string
          total_value?: number | null
        }
        Relationships: []
      }
      signal_cooldowns: {
        Row: {
          created_at: string | null
          event_key: string
          id: string
          last_signal_at: string
          sport: string | null
        }
        Insert: {
          created_at?: string | null
          event_key: string
          id?: string
          last_signal_at?: string
          sport?: string | null
        }
        Update: {
          created_at?: string | null
          event_key?: string
          id?: string
          last_signal_at?: string
          sport?: string | null
        }
        Relationships: []
      }
      signal_logs: {
        Row: {
          actual_result: boolean | null
          confidence_at_signal: number
          core_logic_version: string | null
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
          core_logic_version?: string | null
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
          core_logic_version?: string | null
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
            referencedRelation: "line_shopping_opportunities"
            referencedColumns: ["id"]
          },
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
          bankroll_percentage: number | null
          bookmaker_prob_fair: number | null
          bookmaker_probability: number
          confidence_score: number
          core_logic_version: string | null
          created_at: string | null
          edge_percent: number
          event_name: string
          expires_at: string | null
          id: string
          is_true_arbitrage: boolean | null
          kelly_fraction: number | null
          line_shopping_tier: string | null
          liquidity_penalty: number | null
          market_priority_score: number | null
          market_type_bonus: number | null
          max_kelly_stake_cents: number | null
          movement_confirmed: boolean | null
          movement_velocity: number | null
          polymarket_condition_id: string | null
          polymarket_market_id: string | null
          polymarket_match_confidence: number | null
          polymarket_price: number
          polymarket_slug: string | null
          polymarket_updated_at: string | null
          polymarket_volume: number | null
          polymarket_yes_price: number | null
          recommended_outcome: string | null
          sharp_consensus_prob: number | null
          sharp_line_edge: number | null
          side: string
          signal_factors: Json | null
          signal_state: string | null
          signal_strength: number | null
          signal_tier: string | null
          status: string | null
          suggested_stake_cents: number | null
          urgency: string | null
          user_id: string | null
        }
        Insert: {
          bankroll_percentage?: number | null
          bookmaker_prob_fair?: number | null
          bookmaker_probability: number
          confidence_score: number
          core_logic_version?: string | null
          created_at?: string | null
          edge_percent: number
          event_name: string
          expires_at?: string | null
          id?: string
          is_true_arbitrage?: boolean | null
          kelly_fraction?: number | null
          line_shopping_tier?: string | null
          liquidity_penalty?: number | null
          market_priority_score?: number | null
          market_type_bonus?: number | null
          max_kelly_stake_cents?: number | null
          movement_confirmed?: boolean | null
          movement_velocity?: number | null
          polymarket_condition_id?: string | null
          polymarket_market_id?: string | null
          polymarket_match_confidence?: number | null
          polymarket_price: number
          polymarket_slug?: string | null
          polymarket_updated_at?: string | null
          polymarket_volume?: number | null
          polymarket_yes_price?: number | null
          recommended_outcome?: string | null
          sharp_consensus_prob?: number | null
          sharp_line_edge?: number | null
          side: string
          signal_factors?: Json | null
          signal_state?: string | null
          signal_strength?: number | null
          signal_tier?: string | null
          status?: string | null
          suggested_stake_cents?: number | null
          urgency?: string | null
          user_id?: string | null
        }
        Update: {
          bankroll_percentage?: number | null
          bookmaker_prob_fair?: number | null
          bookmaker_probability?: number
          confidence_score?: number
          core_logic_version?: string | null
          created_at?: string | null
          edge_percent?: number
          event_name?: string
          expires_at?: string | null
          id?: string
          is_true_arbitrage?: boolean | null
          kelly_fraction?: number | null
          line_shopping_tier?: string | null
          liquidity_penalty?: number | null
          market_priority_score?: number | null
          market_type_bonus?: number | null
          max_kelly_stake_cents?: number | null
          movement_confirmed?: boolean | null
          movement_velocity?: number | null
          polymarket_condition_id?: string | null
          polymarket_market_id?: string | null
          polymarket_match_confidence?: number | null
          polymarket_price?: number
          polymarket_slug?: string | null
          polymarket_updated_at?: string | null
          polymarket_volume?: number | null
          polymarket_yes_price?: number | null
          recommended_outcome?: string | null
          sharp_consensus_prob?: number | null
          sharp_line_edge?: number | null
          side?: string
          signal_factors?: Json | null
          signal_state?: string | null
          signal_strength?: number | null
          signal_tier?: string | null
          status?: string | null
          suggested_stake_cents?: number | null
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
      signal_rate_limits: {
        Row: {
          created_at: string | null
          hour_bucket: string
          id: string
          s2_count: number | null
          sport: string | null
        }
        Insert: {
          created_at?: string | null
          hour_bucket: string
          id?: string
          s2_count?: number | null
          sport?: string | null
        }
        Update: {
          created_at?: string | null
          hour_bucket?: string
          id?: string
          s2_count?: number | null
          sport?: string | null
        }
        Relationships: []
      }
      team_mappings: {
        Row: {
          canonical_name: string
          confidence: number | null
          created_at: string
          id: string
          source: string | null
          source_name: string
          sport_code: string
        }
        Insert: {
          canonical_name: string
          confidence?: number | null
          created_at?: string
          id?: string
          source?: string | null
          source_name: string
          sport_code: string
        }
        Update: {
          canonical_name?: string
          confidence?: number | null
          created_at?: string
          id?: string
          source?: string | null
          source_name?: string
          sport_code?: string
        }
        Relationships: []
      }
      whale_positions: {
        Row: {
          avg_price: number
          closed_at: string | null
          condition_id: string | null
          created_at: string | null
          current_price: number | null
          event_name: string
          id: string
          market_id: string
          opened_at: string | null
          side: string
          size: number
          status: string | null
          unrealized_pnl: number | null
          updated_at: string | null
          wallet_id: string
        }
        Insert: {
          avg_price?: number
          closed_at?: string | null
          condition_id?: string | null
          created_at?: string | null
          current_price?: number | null
          event_name: string
          id?: string
          market_id: string
          opened_at?: string | null
          side: string
          size?: number
          status?: string | null
          unrealized_pnl?: number | null
          updated_at?: string | null
          wallet_id: string
        }
        Update: {
          avg_price?: number
          closed_at?: string | null
          condition_id?: string | null
          created_at?: string | null
          current_price?: number | null
          event_name?: string
          id?: string
          market_id?: string
          opened_at?: string | null
          side?: string
          size?: number
          status?: string | null
          unrealized_pnl?: number | null
          updated_at?: string | null
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whale_positions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "whale_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      whale_wallets: {
        Row: {
          avg_position_size: number | null
          confidence_tier: string | null
          created_at: string | null
          display_name: string | null
          id: string
          last_active_at: string | null
          specializations: string[] | null
          total_profit: number | null
          total_trades: number | null
          tracked_since: string | null
          updated_at: string | null
          wallet_address: string
          win_rate: number | null
        }
        Insert: {
          avg_position_size?: number | null
          confidence_tier?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          last_active_at?: string | null
          specializations?: string[] | null
          total_profit?: number | null
          total_trades?: number | null
          tracked_since?: string | null
          updated_at?: string | null
          wallet_address: string
          win_rate?: number | null
        }
        Update: {
          avg_position_size?: number | null
          confidence_tier?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          last_active_at?: string | null
          specializations?: string[] | null
          total_profit?: number | null
          total_trades?: number | null
          tracked_since?: string | null
          updated_at?: string | null
          wallet_address?: string
          win_rate?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      line_shopping_opportunities: {
        Row: {
          bookmaker_probability: number | null
          confidence_score: number | null
          contributing_books: string[] | null
          created_at: string | null
          edge_percent: number | null
          event_name: string | null
          id: string | null
          kelly_fraction: number | null
          line_shopping_tier: string | null
          market_priority_score: number | null
          polymarket_price: number | null
          price_discrepancy: number | null
          sharp_confidence: number | null
          sharp_consensus_prob: number | null
          sharp_line_edge: number | null
          sharp_market_type: string | null
          sharp_prob: number | null
          side: string | null
          status: string | null
          suggested_stake_cents: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      cleanup_old_sharp_book_snapshots: { Args: never; Returns: undefined }
      cleanup_old_sharp_lines: { Args: never; Returns: undefined }
      update_market_priority_scores: { Args: never; Returns: undefined }
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
