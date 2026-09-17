# Fitbit Air / Google Health integration — Design

**Date:** 2026-09-17
**Status:** Approved design, pending spec review
**Scope:** Phase 1 (mockup UI on mock data) and Phase 2 (real Google Health API). Phase 1 ships and is tested on the deployed site before Phase 2 starts.

---

## 1. Goal

Bring data from the user's Google Fitbit Air into GRIND so that:

1. A workout recorded by the tracker can be turned into a GRIND session in one tap.
2. Sessions keep the tracker's workout stats (calories, heart rate, zones).
3. Home shows last night's recovery (sleep, resting heart rate, HRV) with a simple train/rest hint.
4. The activity heatmap can show daily steps.

The journal must keep working exactly as today when Fitbit is not connected, unreachable, or expired.

## 2. Decisions

| Topic | Decision |
|---|---|
| Features | All four: workout-detected prompt, pre-filled log form, recovery card, steps on heatmap |
| Workout stats | Saved onto the log (new nullable columns), not live-only |
| Phase 1 visibility | Admin account only (`isAdmin`), on local and deployed |
| Phase 1 saves | Real saves, tagged `health_source = 'demo'` |
| Architecture | Swappable `HealthProvider`: mock now, Google Health later; UI unchanged between phases |
| Data source (Phase 2) | Google Health API v4 (`health.googleapis.com/v4`), via Supabase Edge Functions |

## 3. Architecture

### 3.1 Files

```
src/health/
  types.ts           HealthWorkout, HealthRecovery, DailySteps, HealthConnection
  provider.ts        HealthProvider interface
  mockProvider.ts    Phase 1 — deterministic seeded fake data
  googleProvider.ts  Phase 2 — calls Edge Functions
  logic.ts           pure helpers: readiness, activity→type, step tiers, unlinked workouts
  useHealth.ts       hook consumed by the UI
src/components/
  HealthConnectRow.tsx
  WorkoutDetectedCard.tsx
  RecoveryCard.tsx
  HealthStats.tsx          (Fitbit block for LogDetail / Review step)
supabase/migrations/
  013_log_health_fields.sql      (Phase 1)
  014_health_connections.sql     (Phase 2)
supabase/functions/              (Phase 2)
  health-oauth-start/
  health-oauth-callback/
  health-data/
  health-disconnect/
```

### 3.2 Normalized types (the only shapes the UI sees)

```ts
type HealthWorkout = {
  id: string            // provider workout id; stored as logs.health_workout_id
  start: string         // ISO datetime
  end: string           // ISO datetime
  durationMin: number
  activity: string      // e.g. "Weights", "Run", "Walk"
  calories: number | null
  avgHr: number | null
  maxHr: number | null
  zoneMinutes: { fatBurn: number; cardio: number; peak: number } | null
}

type HealthRecovery = {
  date: string          // local date the night ended (YYYY-MM-DD)
  sleepMin: number | null
  stages: { deep: number; light: number; rem: number; awake: number } | null  // minutes
  restingHr: number | null
  restingHrAvg: number | null   // 7-day average
  hrvMs: number | null
  hrvAvg: number | null         // 7-day average
}

type DailySteps = { date: string; steps: number }

type HealthConnection = {
  status: 'disconnected' | 'connected' | 'expired'
  lastSyncedAt: string | null
  source: 'demo' | 'google_health'
}
```

### 3.3 Provider interface

```ts
interface HealthProvider {
  source: 'demo' | 'google_health'
  getConnection(): Promise<HealthConnection>
  connect(): Promise<void>          // mock: resolves after ~1s; google: redirects to OAuth
  disconnect(): Promise<void>
  getWorkouts(fromDate: string, toDate: string): Promise<HealthWorkout[]>
  getRecovery(date: string): Promise<HealthRecovery | null>
  getDailySteps(fromDate: string, toDate: string): Promise<DailySteps[]>
}
```

### 3.4 `useHealth(enabled, logs)`

- `enabled = isAdmin` in Phase 1. When false, returns a disabled state and makes no calls.
- Exposes: `connection`, `workouts` (last 16 weeks), `recovery` (today), `steps` (last 16 weeks), `loading`, `error`, `connect()`, `disconnect()`, `sync()`.
- Loads on mount (when connected) and on `sync()`. Results held in memory only.
- Chooses the provider in one place (`mockProvider` in Phase 1, `googleProvider` in Phase 2).

### 3.5 Mock provider

- Connection state persisted in `localStorage` (`grind_health_demo_connection`), wrapped in try/catch.
- URL `?health=expired` forces the expired state for previewing.
- Workouts: one per date that has a non-rest log in the last 16 weeks, plus one for today. All values derived from a seeded PRNG keyed by date → identical across reloads. Activity drawn from Weights / Run / Walk / HIIT with Weights most common. Plausible ranges: 30–90 min, 180–650 kcal, avg HR 105–150, max HR avg+20–45.
- Recovery and steps: seeded by date. Sleep 5h–8h30, resting HR 52–66, HRV 30–70 ms, steps 2k–16k.

## 4. Data model

### 4.1 Migration 013 — `logs` health fields (Phase 1)

```sql
alter table public.logs
  add column if not exists health_source text check (health_source in ('demo', 'google_health')),
  add column if not exists health_workout_id text,
  add column if not exists calories_kcal integer check (calories_kcal >= 0),
  add column if not exists avg_hr integer check (avg_hr between 20 and 250),
  add column if not exists max_hr integer check (max_hr between 20 and 250),
  add column if not exists hr_zone_minutes jsonb;

create unique index if not exists logs_user_health_workout_uidx
  on public.logs (user_id, health_workout_id)
  where health_workout_id is not null;
```

Existing RLS on `logs` already covers the new columns.

**Cleanup of demo data** (run manually after Phase 1 testing):

```sql
update public.logs
   set health_source = null, health_workout_id = null, calories_kcal = null,
       avg_hr = null, max_hr = null, hr_zone_minutes = null
 where health_source = 'demo';
```

### 4.2 App types and `useLogs`

- `Log` / `LogInsert` gain the six fields (all nullable/optional).
- `useLogs` `OPTIONAL_COLUMNS` gains them, so saves still work if 013 has not been run.
- `normalizeLog` defaults them to `null`.

### 4.3 Migration 014 — `health_connections` (Phase 2)

```sql
create table public.health_connections (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  refresh_token  text not null,
  access_token   text,
  access_expires_at timestamptz,
  scopes         text[] not null default '{}',
  status         text not null default 'connected' check (status in ('connected', 'expired')),
  last_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.health_connections enable row level security;
-- No policies: only the service role (Edge Functions) can read/write.

create table public.health_oauth_states (
  state      text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.health_oauth_states enable row level security;
-- No policies. States older than 10 minutes are rejected and deleted by the callback.

create function public.health_connection_status()
returns table (status text, last_synced_at timestamptz)
language sql security definer set search_path = public stable
as $$
  select status, last_synced_at from public.health_connections where user_id = auth.uid()
$$;
grant execute on function public.health_connection_status() to authenticated;
```

## 5. UI

Live Fitbit UI (5.2, 5.3 picker, 5.5, 5.6) renders only when `healthEnabled` is true **and** `connection.status === 'connected'`. The connect row (5.1) renders whenever `healthEnabled` is true. Stats already saved on a log (5.3 edit chip, 5.4) render from the log's own columns regardless of connection or gating.

### 5.1 Profile menu — `HealthConnectRow` (in `Shell`)

| State | Shows |
|---|---|
| disconnected | "Fitbit" label, **Connect Fitbit** button (mock: "Connecting…" ~1s) |
| connected | `Fitbit · Demo data · Synced 2 min ago` (label `Google Health` in Phase 2), **Sync now**, **Disconnect** |
| expired | `Fitbit · Connection expired`, **Reconnect** |

### 5.2 Home — `WorkoutDetectedCard`

- Placed directly under the hero panel.
- Candidate = most recent workout whose local start date is today or yesterday, whose `id` is not any log's `health_workout_id`, and not dismissed.
- Content: `Fitbit detected · {activity} · {duration} · {calories} kcal · avg {avgHr} bpm`; if more candidates exist, `+N more`.
- **Log it** → opens `LogFormSheet` with `attachedWorkout` set. **Dismiss** → workout id added to `localStorage` (`grind_health_dismissed`, capped at the 50 most recent ids).

### 5.3 Log form — `LogFormSheet`

- New prop `attachedWorkout?: HealthWorkout | null` and new prop `healthWorkouts?: HealthWorkout[]` (empty when health disabled).
- On open with `attachedWorkout`: `logDate` = workout local start date; `durHours/durMinutes` = `durationMin` (minutes rounded to the nearest 5 to fit `MINUTE_OPTIONS`); `workoutType` = mapped type (see 6.2) if the field is empty.
- **When step:** if health is enabled and any workouts exist on the selected date, show "Fitbit workouts on this day" as selectable rows. Selecting one attaches it and applies date/duration; the attached workout shows as a "From Fitbit" chip with ✕ to detach. Workouts already linked to *another* log are shown disabled.
- Editing a log that already has `health_workout_id`: the chip shows the saved stats from the log's own columns (works even when disconnected).
- **Review step:** adds a row with the Fitbit stats when attached.
- **Save:** includes `health_source`, `health_workout_id`, `calories_kcal`, `avg_hr`, `max_hr`, `hr_zone_minutes` when attached; all `null` when detached.
- Rest days never show the picker.

### 5.4 Sessions

- `LogDetail`: `HealthStats` block when `health_workout_id` is set — calories, avg / max HR, zone-minutes bar (fat burn / cardio / peak).
- `LogCard`: one muted line `♥ {avg_hr} · {calories_kcal} kcal` when present.

### 5.5 Home — `RecoveryCard`

- Placed under the workout-detected card (or under the hero if there is none).
- Three tiles: **Sleep** (`7h 12m` + stacked stage bar), **Resting HR** (`58 bpm`, `↓2 vs 7-day`), **HRV** (`46 ms`, `↑4 vs 7-day`). Missing metrics render as `—`.
- Readiness line (see 6.1) plus a **Rest day** button when readiness is low (reuses `onRestDay`, disabled if today already has a rest log).
- Footnote: "Estimates from your tracker, not medical advice."

### 5.6 Heatmap

- When health is connected, a **Sessions | Steps** segment appears in the section header. Choice persisted in `localStorage` (`grind_heatmap_mode`).
- Steps mode tiers: `0` / `<5k` = empty, `5k–8k` = l1, `8k–12k` = l2, `≥12k` = l3. Tooltip: `{date} · {steps} steps`. Legend reads "Fewer steps … More steps".

### 5.7 Home order

greeting → hero → workout detected → recovery → week strip → metrics → heatmap → recent.

## 6. Pure logic (`src/health/logic.ts`)

### 6.1 Readiness

```
low if any of:
  sleepMin != null && sleepMin < 360
  hrvMs != null && hrvAvg != null && hrvMs < 0.85 * hrvAvg
  restingHr != null && restingHrAvg != null && restingHr > restingHrAvg + 5
unknown if recovery is null or all three metrics are null
otherwise good
```

Copy: low → "Recovery looks low — a rest day might pay off." good → "Recovered — good day to train." unknown → card shows metrics only.

### 6.2 Activity → workout type

| Activity contains (case-insensitive) | `WORKOUT_TYPES` value |
|---|---|
| weight, strength, lift | Strength |
| run, walk, hike, elliptical, treadmill | Cardio |
| hiit, interval, circuit | HIIT |
| yoga, pilates, stretch | Flexibility |
| swim | Swim |
| bike, cycl, spin | Cycle |
| anything else | Other |

### 6.3 Other helpers

- `stepTier(steps): '' | 'l1' | 'l2' | 'l3'`
- `unlinkedWorkouts(workouts, logs, dismissedIds, today)` → candidates for 5.2, newest first.
- `workoutLocalDate(workout)` → `YYYY-MM-DD` in the browser's timezone.
- `roundDurationToOptions(min)` → `{ hours, minutes }` matching `MINUTE_OPTIONS`.

## 7. Phase 2 — Google Health API

### 7.1 Manual setup (user)

1. Google Cloud project → enable **Google Health API**.
2. OAuth consent screen: External, testing; add own Google account as test user.
3. OAuth client type **Web application**; authorized redirect URI `https://<project-ref>.supabase.co/functions/v1/health-oauth-callback`.
4. Scopes: `googlehealth.activity_and_fitness.readonly`, `googlehealth.health_metrics_and_measurements.readonly`, `googlehealth.sleep.readonly`.
5. `supabase secrets set GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… APP_URL=https://grind-v2-tau.vercel.app`.

Known limitation: in testing mode Google refresh tokens expire after 7 days → the UI shows **Reconnect** weekly. Leaving testing mode requires Google's review of restricted scopes; out of scope for this project.

### 7.2 Edge Functions

| Function | Auth | Behavior |
|---|---|---|
| `health-oauth-start` | User JWT | Insert random `state` row; return Google auth URL (`access_type=offline`, `prompt=consent`, the 3 scopes; **no** `include_granted_scopes`). |
| `health-oauth-callback` | none (Google redirect) | Validate `state` (exists, <10 min), delete it; exchange `code`; upsert `health_connections`; redirect to `${APP_URL}/app?health=connected` (or `?health=error`). |
| `health-data` | User JWT | Body `{ from, to, kinds: ('workouts'|'recovery'|'steps')[] }`. Refresh access token if expired; on `invalid_grant` set `status='expired'` and return 409. Call `GET /v4/users/me/dataTypes/{type}/dataPoints` (exercise, sleep, heart-rate / daily-resting-heart-rate, daily-heart-rate-variability, steps via `dailyRollUp`). Normalize to §3.2 types. Update `last_synced_at`. |
| `health-disconnect` | User JWT | Revoke token at Google (best effort); delete row. |

All functions return CORS headers for the app origin and `localhost:5173`.

### 7.3 `googleProvider`

- `getConnection` → `rpc('health_connection_status')`; no row = disconnected.
- `connect` → invoke `health-oauth-start`, `window.location.assign(url)`.
- Data methods → one `health-data` call per `sync()` covering all three kinds; results split in `useHealth`.
- On `/app?health=connected|error`: show toast, strip the param.
- Swap: `useHealth` picks `googleProvider` instead of `mockProvider`; gating stays `isAdmin` until tested, then widened.

### 7.4 To verify at the start of Phase 2

- Exact response field names for exercise, sleep, heart-rate, HRV, steps (adjust normalizers only).
- Historical data horizon (how far back 16 weeks of steps can be read).
- Rate limits.

## 8. Error handling

| Case | Behavior |
|---|---|
| Provider call fails | Cards show `Couldn't reach Fitbit · Retry`; Home, logs and streaks unaffected |
| Token expired (`409` / `invalid_grant`) | `connection.status = 'expired'`; cards hidden; profile row shows **Reconnect** |
| Duplicate `health_workout_id` (Postgres `23505`) | Toast "That workout is already logged" |
| Migration 013 missing | `useLogs` strips the health columns and saves the session without stats |
| `localStorage` unavailable | Mock connection defaults to disconnected; dismissals not remembered |

## 9. Testing

- Add **Vitest** (`npm test`) for `src/health/logic.ts` and `mockProvider`:
  - mock data deterministic across calls for the same dates
  - readiness low/good/unknown boundaries
  - activity → type mapping table
  - step tiers at 4999 / 5000 / 8000 / 12000
  - `unlinkedWorkouts` excludes linked and dismissed ids, only today/yesterday, newest first
  - `roundDurationToOptions`
- Manual browser checks (Phase 1): desktop and 375px width, light and dark; disconnected / connected / `?health=expired`; log from card → saved row has `health_source='demo'`; attach and detach in edit; non-admin account sees no Fitbit UI.
- Phase 2: verify requests in Google OAuth Playground first, then connect the real account end to end.

## 10. Out of scope

- Webhooks / background sync
- Writing data back to Google Health
- Google app verification (leaving testing mode)
- Health data for non-admin users before Phase 2 is verified
- Charts of recovery trends over time
