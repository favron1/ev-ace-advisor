-- Create enum for bet status
CREATE TYPE public.bet_status AS ENUM ('pending', 'won', 'lost', 'void');

-- Create enum for confidence level
CREATE TYPE public.confidence_level AS ENUM ('low', 'moderate', 'high');

-- Create enum for market type
CREATE TYPE public.market_type AS ENUM ('1x2', 'over_under', 'btts', 'handicap', 'correct_score', 'other');

-- Create matches table for storing football match data
CREATE TABLE public.matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    league TEXT NOT NULL,
    match_date TIMESTAMP WITH TIME ZONE NOT NULL,
    home_form TEXT, -- Last 5 matches (e.g., "WWLDW")
    away_form TEXT,
    home_goals_scored NUMERIC,
    home_goals_conceded NUMERIC,
    away_goals_scored NUMERIC,
    away_goals_conceded NUMERIC,
    home_xg NUMERIC,
    away_xg NUMERIC,
    head_to_head JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create value_bets table for AI-analyzed betting opportunities
CREATE TABLE public.value_bets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
    market market_type NOT NULL,
    selection TEXT NOT NULL,
    offered_odds NUMERIC NOT NULL,
    fair_odds NUMERIC NOT NULL,
    implied_probability NUMERIC NOT NULL,
    actual_probability NUMERIC NOT NULL,
    expected_value NUMERIC NOT NULL,
    edge NUMERIC NOT NULL,
    confidence confidence_level NOT NULL DEFAULT 'moderate',
    min_odds NUMERIC NOT NULL,
    suggested_stake_percent NUMERIC NOT NULL,
    reasoning TEXT,
    meets_criteria BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create user bet history table
CREATE TABLE public.bet_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    value_bet_id UUID REFERENCES public.value_bets(id) ON DELETE SET NULL,
    match_description TEXT NOT NULL,
    selection TEXT NOT NULL,
    odds NUMERIC NOT NULL,
    stake NUMERIC NOT NULL,
    potential_return NUMERIC NOT NULL,
    status bet_status NOT NULL DEFAULT 'pending',
    profit_loss NUMERIC,
    placed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    settled_at TIMESTAMP WITH TIME ZONE
);

-- Create user profiles table for bankroll tracking
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL,
    display_name TEXT,
    bankroll NUMERIC DEFAULT 1000,
    total_bets INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    total_profit NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.value_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bet_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Matches are public read, admin write
CREATE POLICY "Matches are publicly readable" ON public.matches
    FOR SELECT USING (true);

-- Value bets are public read
CREATE POLICY "Value bets are publicly readable" ON public.value_bets
    FOR SELECT USING (true);

-- Bet history policies - users can only see their own
CREATE POLICY "Users can view their own bet history" ON public.bet_history
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bets" ON public.bet_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bets" ON public.bet_history
    FOR UPDATE USING (auth.uid() = user_id);

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for timestamp updates
CREATE TRIGGER update_matches_updated_at
    BEFORE UPDATE ON public.matches
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (user_id, display_name)
    VALUES (new.id, new.raw_user_meta_data ->> 'display_name');
    RETURN new;
END;
$$;

-- Trigger for auto-creating profile on signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();