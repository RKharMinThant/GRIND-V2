-- Progressive overload board (Progress tab only — user-managed, not tied to session logs)
create table if not exists public.tracked_lifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  muscle_group text not null,
  exercise_name text not null,
  sets integer not null default 3 check (sets >= 0 and sets <= 100),
  reps integer not null default 8 check (reps >= 0 and reps <= 1000),
  weight numeric not null default 0 check (weight >= 0 and weight <= 2000),
  unit text not null default 'kg' check (unit in ('kg', 'lb')),
  -- previous values for progressive overload comparison
  prev_sets integer,
  prev_reps integer,
  prev_weight numeric,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tracked_lifts_user_muscle_idx
  on public.tracked_lifts (user_id, muscle_group, sort_order);

create index if not exists tracked_lifts_user_updated_idx
  on public.tracked_lifts (user_id, updated_at desc);

alter table public.tracked_lifts enable row level security;

create policy "tracked_lifts_select_own"
  on public.tracked_lifts for select
  using (auth.uid() = user_id);

create policy "tracked_lifts_insert_own"
  on public.tracked_lifts for insert
  with check (auth.uid() = user_id);

create policy "tracked_lifts_update_own"
  on public.tracked_lifts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "tracked_lifts_delete_own"
  on public.tracked_lifts for delete
  using (auth.uid() = user_id);
