-- GRIND — Web Push notifications
-- Run in Supabase SQL Editor: Dashboard → SQL → New query

-- ── Per-user toggles ──────────────────────────────────────────────────────────
-- Shape: {"fitbit_expired": true, "inactivity": true, ...}. A missing key means off,
-- so notifications are opt-in and a new type never starts sending on its own.
-- The user edits this through the normal profiles RLS policies; no function needed.
alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

-- ── Device subscriptions ──────────────────────────────────────────────────────
-- One row per browser/device. The endpoint IS the identity: re-subscribing the same
-- device returns the same endpoint, so upsert keeps it to a single row.
-- RLS on with NO policies: only the service role (Edge Functions) reads or writes.
create table if not exists public.push_subscriptions (
  endpoint      text primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  p256dh        text not null,
  auth          text not null,
  -- IANA zone reported by the browser, e.g. "Asia/Yangon". Rules use it to fire at a
  -- sensible local hour rather than whenever the scheduler happens to run.
  time_zone     text not null default 'UTC',
  user_agent    text,
  -- Consecutive delivery failures; the dispatcher deletes a subscription at 3.
  failure_count smallint not null default 0,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- ── Send ledger ───────────────────────────────────────────────────────────────
-- The primary key does the de-duplication: a given type can only be sent to a user
-- once per local day. Insert first, send only if the insert was accepted, so an
-- overlapping or retried scheduler run cannot double-send.
create table if not exists public.notification_sends (
  user_id   uuid not null references auth.users (id) on delete cascade,
  type      text not null,
  local_day date not null,
  sent_at   timestamptz not null default now(),
  primary key (user_id, type, local_day)
);

alter table public.notification_sends enable row level security;
