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
      bet_history: {
        Row: {
          id: string
          match_description: string
          odds: number
          placed_at: string | null
          potential_return: number
          profit_loss: number | null
          selection: string
          settled_at: string | null
          stake: number
          status: Database["public"]["Enums"]["bet_status"]
          user_id: string
          value_bet_id: string | null
        }
        Insert: {
          id?: string
          match_description: string
          odds: number
          placed_at?: string | null
          potential_return: number
          profit_loss?: number | null
          selection: string
          settled_at?: string | null
          stake: number
          status?: Database["public"]["Enums"]["bet_status"]
          user_id: string
          value_bet_id?: string | null
        }
        Update: {
          id?: string
          match_description?: string
          odds?: number
          placed_at?: string | null
          potential_return?: number
          profit_loss?: number | null
          selection?: string
          settled_at?: string | null
          stake?: number
          status?: Database["public"]["Enums"]["bet_status"]
          user_id?: string
          value_bet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bet_history_value_bet_id_fkey"
            columns: ["value_bet_id"]
            isOneToOne: false
            referencedRelation: "value_bets"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          away_team: string | null
          created_at: string
          home_team: string | null
          id: string
          league: string
          raw_payload: Json | null
          sport: string
          start_time_aedt: string
          start_time_utc: string
          status: Database["public"]["Enums"]["event_status"]
          updated_at: string
        }
        Insert: {
          away_team?: string | null
          created_at?: string
          home_team?: string | null
          id: string
          league: string
          raw_payload?: Json | null
          sport: string
          start_time_aedt: string
          start_time_utc: string
          status?: Database["public"]["Enums"]["event_status"]
          updated_at?: string
        }
        Update: {
          away_team?: string | null
          created_at?: string
          home_team?: string | null
          id?: string
          league?: string
          raw_payload?: Json | null
          sport?: string
          start_time_aedt?: string
          start_time_utc?: string
          status?: Database["public"]["Enums"]["event_status"]
          updated_at?: string
        }
        Relationships: []
      }
      markets: {
        Row: {
          bookmaker: string
          created_at: string
          event_id: string
          id: string
          last_updated: string
          line: number | null
          market_type: string
          odds_decimal: number
          selection: string
        }
        Insert: {
          bookmaker: string
          created_at?: string
          event_id: string
          id: string
          last_updated?: string
          line?: number | null
          market_type: string
          odds_decimal: number
          selection: string
        }
        Update: {
          bookmaker?: string
          created_at?: string
          event_id?: string
          id?: string
          last_updated?: string
          line?: number | null
          market_type?: string
          odds_decimal?: number
          selection?: string
        }
        Relationships: [
          {
            foreignKeyName: "markets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          away_form: string | null
          away_goals_conceded: number | null
          away_goals_scored: number | null
          away_team: string
          away_xg: number | null
          created_at: string | null
          head_to_head: Json | null
          home_form: string | null
          home_goals_conceded: number | null
          home_goals_scored: number | null
          home_team: string
          home_xg: number | null
          id: string
          league: string
          match_date: string
          updated_at: string | null
        }
        Insert: {
          away_form?: string | null
          away_goals_conceded?: number | null
          away_goals_scored?: number | null
          away_team: string
          away_xg?: number | null
          created_at?: string | null
          head_to_head?: Json | null
          home_form?: string | null
          home_goals_conceded?: number | null
          home_goals_scored?: number | null
          home_team: string
          home_xg?: number | null
          id?: string
          league: string
          match_date: string
          updated_at?: string | null
        }
        Update: {
          away_form?: string | null
          away_goals_conceded?: number | null
          away_goals_scored?: number | null
          away_team?: string
          away_xg?: number | null
          created_at?: string | null
          head_to_head?: Json | null
          home_form?: string | null
          home_goals_conceded?: number | null
          home_goals_scored?: number | null
          home_team?: string
          home_xg?: number | null
          id?: string
          league?: string
          match_date?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      model_bets: {
        Row: {
          bet_score: number
          bookmaker: string
          closing_odds: number | null
          clv: number | null
          created_at: string
          edge: number
          engine: string
          event_id: string
          event_name: string
          id: string
          implied_probability: number
          league: string
          market_id: string | null
          model_probability: number
          odds_taken: number
          profit_loss_units: number | null
          rationale: string | null
          recommended_stake_units: number
          result: Database["public"]["Enums"]["bet_result"]
          selection_label: string
          settled_at: string | null
          sport: string
          user_id: string | null
        }
        Insert: {
          bet_score: number
          bookmaker: string
          closing_odds?: number | null
          clv?: number | null
          created_at?: string
          edge: number
          engine?: string
          event_id: string
          event_name: string
          id?: string
          implied_probability: number
          league: string
          market_id?: string | null
          model_probability: number
          odds_taken: number
          profit_loss_units?: number | null
          rationale?: string | null
          recommended_stake_units: number
          result?: Database["public"]["Enums"]["bet_result"]
          selection_label: string
          settled_at?: string | null
          sport: string
          user_id?: string | null
        }
        Update: {
          bet_score?: number
          bookmaker?: string
          closing_odds?: number | null
          clv?: number | null
          created_at?: string
          edge?: number
          engine?: string
          event_id?: string
          event_name?: string
          id?: string
          implied_probability?: number
          league?: string
          market_id?: string | null
          model_probability?: number
          odds_taken?: number
          profit_loss_units?: number | null
          rationale?: string | null
          recommended_stake_units?: number
          result?: Database["public"]["Enums"]["bet_result"]
          selection_label?: string
          settled_at?: string | null
          sport?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "model_bets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_bets_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      odds_snapshots: {
        Row: {
          bookmaker: string
          captured_at: string
          event_id: string
          id: string
          market_id: string
          odds_decimal: number
        }
        Insert: {
          bookmaker: string
          captured_at?: string
          event_id: string
          id?: string
          market_id: string
          odds_decimal: number
        }
        Update: {
          bookmaker?: string
          captured_at?: string
          event_id?: string
          id?: string
          market_id?: string
          odds_decimal?: number
        }
        Relationships: [
          {
            foreignKeyName: "odds_snapshots_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "odds_snapshots_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          bankroll: number | null
          created_at: string | null
          display_name: string | null
          id: string
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
          total_bets?: number | null
          total_profit?: number | null
          total_wins?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      racing_angle_performance: {
        Row: {
          angle_name: string
          bets_placed: number
          calculated_at: string
          current_weight: number
          hit_rate: number | null
          id: string
          model_version: string
          period_end: string
          period_start: string
          profit_units: number
          roi: number | null
          sport: string
          suggested_weight: number | null
          times_triggered: number
          wins: number
        }
        Insert: {
          angle_name: string
          bets_placed?: number
          calculated_at?: string
          current_weight?: number
          hit_rate?: number | null
          id?: string
          model_version: string
          period_end: string
          period_start: string
          profit_units?: number
          roi?: number | null
          sport: string
          suggested_weight?: number | null
          times_triggered?: number
          wins?: number
        }
        Update: {
          angle_name?: string
          bets_placed?: number
          calculated_at?: string
          current_weight?: number
          hit_rate?: number | null
          id?: string
          model_version?: string
          period_end?: string
          period_start?: string
          profit_units?: number
          roi?: number | null
          sport?: string
          suggested_weight?: number | null
          times_triggered?: number
          wins?: number
        }
        Relationships: []
      }
      racing_bets: {
        Row: {
          actual_result: string | null
          angles_at_bet: string[] | null
          bookmaker: string
          closing_odds: number | null
          clv: number | null
          confidence_at_bet: number | null
          created_at: string
          edge_at_bet: number | null
          ev_at_bet: number | null
          event_id: string
          finish_position: number | null
          id: string
          market_type: string
          model_probability: number | null
          model_version: string | null
          odds_taken: number
          placed_at: string
          prediction_id: string | null
          profit_loss_units: number | null
          runner_id: string
          settled_at: string | null
          stake_units: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_result?: string | null
          angles_at_bet?: string[] | null
          bookmaker: string
          closing_odds?: number | null
          clv?: number | null
          confidence_at_bet?: number | null
          created_at?: string
          edge_at_bet?: number | null
          ev_at_bet?: number | null
          event_id: string
          finish_position?: number | null
          id?: string
          market_type?: string
          model_probability?: number | null
          model_version?: string | null
          odds_taken: number
          placed_at?: string
          prediction_id?: string | null
          profit_loss_units?: number | null
          runner_id: string
          settled_at?: string | null
          stake_units: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_result?: string | null
          angles_at_bet?: string[] | null
          bookmaker?: string
          closing_odds?: number | null
          clv?: number | null
          confidence_at_bet?: number | null
          created_at?: string
          edge_at_bet?: number | null
          ev_at_bet?: number | null
          event_id?: string
          finish_position?: number | null
          id?: string
          market_type?: string
          model_probability?: number | null
          model_version?: string | null
          odds_taken?: number
          placed_at?: string
          prediction_id?: string | null
          profit_loss_units?: number | null
          runner_id?: string
          settled_at?: string | null
          stake_units?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "racing_bets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "racing_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "racing_bets_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "racing_model_predictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "racing_bets_runner_id_fkey"
            columns: ["runner_id"]
            isOneToOne: false
            referencedRelation: "racing_runners"
            referencedColumns: ["id"]
          },
        ]
      }
      racing_events: {
        Row: {
          created_at: string
          distance_m: number
          external_id: string | null
          field_size: number | null
          id: string
          race_name: string | null
          race_number: number
          race_type: string | null
          rail_position: string | null
          raw_payload: Json | null
          sport: string
          start_time_local: string
          start_time_utc: string
          status: string
          total_prize_money: number | null
          track: string
          track_condition: string | null
          track_country: string
          track_state: string | null
          updated_at: string
          weather: string | null
        }
        Insert: {
          created_at?: string
          distance_m: number
          external_id?: string | null
          field_size?: number | null
          id?: string
          race_name?: string | null
          race_number: number
          race_type?: string | null
          rail_position?: string | null
          raw_payload?: Json | null
          sport: string
          start_time_local: string
          start_time_utc: string
          status?: string
          total_prize_money?: number | null
          track: string
          track_condition?: string | null
          track_country: string
          track_state?: string | null
          updated_at?: string
          weather?: string | null
        }
        Update: {
          created_at?: string
          distance_m?: number
          external_id?: string | null
          field_size?: number | null
          id?: string
          race_name?: string | null
          race_number?: number
          race_type?: string | null
          rail_position?: string | null
          raw_payload?: Json | null
          sport?: string
          start_time_local?: string
          start_time_utc?: string
          status?: string
          total_prize_money?: number | null
          track?: string
          track_condition?: string | null
          track_country?: string
          track_state?: string | null
          updated_at?: string
          weather?: string | null
        }
        Relationships: []
      }
      racing_markets: {
        Row: {
          bookmaker: string
          captured_at: string
          event_id: string
          id: string
          implied_probability: number | null
          is_best_odds: boolean | null
          market_type: string
          odds_decimal: number
          runner_id: string
        }
        Insert: {
          bookmaker: string
          captured_at?: string
          event_id: string
          id?: string
          implied_probability?: number | null
          is_best_odds?: boolean | null
          market_type?: string
          odds_decimal: number
          runner_id: string
        }
        Update: {
          bookmaker?: string
          captured_at?: string
          event_id?: string
          id?: string
          implied_probability?: number | null
          is_best_odds?: boolean | null
          market_type?: string
          odds_decimal?: number
          runner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "racing_markets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "racing_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "racing_markets_runner_id_fkey"
            columns: ["runner_id"]
            isOneToOne: false
            referencedRelation: "racing_runners"
            referencedColumns: ["id"]
          },
        ]
      }
      racing_model_performance: {
        Row: {
          avg_clv: number | null
          avg_confidence: number | null
          avg_edge: number | null
          avg_ev: number | null
          brier_score: number | null
          by_angle: Json | null
          by_confidence_band: Json | null
          by_distance: Json | null
          by_sport: Json | null
          by_track: Json | null
          calculated_at: string
          engine_version: string
          id: string
          log_loss: number | null
          losses: number
          model_version: string
          period_end: string
          period_start: string
          period_type: string
          profit_units: number
          roi: number | null
          total_bets: number
          voids: number
          win_rate: number | null
          wins: number
        }
        Insert: {
          avg_clv?: number | null
          avg_confidence?: number | null
          avg_edge?: number | null
          avg_ev?: number | null
          brier_score?: number | null
          by_angle?: Json | null
          by_confidence_band?: Json | null
          by_distance?: Json | null
          by_sport?: Json | null
          by_track?: Json | null
          calculated_at?: string
          engine_version: string
          id?: string
          log_loss?: number | null
          losses?: number
          model_version: string
          period_end: string
          period_start: string
          period_type?: string
          profit_units?: number
          roi?: number | null
          total_bets?: number
          voids?: number
          win_rate?: number | null
          wins?: number
        }
        Update: {
          avg_clv?: number | null
          avg_confidence?: number | null
          avg_edge?: number | null
          avg_ev?: number | null
          brier_score?: number | null
          by_angle?: Json | null
          by_confidence_band?: Json | null
          by_distance?: Json | null
          by_sport?: Json | null
          by_track?: Json | null
          calculated_at?: string
          engine_version?: string
          id?: string
          log_loss?: number | null
          losses?: number
          model_version?: string
          period_end?: string
          period_start?: string
          period_type?: string
          profit_units?: number
          roi?: number | null
          total_bets?: number
          voids?: number
          win_rate?: number | null
          wins?: number
        }
        Relationships: []
      }
      racing_model_predictions: {
        Row: {
          angle_details: Json | null
          angles_triggered: string[] | null
          best_odds_at_prediction: number | null
          confidence_score: number
          edge_pct: number | null
          engine_version: string | null
          event_id: string
          expected_value: number | null
          id: string
          implied_prob_market: number | null
          is_recommended: boolean
          model_probability: number
          model_version: string
          predicted_at: string
          reasoning: string | null
          recommended_stake_pct: number | null
          runner_id: string
        }
        Insert: {
          angle_details?: Json | null
          angles_triggered?: string[] | null
          best_odds_at_prediction?: number | null
          confidence_score: number
          edge_pct?: number | null
          engine_version?: string | null
          event_id: string
          expected_value?: number | null
          id?: string
          implied_prob_market?: number | null
          is_recommended?: boolean
          model_probability: number
          model_version: string
          predicted_at?: string
          reasoning?: string | null
          recommended_stake_pct?: number | null
          runner_id: string
        }
        Update: {
          angle_details?: Json | null
          angles_triggered?: string[] | null
          best_odds_at_prediction?: number | null
          confidence_score?: number
          edge_pct?: number | null
          engine_version?: string | null
          event_id?: string
          expected_value?: number | null
          id?: string
          implied_prob_market?: number | null
          is_recommended?: boolean
          model_probability?: number
          model_version?: string
          predicted_at?: string
          reasoning?: string | null
          recommended_stake_pct?: number | null
          runner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "racing_model_predictions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "racing_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "racing_model_predictions_runner_id_fkey"
            columns: ["runner_id"]
            isOneToOne: false
            referencedRelation: "racing_runners"
            referencedColumns: ["id"]
          },
        ]
      }
      racing_odds_snapshots: {
        Row: {
          captured_at: string
          id: string
          market_id: string
          odds_decimal: number
        }
        Insert: {
          captured_at?: string
          id?: string
          market_id: string
          odds_decimal: number
        }
        Update: {
          captured_at?: string
          id?: string
          market_id?: string
          odds_decimal?: number
        }
        Relationships: [
          {
            foreignKeyName: "racing_odds_snapshots_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "racing_markets"
            referencedColumns: ["id"]
          },
        ]
      }
      racing_runners: {
        Row: {
          avg_400m_time: number | null
          avg_800m_time: number | null
          barrier_box: number
          career_places: number | null
          career_starts: number | null
          career_wins: number | null
          class_level: string | null
          created_at: string
          dam: string | null
          distance_starts: number | null
          distance_wins: number | null
          early_speed_rating: number | null
          event_id: string
          finish_margin: number | null
          finish_position: number | null
          form_comment: string | null
          id: string
          jockey_claim: number | null
          jockey_name: string | null
          last_starts_days: number | null
          official_rating: number | null
          raw_payload: Json | null
          recent_form: string[] | null
          result_time: number | null
          run_style: string | null
          runner_name: string
          runner_number: number
          scratched: boolean
          scratched_reason: string | null
          sire: string | null
          speed_rating: number | null
          track_starts: number | null
          track_wins: number | null
          trainer_name: string | null
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          avg_400m_time?: number | null
          avg_800m_time?: number | null
          barrier_box: number
          career_places?: number | null
          career_starts?: number | null
          career_wins?: number | null
          class_level?: string | null
          created_at?: string
          dam?: string | null
          distance_starts?: number | null
          distance_wins?: number | null
          early_speed_rating?: number | null
          event_id: string
          finish_margin?: number | null
          finish_position?: number | null
          form_comment?: string | null
          id?: string
          jockey_claim?: number | null
          jockey_name?: string | null
          last_starts_days?: number | null
          official_rating?: number | null
          raw_payload?: Json | null
          recent_form?: string[] | null
          result_time?: number | null
          run_style?: string | null
          runner_name: string
          runner_number: number
          scratched?: boolean
          scratched_reason?: string | null
          sire?: string | null
          speed_rating?: number | null
          track_starts?: number | null
          track_wins?: number | null
          trainer_name?: string | null
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          avg_400m_time?: number | null
          avg_800m_time?: number | null
          barrier_box?: number
          career_places?: number | null
          career_starts?: number | null
          career_wins?: number | null
          class_level?: string | null
          created_at?: string
          dam?: string | null
          distance_starts?: number | null
          distance_wins?: number | null
          early_speed_rating?: number | null
          event_id?: string
          finish_margin?: number | null
          finish_position?: number | null
          form_comment?: string | null
          id?: string
          jockey_claim?: number | null
          jockey_name?: string | null
          last_starts_days?: number | null
          official_rating?: number | null
          raw_payload?: Json | null
          recent_form?: string[] | null
          result_time?: number | null
          run_style?: string | null
          runner_name?: string
          runner_number?: number
          scratched?: boolean
          scratched_reason?: string | null
          sire?: string | null
          speed_rating?: number | null
          track_starts?: number | null
          track_wins?: number | null
          trainer_name?: string | null
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "racing_runners_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "racing_events"
            referencedColumns: ["id"]
          },
        ]
      }
      racing_track_bias: {
        Row: {
          barrier_1_win_rate: number | null
          barrier_2_win_rate: number | null
          barrier_3_win_rate: number | null
          barrier_4_win_rate: number | null
          barrier_5_win_rate: number | null
          barrier_6_win_rate: number | null
          barrier_7_win_rate: number | null
          barrier_8_win_rate: number | null
          barrier_wide_win_rate: number | null
          closer_win_rate: number | null
          distance_range: string | null
          id: string
          last_updated: string
          leader_win_rate: number | null
          on_pace_win_rate: number | null
          rail_position_advantage: string | null
          sample_size: number
          sport: string
          track: string
          track_condition: string | null
        }
        Insert: {
          barrier_1_win_rate?: number | null
          barrier_2_win_rate?: number | null
          barrier_3_win_rate?: number | null
          barrier_4_win_rate?: number | null
          barrier_5_win_rate?: number | null
          barrier_6_win_rate?: number | null
          barrier_7_win_rate?: number | null
          barrier_8_win_rate?: number | null
          barrier_wide_win_rate?: number | null
          closer_win_rate?: number | null
          distance_range?: string | null
          id?: string
          last_updated?: string
          leader_win_rate?: number | null
          on_pace_win_rate?: number | null
          rail_position_advantage?: string | null
          sample_size?: number
          sport: string
          track: string
          track_condition?: string | null
        }
        Update: {
          barrier_1_win_rate?: number | null
          barrier_2_win_rate?: number | null
          barrier_3_win_rate?: number | null
          barrier_4_win_rate?: number | null
          barrier_5_win_rate?: number | null
          barrier_6_win_rate?: number | null
          barrier_7_win_rate?: number | null
          barrier_8_win_rate?: number | null
          barrier_wide_win_rate?: number | null
          closer_win_rate?: number | null
          distance_range?: string | null
          id?: string
          last_updated?: string
          leader_win_rate?: number | null
          on_pace_win_rate?: number | null
          rail_position_advantage?: string | null
          sample_size?: number
          sport?: string
          track?: string
          track_condition?: string | null
        }
        Relationships: []
      }
      scrape_history: {
        Row: {
          created_by: string | null
          formatted_data: string | null
          id: string
          leagues: string[] | null
          matches_count: number
          raw_data: Json | null
          scraped_at: string
          sports: string[]
          summary: string | null
          window_hours: number
        }
        Insert: {
          created_by?: string | null
          formatted_data?: string | null
          id?: string
          leagues?: string[] | null
          matches_count?: number
          raw_data?: Json | null
          scraped_at?: string
          sports: string[]
          summary?: string | null
          window_hours?: number
        }
        Update: {
          created_by?: string | null
          formatted_data?: string | null
          id?: string
          leagues?: string[] | null
          matches_count?: number
          raw_data?: Json | null
          scraped_at?: string
          sports?: string[]
          summary?: string | null
          window_hours?: number
        }
        Relationships: []
      }
      tennis_h2h: {
        Row: {
          clay_player1_wins: number | null
          clay_player2_wins: number | null
          created_at: string
          grass_player1_wins: number | null
          grass_player2_wins: number | null
          hard_player1_wins: number | null
          hard_player2_wins: number | null
          id: string
          last_match_date: string | null
          last_match_surface: string | null
          last_updated: string | null
          last_winner: string | null
          player1_name: string
          player1_wins: number | null
          player2_name: string
          player2_wins: number | null
        }
        Insert: {
          clay_player1_wins?: number | null
          clay_player2_wins?: number | null
          created_at?: string
          grass_player1_wins?: number | null
          grass_player2_wins?: number | null
          hard_player1_wins?: number | null
          hard_player2_wins?: number | null
          id?: string
          last_match_date?: string | null
          last_match_surface?: string | null
          last_updated?: string | null
          last_winner?: string | null
          player1_name: string
          player1_wins?: number | null
          player2_name: string
          player2_wins?: number | null
        }
        Update: {
          clay_player1_wins?: number | null
          clay_player2_wins?: number | null
          created_at?: string
          grass_player1_wins?: number | null
          grass_player2_wins?: number | null
          hard_player1_wins?: number | null
          hard_player2_wins?: number | null
          id?: string
          last_match_date?: string | null
          last_match_surface?: string | null
          last_updated?: string | null
          last_winner?: string | null
          player1_name?: string
          player1_wins?: number | null
          player2_name?: string
          player2_wins?: number | null
        }
        Relationships: []
      }
      tennis_players: {
        Row: {
          atp_ranking: number | null
          clay_win_rate: number | null
          created_at: string
          data_quality: string | null
          data_source: string | null
          days_since_last_match: number | null
          elo_clay: number | null
          elo_grass: number | null
          elo_hard: number | null
          elo_overall: number | null
          grand_slam_wins: number | null
          grass_win_rate: number | null
          hard_win_rate: number | null
          id: string
          injury_details: string | null
          injury_status: string | null
          last_match_date: string | null
          last_updated: string | null
          masters_wins: number | null
          matches_last_14_days: number | null
          matches_last_7_days: number | null
          player_name: string
          player_name_normalized: string
          qualitative_tags: string[] | null
          quality_score: number | null
          ranking_points: number | null
          recent_form: string | null
          win_rate_last_10: number | null
          win_rate_last_20: number | null
          wta_ranking: number | null
        }
        Insert: {
          atp_ranking?: number | null
          clay_win_rate?: number | null
          created_at?: string
          data_quality?: string | null
          data_source?: string | null
          days_since_last_match?: number | null
          elo_clay?: number | null
          elo_grass?: number | null
          elo_hard?: number | null
          elo_overall?: number | null
          grand_slam_wins?: number | null
          grass_win_rate?: number | null
          hard_win_rate?: number | null
          id?: string
          injury_details?: string | null
          injury_status?: string | null
          last_match_date?: string | null
          last_updated?: string | null
          masters_wins?: number | null
          matches_last_14_days?: number | null
          matches_last_7_days?: number | null
          player_name: string
          player_name_normalized: string
          qualitative_tags?: string[] | null
          quality_score?: number | null
          ranking_points?: number | null
          recent_form?: string | null
          win_rate_last_10?: number | null
          win_rate_last_20?: number | null
          wta_ranking?: number | null
        }
        Update: {
          atp_ranking?: number | null
          clay_win_rate?: number | null
          created_at?: string
          data_quality?: string | null
          data_source?: string | null
          days_since_last_match?: number | null
          elo_clay?: number | null
          elo_grass?: number | null
          elo_hard?: number | null
          elo_overall?: number | null
          grand_slam_wins?: number | null
          grass_win_rate?: number | null
          hard_win_rate?: number | null
          id?: string
          injury_details?: string | null
          injury_status?: string | null
          last_match_date?: string | null
          last_updated?: string | null
          masters_wins?: number | null
          matches_last_14_days?: number | null
          matches_last_7_days?: number | null
          player_name?: string
          player_name_normalized?: string
          qualitative_tags?: string[] | null
          quality_score?: number | null
          ranking_points?: number | null
          recent_form?: string | null
          win_rate_last_10?: number | null
          win_rate_last_20?: number | null
          wta_ranking?: number | null
        }
        Relationships: []
      }
      user_bets: {
        Row: {
          bet_score: number | null
          bookmaker: string
          confidence: string | null
          created_at: string
          edge: number | null
          event_name: string
          id: string
          implied_probability: number | null
          league: string
          model_probability: number | null
          odds: number
          profit_loss: number | null
          rationale: string | null
          result_odds: number | null
          selection: string
          settled_at: string | null
          sport: string
          stake_units: number | null
          start_time: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bet_score?: number | null
          bookmaker: string
          confidence?: string | null
          created_at?: string
          edge?: number | null
          event_name: string
          id?: string
          implied_probability?: number | null
          league: string
          model_probability?: number | null
          odds: number
          profit_loss?: number | null
          rationale?: string | null
          result_odds?: number | null
          selection: string
          settled_at?: string | null
          sport?: string
          stake_units?: number | null
          start_time?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bet_score?: number | null
          bookmaker?: string
          confidence?: string | null
          created_at?: string
          edge?: number | null
          event_name?: string
          id?: string
          implied_probability?: number | null
          league?: string
          model_probability?: number | null
          odds?: number
          profit_loss?: number | null
          rationale?: string | null
          result_odds?: number | null
          selection?: string
          settled_at?: string | null
          sport?: string
          stake_units?: number | null
          start_time?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      value_bets: {
        Row: {
          actual_probability: number
          actual_score: string | null
          confidence: Database["public"]["Enums"]["confidence_level"]
          created_at: string | null
          edge: number
          expected_value: number
          fair_odds: number
          id: string
          implied_probability: number
          is_active: boolean
          market: Database["public"]["Enums"]["market_type"]
          match_id: string | null
          meets_criteria: boolean
          min_odds: number
          offered_odds: number
          reasoning: string | null
          result: string | null
          selection: string
          settled_at: string | null
          suggested_stake_percent: number
        }
        Insert: {
          actual_probability: number
          actual_score?: string | null
          confidence?: Database["public"]["Enums"]["confidence_level"]
          created_at?: string | null
          edge: number
          expected_value: number
          fair_odds: number
          id?: string
          implied_probability: number
          is_active?: boolean
          market: Database["public"]["Enums"]["market_type"]
          match_id?: string | null
          meets_criteria?: boolean
          min_odds: number
          offered_odds: number
          reasoning?: string | null
          result?: string | null
          selection: string
          settled_at?: string | null
          suggested_stake_percent: number
        }
        Update: {
          actual_probability?: number
          actual_score?: string | null
          confidence?: Database["public"]["Enums"]["confidence_level"]
          created_at?: string | null
          edge?: number
          expected_value?: number
          fair_odds?: number
          id?: string
          implied_probability?: number
          is_active?: boolean
          market?: Database["public"]["Enums"]["market_type"]
          match_id?: string | null
          meets_criteria?: boolean
          min_odds?: number
          offered_odds?: number
          reasoning?: string | null
          result?: string | null
          selection?: string
          settled_at?: string | null
          suggested_stake_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "value_bets_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
