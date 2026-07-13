-- Weekly session goal on profiles (default 4)
alter table public.profiles
  add column if not exists weekly_goal integer not null default 4
  check (weekly_goal >= 1 and weekly_goal <= 14);
