-- GRIND — Fitbit / Google Health workout stats on session logs
-- Run in Supabase SQL Editor: Dashboard → SQL → New query
--
-- Existing RLS on public.logs covers these columns.
-- The partial unique index prevents logging the same tracker workout twice.

alter table public.logs
  add column if not exists health_source text check (health_source in ('demo', 'google_health')),
  add column if not exists health_workout_id text,
  add column if not exists calories_kcal integer check (calories_kcal >= 0),
  add column if not exists avg_hr integer check (avg_hr between 20 and 250),
  add column if not exists max_hr integer check (max_hr between 20 and 250),
  add column if not exists hr_zone_minutes jsonb;

create unique index if not exists logs_user_health_workout_uidx
  on public.logs (user_id, health_workout_id)
  where health_workout_id is not null;

-- Remove demo (mock) stats after Phase 1 testing — sessions themselves are kept:
--
-- update public.logs
--    set health_source = null, health_workout_id = null, calories_kcal = null,
--        avg_hr = null, max_hr = null, hr_zone_minutes = null
--  where health_source = 'demo';
