-- GRIND — Google Health (Fitbit) connections for Edge Functions
-- Run in Supabase SQL Editor: Dashboard → SQL → New query
--
-- Both tables have RLS enabled and NO policies: only the service role
-- (Supabase Edge Functions) can read or write them. Tokens never reach the browser.

create table if not exists public.health_connections (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  refresh_token     text not null,
  access_token      text,
  access_expires_at timestamptz,
  scopes            text[] not null default '{}',
  status            text not null default 'connected' check (status in ('connected', 'expired')),
  last_synced_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.health_connections enable row level security;

drop trigger if exists health_connections_set_updated_at on public.health_connections;
create trigger health_connections_set_updated_at
  before update on public.health_connections
  for each row execute function public.set_updated_at();

-- One-time OAuth `state` values (rejected after 10 minutes by the callback)
create table if not exists public.health_oauth_states (
  state      text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  return_to  text not null,
  created_at timestamptz not null default now()
);

alter table public.health_oauth_states enable row level security;

-- Non-secret connection status for the signed-in user
create or replace function public.health_connection_status()
returns table (status text, last_synced_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select c.status, c.last_synced_at
    from public.health_connections c
   where c.user_id = auth.uid()
$$;

revoke all on function public.health_connection_status() from public;
grant execute on function public.health_connection_status() to authenticated;
