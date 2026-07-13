-- Snapshot history for progressive-overload charts (Progress sheet)
create table if not exists public.lift_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lift_id uuid not null references public.tracked_lifts (id) on delete cascade,
  sets_detail jsonb not null default '[]'::jsonb,
  unit text not null default 'kg' check (unit in ('kg', 'lb')),
  volume numeric not null default 0,
  recorded_at timestamptz not null default now()
);

create index if not exists lift_history_lift_recorded_idx
  on public.lift_history (lift_id, recorded_at desc);

create index if not exists lift_history_user_idx
  on public.lift_history (user_id, recorded_at desc);

alter table public.lift_history enable row level security;

create policy "lift_history_select_own"
  on public.lift_history for select
  using (auth.uid() = user_id);

create policy "lift_history_insert_own"
  on public.lift_history for insert
  with check (auth.uid() = user_id);

create policy "lift_history_delete_own"
  on public.lift_history for delete
  using (auth.uid() = user_id);

-- Seed one history row per existing lift (current state)
insert into public.lift_history (user_id, lift_id, sets_detail, unit, volume, recorded_at)
select
  t.user_id,
  t.id,
  coalesce(t.sets_detail, '[]'::jsonb),
  t.unit,
  coalesce(
    (
      select sum((e->>'reps')::numeric * (e->>'weight')::numeric)
      from jsonb_array_elements(coalesce(t.sets_detail, '[]'::jsonb)) as e
    ),
    t.sets * t.reps * t.weight,
    0
  ),
  t.updated_at
from public.tracked_lifts t
where not exists (
  select 1 from public.lift_history h where h.lift_id = t.id
);
