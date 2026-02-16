
CREATE TABLE IF NOT EXISTS ps_sports (slug TEXT PRIMARY KEY, name TEXT NOT NULL, sport_type TEXT NOT NULL, icon TEXT, created_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS ps_events (id TEXT PRIMARY KEY, sport_slug TEXT NOT NULL REFERENCES ps_sports(slug), home_team TEXT NOT NULL, away_team TEXT NOT NULL, start_time TIMESTAMPTZ NOT NULL, status TEXT NOT NULL DEFAULT 'upcoming', polymarket_slug TEXT, polymarket_event_id TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS ps_markets (id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES ps_events(id), condition_id TEXT, question TEXT, outcomes TEXT, token_ids TEXT[], yes_price NUMERIC, no_price NUMERIC, volume NUMERIC DEFAULT 0, liquidity NUMERIC DEFAULT 0, polymarket_url TEXT, updated_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS ps_odds_snapshots (id BIGSERIAL PRIMARY KEY, market_id TEXT NOT NULL REFERENCES ps_markets(id), yes_price NUMERIC NOT NULL, no_price NUMERIC NOT NULL, volume NUMERIC, captured_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS ps_api_keys (key_hash TEXT PRIMARY KEY, tier TEXT NOT NULL DEFAULT 'free', user_email TEXT, requests_today INTEGER DEFAULT 0, last_request TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS ps_sharp_odds (id BIGSERIAL PRIMARY KEY, event_id TEXT NOT NULL REFERENCES ps_events(id), source TEXT NOT NULL DEFAULT 'pinnacle', home_odds NUMERIC NOT NULL, away_odds NUMERIC NOT NULL, captured_at TIMESTAMPTZ DEFAULT now());

-- Enable RLS on all new tables
ALTER TABLE ps_sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ps_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ps_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ps_odds_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ps_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE ps_sharp_odds ENABLE ROW LEVEL SECURITY;

-- Public read policies
CREATE POLICY "ps_sports publicly readable" ON ps_sports FOR SELECT USING (true);
CREATE POLICY "ps_events publicly readable" ON ps_events FOR SELECT USING (true);
CREATE POLICY "ps_markets publicly readable" ON ps_markets FOR SELECT USING (true);
CREATE POLICY "ps_odds_snapshots publicly readable" ON ps_odds_snapshots FOR SELECT USING (true);
CREATE POLICY "ps_sharp_odds publicly readable" ON ps_sharp_odds FOR SELECT USING (true);

-- Service role write policies
CREATE POLICY "Service role manages ps_sports" ON ps_sports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages ps_events" ON ps_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages ps_markets" ON ps_markets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages ps_odds_snapshots" ON ps_odds_snapshots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages ps_api_keys" ON ps_api_keys FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages ps_sharp_odds" ON ps_sharp_odds FOR ALL USING (true) WITH CHECK (true);

-- Seed sports data
INSERT INTO ps_sports (slug, name, sport_type, icon) VALUES ('nba','NBA','basketball','🏀'),('nhl','NHL','hockey','🏒'),('epl','English Premier League','soccer','⚽'),('sea','Serie A','soccer','⚽'),('bun','Bundesliga','soccer','⚽'),('lla','La Liga','soccer','⚽'),('ucl','Champions League','soccer','⚽'),('ufc','UFC','mma','🥊'),('cbb','College Basketball','basketball','🏀') ON CONFLICT (slug) DO NOTHING;
