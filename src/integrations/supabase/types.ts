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
