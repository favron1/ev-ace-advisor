-- Create tennis_players table to cache player rankings and stats
CREATE TABLE public.tennis_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player_name TEXT NOT NULL,
  player_name_normalized TEXT NOT NULL,
  atp_ranking INTEGER,
  wta_ranking INTEGER,
  ranking_points INTEGER,
  -- Surface-specific Elo ratings
  elo_overall NUMERIC(7,2) DEFAULT 1500,
  elo_hard NUMERIC(7,2) DEFAULT 1500,
  elo_clay NUMERIC(7,2) DEFAULT 1500,
  elo_grass NUMERIC(7,2) DEFAULT 1500,
  -- Recent form
  recent_form TEXT, -- W/L sequence (e.g., 'WWLWW')
  win_rate_last_10 NUMERIC(4,2),
  win_rate_last_20 NUMERIC(4,2),
  -- Surface-specific win rates
  hard_win_rate NUMERIC(4,2),
  clay_win_rate NUMERIC(4,2),
  grass_win_rate NUMERIC(4,2),
  -- Tournament performance
  grand_slam_wins INTEGER DEFAULT 0,
  masters_wins INTEGER DEFAULT 0,
  -- Physical/fatigue factors
  matches_last_7_days INTEGER DEFAULT 0,
  matches_last_14_days INTEGER DEFAULT 0,
  last_match_date DATE,
  days_since_last_match INTEGER,
  -- Injury status
  injury_status TEXT, -- 'fit', 'doubtful', 'injured'
  injury_details TEXT,
  -- Qualitative flags
  qualitative_tags TEXT[], -- e.g., 'returning_from_injury', 'peak_form', 'fatigue_risk'
  -- Data source tracking
  data_source TEXT DEFAULT 'odds_only', -- 'odds_only', 'perplexity', 'api'
  data_quality TEXT DEFAULT 'low', -- 'high', 'medium', 'low'
  quality_score INTEGER DEFAULT 0,
  -- Timestamps
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_player_name UNIQUE (player_name_normalized)
);

-- Create head-to-head records table
CREATE TABLE public.tennis_h2h (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player1_name TEXT NOT NULL,
  player2_name TEXT NOT NULL,
  player1_wins INTEGER DEFAULT 0,
  player2_wins INTEGER DEFAULT 0,
  -- Surface-specific H2H
  hard_player1_wins INTEGER DEFAULT 0,
  hard_player2_wins INTEGER DEFAULT 0,
  clay_player1_wins INTEGER DEFAULT 0,
  clay_player2_wins INTEGER DEFAULT 0,
  grass_player1_wins INTEGER DEFAULT 0,
  grass_player2_wins INTEGER DEFAULT 0,
  -- Last match info
  last_match_date DATE,
  last_match_surface TEXT,
  last_winner TEXT,
  -- Timestamps
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_h2h UNIQUE (player1_name, player2_name)
);

-- Enable RLS
ALTER TABLE public.tennis_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tennis_h2h ENABLE ROW LEVEL SECURITY;

-- Create read-only policies (data is public reference data)
CREATE POLICY "Tennis players are publicly readable" 
ON public.tennis_players 
FOR SELECT 
USING (true);

CREATE POLICY "Tennis H2H are publicly readable" 
ON public.tennis_h2h 
FOR SELECT 
USING (true);

-- Service role can write (for edge functions)
CREATE POLICY "Service role can manage tennis_players"
ON public.tennis_players
FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can manage tennis_h2h"
ON public.tennis_h2h
FOR ALL
USING (true)
WITH CHECK (true);

-- Create indexes for fast lookup
CREATE INDEX idx_tennis_players_normalized ON public.tennis_players(player_name_normalized);
CREATE INDEX idx_tennis_players_ranking ON public.tennis_players(atp_ranking, wta_ranking);
CREATE INDEX idx_tennis_h2h_players ON public.tennis_h2h(player1_name, player2_name);