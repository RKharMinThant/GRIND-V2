-- GRIND — limits for OAuth-issued (agent) tokens, plus a rate limit for the MCP server.
-- Tokens that Supabase's OAuth server issues are ordinary project JWTs for the user, so RLS
-- sees them as that user. They carry a `client_id` claim; a normal app session does not.
-- Every policy below keys off that claim. Idempotent: safe to run more than once.

-- ── 1. Admin power is for the app, never for an agent ─────────────────────────
-- The admin is identified by email, which an OAuth token for the admin also carries, so an
-- agent connected by the admin would otherwise get admin access. Recreate only the admin
-- policies (a RESTRICTIVE policy would also hit each user's own rows on profiles).
drop policy if exists "invites_admin_all" on public.invites;
create policy "invites_admin_all"
  on public.invites for all
  using (
    auth.jwt() ->> 'email' = 'rkharmthant@gmail.com'
    and (auth.jwt() ->> 'client_id') is null
  )
  with check (
    auth.jwt() ->> 'email' = 'rkharmthant@gmail.com'
    and (auth.jwt() ->> 'client_id') is null
  );

drop policy if exists "profiles_admin_select_all" on public.profiles;
create policy "profiles_admin_select_all"
  on public.profiles for select
  using (
    auth.jwt() ->> 'email' = 'rkharmthant@gmail.com'
    and (auth.jwt() ->> 'client_id') is null
  );

-- ── 2. Agents get no workout photos ───────────────────────────────────────────
-- Same four policies as 001_init.sql, plus the client_id check. Path: {user_id}/{log_id}/{file}
drop policy if exists "log_photos_select_own" on storage.objects;
create policy "log_photos_select_own"
  on storage.objects for select
  using (
    bucket_id = 'log-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (auth.jwt() ->> 'client_id') is null
  );

drop policy if exists "log_photos_insert_own" on storage.objects;
create policy "log_photos_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'log-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (auth.jwt() ->> 'client_id') is null
  );

drop policy if exists "log_photos_update_own" on storage.objects;
create policy "log_photos_update_own"
  on storage.objects for update
  using (
    bucket_id = 'log-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (auth.jwt() ->> 'client_id') is null
  );

drop policy if exists "log_photos_delete_own" on storage.objects;
create policy "log_photos_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'log-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (auth.jwt() ->> 'client_id') is null
  );

-- ── 3. Rate limit for MCP fan-out (Fitbit calls) ──────────────────────────────
-- Fixed window per (user, bucket). RLS on with no policies: only mcp_take (security definer) touches it.
create table if not exists public.mcp_rate_limits (
  user_id      uuid        not null references auth.users (id) on delete cascade,
  bucket       text        not null,
  window_start timestamptz not null default now(),
  count        int         not null default 0,
  primary key (user_id, bucket)
);

alter table public.mcp_rate_limits enable row level security;

-- Takes one slot. Returns true while the window's count is within max_per_window.
-- Atomic: a single upsert resets an expired window or increments the live one.
create or replace function public.mcp_take(bucket text, max_per_window int, window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then
    return false;
  end if;

  insert into public.mcp_rate_limits as r (user_id, bucket, window_start, count)
  values (v_uid, mcp_take.bucket, now(), 1)
  on conflict on constraint mcp_rate_limits_pkey do update
    set window_start = case
          when r.window_start + make_interval(secs => mcp_take.window_seconds) <= now() then now()
          else r.window_start
        end,
        count = case
          when r.window_start + make_interval(secs => mcp_take.window_seconds) <= now() then 1
          else r.count + 1
        end
  returning r.count into v_count;

  return v_count <= mcp_take.max_per_window;
end;
$$;

revoke all on function public.mcp_take(text, int, int) from public, anon;
grant execute on function public.mcp_take(text, int, int) to authenticated;
