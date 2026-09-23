-- GRIND — Google Health webhooks for post-workout notifications
-- Run in Supabase SQL Editor: Dashboard → SQL → New query

-- ── Map Google's webhook identity to our account ──────────────────────────────
-- A webhook says "healthUserId X has new exercise data" and nothing else, so this
-- is the only way back to a GRIND user. Filled from users.getIdentity at connect
-- time (and lazily on the next sync for connections made before this migration).
-- It never changes for a given Google account, so it is safe to cache forever.
alter table public.health_connections
  add column if not exists health_user_id text;

create unique index if not exists health_connections_health_user_id_idx
  on public.health_connections (health_user_id)
  where health_user_id is not null;

-- ── Per-workout de-duplication ────────────────────────────────────────────────
-- The ledger was one row per (user, type, day), which is right for a daily nudge
-- but wrong for workouts: two sessions in a day should give two notifications, and
-- a webhook redelivery should give none. `ref` carries the exercise data point id
-- for those, and stays '' for the daily rules so their behaviour is unchanged.
alter table public.notification_sends
  add column if not exists ref text not null default '';

alter table public.notification_sends
  drop constraint if exists notification_sends_pkey;

alter table public.notification_sends
  add constraint notification_sends_pkey primary key (user_id, type, local_day, ref);
