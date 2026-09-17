-- GRIND — Daily step goal for the Fitbit steps ring
-- Run in Supabase SQL Editor: Dashboard → SQL → New query

alter table public.profiles
  add column if not exists daily_step_goal integer not null default 10000
  check (daily_step_goal between 1000 and 100000);
