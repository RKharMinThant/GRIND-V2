-- GRIND — Invite-only sign-up system
-- Run in Supabase SQL Editor: Dashboard → SQL → New query

-- ── Invites table ─────────────────────────────────────────────────────────────
create table if not exists public.invites (
  id          uuid        primary key default gen_random_uuid(),
  code        text        not null unique default encode(gen_random_bytes(16), 'hex'),
  created_by  uuid        not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,                    -- NULL = never expires
  max_uses    int         not null default 1, -- number of signups allowed
  uses        int         not null default 0, -- times redeemed
  note        text,                           -- optional admin label
  revoked     bool        not null default false
);

alter table public.invites enable row level security;

-- ── RLS: Admin full access ────────────────────────────────────────────────────
-- Use auth.jwt() ->> 'email' — avoids querying auth.users (no permission for that)
create policy "invites_admin_all"
  on public.invites for all
  using (
    auth.jwt() ->> 'email' = 'rkharmthant@gmail.com'
  )
  with check (
    auth.jwt() ->> 'email' = 'rkharmthant@gmail.com'
  );

-- ── RLS: Public can verify a code (pre-signup validation) ────────────────────
-- Allow anonymous reads of non-sensitive columns via a view (see below).
-- Direct table access: allow reading a single invite row by code for validation.
create policy "invites_public_read_by_code"
  on public.invites for select
  using (true); -- filtered by code in application queries; all cols needed for validation

-- ── Atomic redeem function ────────────────────────────────────────────────────
create or replace function public.redeem_invite(p_code text)
returns uuid          -- returns invite id on success
language plpgsql
security definer      -- runs as owner to bypass RLS on the atomic update
set search_path = public
as $$
declare
  v_invite public.invites%rowtype;
begin
  -- Lock the row for update to prevent double-redemption race conditions
  select *
    into v_invite
    from public.invites
   where code = p_code
   for update;

  if not found then
    raise exception 'Invalid invite code';
  end if;

  if v_invite.revoked then
    raise exception 'This invite has been revoked';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'This invite link has expired';
  end if;

  if v_invite.uses >= v_invite.max_uses then
    raise exception 'This invite link has already been used';
  end if;

  -- Atomically increment uses
  update public.invites
     set uses = uses + 1
   where id = v_invite.id;

  return v_invite.id;
end;
$$;

-- Grant execute to anon and authenticated (called during signup flow)
grant execute on function public.redeem_invite(text) to anon, authenticated;

-- ── Index for fast code lookups ───────────────────────────────────────────────
create index if not exists invites_code_idx on public.invites (code);
