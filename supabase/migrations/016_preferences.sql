-- GRIND — Display preferences (units and week start)
-- Run in Supabase SQL Editor: Dashboard → SQL → New query

alter table public.profiles
  add column if not exists distance_unit text not null default 'km'
    check (distance_unit in ('km', 'mi')),
  add column if not exists weight_unit text not null default 'kg'
    check (weight_unit in ('kg', 'lb')),
  -- 0 = Sunday, 1 = Monday
  add column if not exists week_start smallint not null default 0
    check (week_start in (0, 1));
