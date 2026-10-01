-- GRIND — GRIND Age (a biological age estimated from sleep, activity and body data)
-- Run in Supabase SQL Editor: Dashboard → SQL → New query

-- ── Who the user is ───────────────────────────────────────────────────────────
-- Age and sex are the baseline every factor is measured against. Both are optional:
-- until they are set the app asks for them instead of showing a number.
-- The user edits these through the normal profiles RLS policies; no function needed.
alter table public.profiles
  add column if not exists birth_date date;

alter table public.profiles
  add column if not exists sex text;

alter table public.profiles
  drop constraint if exists profiles_sex_check;

alter table public.profiles
  add constraint profiles_sex_check check (sex in ('male', 'female'));

-- ── Body measurements ─────────────────────────────────────────────────────────
-- Weight (and optionally body fat) typed in by the user. GRIND Age reads the latest
-- row from the last 60 days. Height is not stored here: it comes from Google Health.
create table if not exists public.body_measurements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  measured_on  date not null,
  weight_kg    numeric(5, 1) not null check (weight_kg between 25 and 350),
  body_fat_pct numeric(4, 1) check (body_fat_pct between 3 and 70),
  created_at   timestamptz not null default now()
);

create index if not exists body_measurements_user_date_idx
  on public.body_measurements (user_id, measured_on desc);

alter table public.body_measurements enable row level security;

drop policy if exists "body_measurements_select_own" on public.body_measurements;
create policy "body_measurements_select_own"
  on public.body_measurements for select
  using (auth.uid() = user_id);

drop policy if exists "body_measurements_insert_own" on public.body_measurements;
create policy "body_measurements_insert_own"
  on public.body_measurements for insert
  with check (auth.uid() = user_id);

drop policy if exists "body_measurements_delete_own" on public.body_measurements;
create policy "body_measurements_delete_own"
  on public.body_measurements for delete
  using (auth.uid() = user_id);

-- ── Weekly GRIND Age readings ─────────────────────────────────────────────────
-- One row per user per week (week_start is the Monday in the user's time zone). The
-- history chart and Pace of Aging are read from these rows, so past weeks keep the
-- number they had even if the inputs later change. `result` is the full factor
-- breakdown as returned to the app.
-- Writes come from the health-age Edge Function (service role), so there is only a
-- select policy: a user can read their own readings and nothing else.
create table if not exists public.grind_age_weekly (
  user_id           uuid not null references auth.users (id) on delete cascade,
  week_start        date not null,
  chronological_age numeric(5, 2) not null,
  grind_age         numeric(5, 2) not null,
  pace              numeric(3, 1),
  result            jsonb not null,
  computed_at       timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.grind_age_weekly enable row level security;

drop policy if exists "grind_age_weekly_select_own" on public.grind_age_weekly;
create policy "grind_age_weekly_select_own"
  on public.grind_age_weekly for select
  using (auth.uid() = user_id);
