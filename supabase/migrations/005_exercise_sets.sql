-- Progressive overload: sets / reps / weight per exercise on a session log
create table if not exists public.exercise_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  log_id uuid not null references public.logs (id) on delete cascade,
  exercise_name text not null,
  sets integer not null default 1 check (sets >= 0 and sets <= 100),
  reps integer not null default 1 check (reps >= 0 and reps <= 1000),
  weight numeric not null default 0 check (weight >= 0 and weight <= 2000),
  unit text not null default 'kg' check (unit in ('kg', 'lb')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists exercise_sets_user_name_idx
  on public.exercise_sets (user_id, exercise_name);

create index if not exists exercise_sets_log_idx
  on public.exercise_sets (log_id);

create index if not exists exercise_sets_user_created_idx
  on public.exercise_sets (user_id, created_at desc);

alter table public.exercise_sets enable row level security;

create policy "exercise_sets_select_own"
  on public.exercise_sets for select
  using (auth.uid() = user_id);

create policy "exercise_sets_insert_own"
  on public.exercise_sets for insert
  with check (auth.uid() = user_id);

create policy "exercise_sets_update_own"
  on public.exercise_sets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "exercise_sets_delete_own"
  on public.exercise_sets for delete
  using (auth.uid() = user_id);
