-- =====================================================
-- RACING BETTING ENGINE - ISOLATED DATABASE SCHEMA
-- Completely separate from sports betting tables
-- =====================================================

-- Racing Events (individual races)
CREATE TABLE public.racing_events (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    external_id TEXT UNIQUE,
    sport TEXT NOT NULL CHECK (sport IN ('horse', 'greyhound')),
    track TEXT NOT NULL,
    track_country TEXT NOT NULL,
    track_state TEXT,
    race_number INTEGER NOT NULL,
    race_name TEXT,
    race_type TEXT, -- e.g., 'Maiden', 'Class 1', 'Group 1', 'Stakes'
    distance_m INTEGER NOT NULL,
    track_condition TEXT, -- Good, Soft, Heavy, Synthetic
    weather TEXT,
    rail_position TEXT,
    start_time_utc TIMESTAMPTZ NOT NULL,
    start_time_local TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'final', 'abandoned')),
    total_prize_money INTEGER,
    field_size INTEGER,
    raw_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Racing Runners (each runner in a race)
CREATE TABLE public.racing_runners (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES public.racing_events(id) ON DELETE CASCADE,
    runner_number INTEGER NOT NULL,
    runner_name TEXT NOT NULL,
    barrier_box INTEGER NOT NULL, -- Barrier for horses, Box for greyhounds
    
    -- Horse-specific fields
    jockey_name TEXT,
    trainer_name TEXT,
    weight_kg NUMERIC(5,2),
    jockey_claim NUMERIC(3,1),
    
    -- Greyhound-specific fields
    dam TEXT,
    sire TEXT,
    
    -- Common form/stats
    recent_form TEXT[], -- Last 5-10 finishes as array ['1','2','5','3']
    form_comment TEXT,
    last_starts_days INTEGER, -- Days since last race
    career_wins INTEGER,
    career_places INTEGER,
    career_starts INTEGER,
    track_wins INTEGER,
    track_starts INTEGER,
    distance_wins INTEGER,
    distance_starts INTEGER,
    
    -- Speed/pace data
    early_speed_rating NUMERIC(5,2),
    run_style TEXT CHECK (run_style IN ('leader', 'on_pace', 'midfield', 'closer', 'backmarker')),
    avg_800m_time NUMERIC(6,3), -- For sectional analysis
    avg_400m_time NUMERIC(6,3),
    
    -- Class & ratings
    class_level TEXT,
    official_rating INTEGER,
    speed_rating NUMERIC(5,2),
    
    -- Result (filled after race)
    finish_position INTEGER,
    finish_margin NUMERIC(6,2),
    result_time NUMERIC(8,3),
    
    scratched BOOLEAN NOT NULL DEFAULT FALSE,
    scratched_reason TEXT,
    
    raw_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    UNIQUE(event_id, runner_number)
);

-- Racing Markets (odds from bookmakers)
CREATE TABLE public.racing_markets (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES public.racing_events(id) ON DELETE CASCADE,
    runner_id UUID NOT NULL REFERENCES public.racing_runners(id) ON DELETE CASCADE,
    bookmaker TEXT NOT NULL,
    market_type TEXT NOT NULL DEFAULT 'win' CHECK (market_type IN ('win', 'place', 'each_way')),
    odds_decimal NUMERIC(8,2) NOT NULL,
    implied_probability NUMERIC(5,4) GENERATED ALWAYS AS (1.0 / odds_decimal) STORED,
    is_best_odds BOOLEAN DEFAULT FALSE,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    UNIQUE(event_id, runner_id, bookmaker, market_type, captured_at)
);

-- Racing Odds Snapshots (historical odds for movement tracking)
CREATE TABLE public.racing_odds_snapshots (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    market_id UUID NOT NULL REFERENCES public.racing_markets(id) ON DELETE CASCADE,
    odds_decimal NUMERIC(8,2) NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Racing Model Predictions (AI/statistical model outputs)
CREATE TABLE public.racing_model_predictions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES public.racing_events(id) ON DELETE CASCADE,
    runner_id UUID NOT NULL REFERENCES public.racing_runners(id) ON DELETE CASCADE,
    model_version TEXT NOT NULL,
    
    -- Model outputs
    model_probability NUMERIC(5,4) NOT NULL,
    confidence_score NUMERIC(5,2) NOT NULL,
    
    -- Angles triggered
    angles_triggered TEXT[], -- e.g., ['barrier_bias', 'class_drop', 'trainer_track']
    angle_details JSONB,
    
    -- Value calculation
    best_odds_at_prediction NUMERIC(8,2),
    implied_prob_market NUMERIC(5,4),
    expected_value NUMERIC(6,4),
    edge_pct NUMERIC(5,2),
    
    -- Recommendation
    is_recommended BOOLEAN NOT NULL DEFAULT FALSE,
    recommended_stake_pct NUMERIC(4,2),
    reasoning TEXT,
    
    predicted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    UNIQUE(event_id, runner_id, model_version)
);

-- Racing Bets (user's racing bets - completely separate from sports bets)
CREATE TABLE public.racing_bets (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    event_id UUID NOT NULL REFERENCES public.racing_events(id),
    runner_id UUID NOT NULL REFERENCES public.racing_runners(id),
    prediction_id UUID REFERENCES public.racing_model_predictions(id),
    
    -- Bet details
    market_type TEXT NOT NULL DEFAULT 'win' CHECK (market_type IN ('win', 'place', 'each_way')),
    bookmaker TEXT NOT NULL,
    odds_taken NUMERIC(8,2) NOT NULL,
    stake_units NUMERIC(6,2) NOT NULL,
    
    -- Model info at time of bet
    model_probability NUMERIC(5,4),
    edge_at_bet NUMERIC(5,2),
    confidence_at_bet NUMERIC(5,2),
    angles_at_bet TEXT[],
    
    -- Result
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost', 'void', 'scratched')),
    profit_loss_units NUMERIC(8,2),
    closing_odds NUMERIC(8,2),
    clv NUMERIC(6,4), -- Closing Line Value
    
    placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Racing Track Bias (learned from historical results)
CREATE TABLE public.racing_track_bias (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    track TEXT NOT NULL,
    sport TEXT NOT NULL CHECK (sport IN ('horse', 'greyhound')),
    distance_range TEXT, -- e.g., 'sprint', 'middle', 'staying'
    track_condition TEXT,
    
    -- Barrier/Box bias stats
    barrier_1_win_rate NUMERIC(5,4),
    barrier_2_win_rate NUMERIC(5,4),
    barrier_3_win_rate NUMERIC(5,4),
    barrier_4_win_rate NUMERIC(5,4),
    barrier_5_win_rate NUMERIC(5,4),
    barrier_6_win_rate NUMERIC(5,4),
    barrier_7_win_rate NUMERIC(5,4),
    barrier_8_win_rate NUMERIC(5,4),
    barrier_wide_win_rate NUMERIC(5,4), -- 9+ for horses, wider boxes for dogs
    
    -- Pace bias
    leader_win_rate NUMERIC(5,4),
    on_pace_win_rate NUMERIC(5,4),
    closer_win_rate NUMERIC(5,4),
    
    -- Rail bias
    rail_position_advantage TEXT,
    
    sample_size INTEGER NOT NULL DEFAULT 0,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    UNIQUE(track, sport, distance_range, track_condition)
);

-- Create indexes for performance
CREATE INDEX idx_racing_events_status ON public.racing_events(status);
CREATE INDEX idx_racing_events_start_time ON public.racing_events(start_time_utc);
CREATE INDEX idx_racing_events_sport ON public.racing_events(sport);
CREATE INDEX idx_racing_events_track ON public.racing_events(track);
CREATE INDEX idx_racing_runners_event ON public.racing_runners(event_id);
CREATE INDEX idx_racing_markets_event ON public.racing_markets(event_id);
CREATE INDEX idx_racing_markets_runner ON public.racing_markets(runner_id);
CREATE INDEX idx_racing_predictions_event ON public.racing_model_predictions(event_id);
CREATE INDEX idx_racing_bets_user ON public.racing_bets(user_id);
CREATE INDEX idx_racing_bets_status ON public.racing_bets(status);

-- Enable RLS
ALTER TABLE public.racing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.racing_runners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.racing_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.racing_odds_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.racing_model_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.racing_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.racing_track_bias ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Racing data is public read, betting is user-specific
CREATE POLICY "Racing events are viewable by everyone" ON public.racing_events FOR SELECT USING (true);
CREATE POLICY "Racing runners are viewable by everyone" ON public.racing_runners FOR SELECT USING (true);
CREATE POLICY "Racing markets are viewable by everyone" ON public.racing_markets FOR SELECT USING (true);
CREATE POLICY "Racing odds snapshots are viewable by everyone" ON public.racing_odds_snapshots FOR SELECT USING (true);
CREATE POLICY "Racing predictions are viewable by everyone" ON public.racing_model_predictions FOR SELECT USING (true);
CREATE POLICY "Racing track bias is viewable by everyone" ON public.racing_track_bias FOR SELECT USING (true);

-- User bets policies
CREATE POLICY "Users can view their own racing bets" ON public.racing_bets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own racing bets" ON public.racing_bets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own racing bets" ON public.racing_bets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own racing bets" ON public.racing_bets FOR DELETE USING (auth.uid() = user_id);

-- Service role policies for edge functions to write racing data
CREATE POLICY "Service role can insert racing events" ON public.racing_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can update racing events" ON public.racing_events FOR UPDATE USING (true);
CREATE POLICY "Service role can insert racing runners" ON public.racing_runners FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can update racing runners" ON public.racing_runners FOR UPDATE USING (true);
CREATE POLICY "Service role can insert racing markets" ON public.racing_markets FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can insert racing odds snapshots" ON public.racing_odds_snapshots FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can insert racing predictions" ON public.racing_model_predictions FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can update racing predictions" ON public.racing_model_predictions FOR UPDATE USING (true);
CREATE POLICY "Service role can insert racing track bias" ON public.racing_track_bias FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can update racing track bias" ON public.racing_track_bias FOR UPDATE USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_racing_events_updated_at BEFORE UPDATE ON public.racing_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_racing_runners_updated_at BEFORE UPDATE ON public.racing_runners FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_racing_bets_updated_at BEFORE UPDATE ON public.racing_bets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();