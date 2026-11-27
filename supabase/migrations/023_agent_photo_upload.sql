-- GRIND — let agent (OAuth) tokens ADD a photo to a log, and nothing else.
-- Migration 021 blocks agent tokens (JWTs carrying a `client_id` claim) from every
-- log-photos policy. The MCP tool add_log_photo needs upload-only access, so this adds ONE
-- extra storage INSERT policy for agent tokens. The select/update/delete policies are untouched:
-- agents still cannot view, list, replace or delete photos.
-- Because agent tokens are ordinary user JWTs that can also call PostgREST directly, this file
-- also (1) stops agents rewriting logs.photo_path except to attach one agent photo to a log that
-- has none, and (2) stops agents choosing their own rate limits in mcp_take.
-- Idempotent: safe to run more than once.

-- ── 1. Storage: one pinned path, a quota, and only for logs without a photo ───
-- Path is exactly {uid}/{log_uuid}/agent.(jpg|png|webp). With upsert off, that caps each log at
-- three agent objects.
create or replace function public.agent_photo_quota_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) < 20
  from storage.objects o
  where o.bucket_id = 'log-photos'
    and o.name like auth.uid()::text || '/%/agent.%'
    and o.created_at > now() - interval '1 hour'
$$;

revoke all on function public.agent_photo_quota_ok() from public, anon;
grant execute on function public.agent_photo_quota_ok() to authenticated;

drop policy if exists "log_photos_agent_insert" on storage.objects;
create policy "log_photos_agent_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'log-photos'
    and (auth.jwt() ->> 'client_id') is not null
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/agent\.(jpg|png|webp)$'
    and exists (
      select 1
      from public.logs l
      where l.id::text = (storage.foldername(name))[2]
        and l.user_id = auth.uid()
        and l.photo_path is null
    )
    and public.agent_photo_quota_ok()
  );

-- ── 2. logs.photo_path: agents may only set it once, to their own pinned path ─
-- The app (no client_id claim) and the service role (no JWT) are unaffected.
create or replace function public.guard_agent_photo_path()
returns trigger
language plpgsql
as $$
begin
  if (auth.jwt() ->> 'client_id') is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.photo_path is null then
      return new;
    end if;
  elsif new.photo_path is not distinct from old.photo_path then
    return new;
  elsif old.photo_path is null
    and new.photo_path ~ ('^' || auth.uid()::text || '/' || new.id::text || '/agent\.(jpg|png|webp)$') then
    return new;
  end if;

  raise exception 'Agents can''t change log photos' using errcode = '42501';
end;
$$;

drop trigger if exists guard_agent_photo_path on public.logs;
create trigger guard_agent_photo_path
  before insert or update on public.logs
  for each row execute function public.guard_agent_photo_path();

-- ── 3. mcp_take: the limits live here, not in the caller ─────────────────────
-- Same signature and grants as migration 021, but the passed limits are ignored: a direct RPC
-- call could otherwise raise them or reset a window. Unknown buckets are refused.
create or replace function public.mcp_take(bucket text, max_per_window int, window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_max   int;
  v_win   int;
  v_count int;
begin
  if v_uid is null then
    return false;
  end if;

  case mcp_take.bucket
    when 'photo' then v_max := 20; v_win := 3600;
    when 'health' then v_max := 30; v_win := 600;
    when 'grind_age_refresh' then v_max := 2; v_win := 3600;
    else return false;
  end case;

  insert into public.mcp_rate_limits as r (user_id, bucket, window_start, count)
  values (v_uid, mcp_take.bucket, now(), 1)
  on conflict on constraint mcp_rate_limits_pkey do update
    set window_start = case
          when r.window_start + make_interval(secs => v_win) <= now() then now()
          else r.window_start
        end,
        count = case
          when r.window_start + make_interval(secs => v_win) <= now() then 1
          else r.count + 1
        end
  returning r.count into v_count;

  return v_count <= v_max;
end;
$$;

revoke all on function public.mcp_take(text, int, int) from public, anon;
grant execute on function public.mcp_take(text, int, int) to authenticated;
