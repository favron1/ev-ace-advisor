-- Add result tracking to value_bets
ALTER TABLE public.value_bets 
ADD COLUMN IF NOT EXISTS result TEXT CHECK (result IN ('won', 'lost', 'void', 'pending')),
ADD COLUMN IF NOT EXISTS settled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS actual_score TEXT;

-- Set existing bets as pending
UPDATE public.value_bets SET result = 'pending' WHERE result IS NULL;