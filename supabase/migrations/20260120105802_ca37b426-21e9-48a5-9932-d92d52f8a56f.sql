-- Fix user_bets RLS policies: change from RESTRICTIVE to PERMISSIVE
DROP POLICY IF EXISTS "Users can delete their own bets" ON public.user_bets;
DROP POLICY IF EXISTS "Users can insert their own bets" ON public.user_bets;
DROP POLICY IF EXISTS "Users can update their own bets" ON public.user_bets;
DROP POLICY IF EXISTS "Users can view their own bets" ON public.user_bets;

-- Recreate as PERMISSIVE policies (default)
CREATE POLICY "Users can view their own bets"
ON public.user_bets
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bets"
ON public.user_bets
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bets"
ON public.user_bets
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bets"
ON public.user_bets
FOR DELETE
USING (auth.uid() = user_id);