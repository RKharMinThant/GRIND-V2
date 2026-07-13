-- GRIND Habit Tracker — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query)

-- ── Profiles ──────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Logs ──────────────────────────────────────────────────────────────────────
create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  log_date date not null,
  workout text not null,
  workout_type text,
  duration text,
  meal text,
  notes text,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists logs_user_date_idx
  on public.logs (user_id, log_date desc);

alter table public.logs enable row level security;

create policy "logs_select_own"
  on public.logs for select
  using (auth.uid() = user_id);

create policy "logs_insert_own"
  on public.logs for insert
  with check (auth.uid() = user_id);

create policy "logs_update_own"
  on public.logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "logs_delete_own"
  on public.logs for delete
  using (auth.uid() = user_id);

-- Keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists logs_set_updated_at on public.logs;
create trigger logs_set_updated_at
  before update on public.logs
  for each row execute function public.set_updated_at();

-- ── Storage: log-photos ───────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'log-photos',
  'log-photos',
  false,
  5242880, -- 5MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path convention: {user_id}/{log_id}/{filename}
create policy "log_photos_select_own"
  on storage.objects for select
  using (
    bucket_id = 'log-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "log_photos_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'log-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "log_photos_update_own"
  on storage.objects for update
  using (
    bucket_id = 'log-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "log_photos_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'log-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
