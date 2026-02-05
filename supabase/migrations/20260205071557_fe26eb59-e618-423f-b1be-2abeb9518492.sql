-- Add source column to event_watch_state to track origin of watched events
ALTER TABLE public.event_watch_state 
ADD COLUMN IF NOT EXISTS source text DEFAULT 'automated';

-- Add comment explaining the column
COMMENT ON COLUMN public.event_watch_state.source IS 'Origin of the event: automated, batch_import, manual_entry';