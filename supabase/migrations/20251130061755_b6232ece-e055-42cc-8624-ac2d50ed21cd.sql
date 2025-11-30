-- Add RLS policy to allow users to delete their own bets
CREATE POLICY "Users can delete their own bets"
ON public.bet_history
FOR DELETE
USING (auth.uid() = user_id);