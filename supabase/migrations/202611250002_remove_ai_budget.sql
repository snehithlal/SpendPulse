-- Retire the monthly cap while preserving existing preferences and usage history.
drop function if exists public.reserve_ai_budget(uuid, bigint);
