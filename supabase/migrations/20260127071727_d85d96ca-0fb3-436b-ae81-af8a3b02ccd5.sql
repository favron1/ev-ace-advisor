-- Add unique constraints for data syncing
ALTER TABLE racing_events 
ADD CONSTRAINT racing_events_unique_race 
UNIQUE (sport, track, race_number, start_time_utc);

ALTER TABLE racing_runners 
ADD CONSTRAINT racing_runners_unique_runner 
UNIQUE (event_id, runner_number);

ALTER TABLE racing_markets 
ADD CONSTRAINT racing_markets_unique_market 
UNIQUE (event_id, runner_id, bookmaker, market_type);