-- Add unique constraint to racing_markets to allow upserts
ALTER TABLE public.racing_markets 
ADD CONSTRAINT racing_markets_event_runner_book_type_unique 
UNIQUE (event_id, runner_id, bookmaker, market_type);

-- Also add UPDATE policy for racing_markets so edge function can update odds
CREATE POLICY "Service role can update racing markets" 
ON public.racing_markets 
FOR UPDATE 
USING (true);