# Fitbit Integration — Phase 2 (Google Health API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock provider with real Google Health API data via Supabase Edge Functions, switchable per deploy with `VITE_HEALTH_PROVIDER=google`.

**Architecture:** Four Deno Edge Functions hold the OAuth client secret and tokens (service-role-only tables). `health-data` fetches exercise, sleep, daily resting HR, daily HRV and daily step roll-ups, normalizes them with pure functions (unit-tested in Vitest), and returns the same shapes as Phase 1. `googleProvider` implements `HealthProvider` against those functions; `useHealth` picks it when the env flag is set.

**Tech Stack:** Supabase Edge Functions (Deno, `jsr:@supabase/supabase-js@2`), Google OAuth 2.0, Google Health API v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-fitbit-health-integration-design.md` (§4.3, §7, §8)

## Global Constraints

- Base URL `https://health.googleapis.com/v4/users/me/dataTypes/{type}/dataPoints`.
- Scopes (full URLs): `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`, `…/googlehealth.health_metrics_and_measurements.readonly`, `…/googlehealth.sleep.readonly`. Auth URL params: `access_type=offline`, `prompt=consent`; never `include_granted_scopes`.
- Tokens and OAuth states live only in tables with RLS enabled and **no policies**.
- The client secret and refresh tokens never reach the browser.
- `dailyRollUp` max range 90 days for steps → chunk.
- Response values documented as `string (int64)` and `string (Duration)` (`"3600s"`) must be parsed.
- Deviation from spec §4.3 (recorded): `health_oauth_states` gains `return_to text not null` so OAuth can return to localhost or production; allowed origins come from the `ALLOWED_ORIGINS` secret.
- Unverified against live responses (docs only): filter field names and `users/me`. Keep them in one file (`_shared/googleApi.ts`) so fixes are one-line.
- Default provider stays `demo`; production only switches when `VITE_HEALTH_PROVIDER=google` is set in Vercel.

## Data-type mapping (from the API reference)

| Need | Call | Fields used |
|---|---|---|
| Workouts | `GET exercise/dataPoints?filter=exercise.interval.civil_start_time >= "FROM"` | `name`, `exercise.interval.startTime/endTime`, `exercise.exerciseType`, `exercise.displayName`, `exercise.activeDuration`, `exercise.metricsSummary.caloriesKcal`, `.averageHeartRateBeatsPerMinute`, `.heartRateZoneDurations.{moderateTime,vigorousTime,peakTime}` |
| Sleep | `GET sleep/dataPoints?filter=sleep.interval.civil_end_time >= "DATE-7"` | `sleep.interval.endTime/civilEndTime`, `sleep.summary.minutesAsleep`, `sleep.summary.stagesSummary[] {type, minutes}` |
| Resting HR | `GET daily-resting-heart-rate/dataPoints?filter=dailyRestingHeartRate.date >= "DATE-7"` | `dailyRestingHeartRate.date {year,month,day}`, `.beatsPerMinute` |
| HRV | `GET daily-heart-rate-variability/dataPoints?filter=dailyHeartRateVariability.date >= "DATE-7"` | `.date`, `.rootMeanSquareOfSuccessiveDifferencesMilliseconds` (fallback `.averageHeartRateVariabilityMilliseconds`) |
| Steps | `POST steps/dataPoints:dailyRollUp` body `{ range: { start: CivilDateTime, end: CivilDateTime } }` | `rollupDataPoints[].civilStartTime.date`, `.steps.countSum` |

Zone mapping: `fatBurn = moderateTime`, `cardio = vigorousTime`, `peak = peakTime` (minutes, rounded). `maxHr` is not provided → `null`.
Activity: `displayName` if non-empty, else `exerciseType` humanized (`WEIGHTLIFTING` → `Weightlifting`).

---

### Task 1: Pure normalizers (Vitest)

**Files:**
- Create: `supabase/functions/_shared/types.ts` (copy of the Phase 1 normalized types: `HealthWorkout`, `HealthRecovery`, `DailySteps`, `ZoneMinutes`, `SleepStages`)
- Create: `supabase/functions/_shared/normalize.ts`, `supabase/functions/_shared/normalize.test.ts`

**Interfaces — Produces:**
```ts
export function parseDurationSeconds(v: string | undefined | null): number | null   // "3600s" → 3600, "1.5s" → 1.5
export function toInt(v: string | number | undefined | null): number | null
export function civilDateString(d: { year: number; month: number; day: number } | undefined | null): string | null
export function humanizeEnum(v: string): string                 // "WEIGHTLIFTING" → "Weightlifting", "HIGH_INTENSITY_INTERVAL_TRAINING" → "High intensity interval training"
export function normalizeExercise(dp: GDataPoint): HealthWorkout | null
export function buildRecovery(date: string, sleep: GDataPoint[], rhr: GDataPoint[], hrv: GDataPoint[]): HealthRecovery | null
export function normalizeStepsRollup(points: GRollupPoint[]): DailySteps[]
export type GDataPoint = Record<string, any>; export type GRollupPoint = Record<string, any>
```

Rules:
- `normalizeExercise` returns `null` without `interval.startTime`. `id` = last path segment of `name`. `durationMin` = round(activeDuration s / 60), else round((end − start) / 60000).
- `buildRecovery`: sleep = points whose end date (`civilEndTime.date` or local date of `endTime`) equals `date`, pick max `minutesAsleep`. Stages from `stagesSummary`: DEEP→deep, LIGHT→light, ASLEEP→light, REM→rem, AWAKE→awake, RESTLESS→awake; `null` if no stagesSummary. RHR/HRV for `date`; averages over the 7 dates before `date` that have values (rounded); `null` if none. Return `null` if all of sleep, RHR, HRV missing.
- `normalizeStepsRollup`: date from `civilStartTime.date`; steps = `toInt(steps.countSum) ?? 0`; sorted by date; de-duplicated.

- [ ] Step 1: Write `normalize.test.ts` with fixtures built from the documented schema (exercise with/without displayName and zones; two sleeps on the same end date; RHR/HRV over 8 days with a gap; rollup with string counts) — assert exact outputs.
- [ ] Step 2: `npm test` → FAIL (module missing).
- [ ] Step 3: Implement `normalize.ts` and `types.ts`.
- [ ] Step 4: `npm test` → PASS; `npm run build` still passes (functions are outside `src`, not in tsc app project).
- [ ] Step 5: Commit `feat(health): Google Health response normalizers`.

---

### Task 2: Migration 014

**Files:** Create `supabase/migrations/014_health_connections.sql`; README migration row 14.

SQL = spec §4.3 with `return_to text not null` added to `health_oauth_states`, plus `health_connection_status()` returning `(status text, last_synced_at timestamptz)`.

- [ ] Step 1: Write migration. Step 2: README row. Step 3: Commit `feat(health): migration 014 health connection tables`.

---

### Task 3: Edge Functions

**Files:**
- Create: `supabase/functions/_shared/cors.ts` — `corsHeaders(req): Record<string,string>` (echo `Origin` only if in `ALLOWED_ORIGINS`), `preflight(req): Response | null`, `json(req, body, status?)`.
- Create: `supabase/functions/_shared/clients.ts` — `adminClient()` (service role), `requireUser(req): Promise<{ id: string } | Response>` (verifies bearer JWT with `auth.getUser()`).
- Create: `supabase/functions/_shared/google.ts` — constants (auth URL, token URL, revoke URL, scopes), `exchangeCode(code, redirectUri)`, `refreshAccessToken(refreshToken)` (throws `ExpiredGrantError` on `invalid_grant`), `revokeToken(token)`.
- Create: `supabase/functions/_shared/googleApi.ts` — `listAll(accessToken, type, filter, maxPages = 10)`, `dailyRollUpSteps(accessToken, from, to)` (≤90-day chunks), filter builders.
- Create: `supabase/functions/health-oauth-start/index.ts`, `health-oauth-callback/index.ts`, `health-data/index.ts`, `health-disconnect/index.ts`.
- Create: `supabase/functions/deno.json` (imports map for `@supabase/supabase-js` → `jsr:@supabase/supabase-js@2`).

Behavior (spec §7.2):
- **start** (POST, JWT): body `{ returnTo }` must be an allowed origin; insert `{ state, user_id, return_to }`; respond `{ url }`.
- **callback** (GET, no JWT — deploy with `--no-verify-jwt`): load state (≤10 min), delete it; on `error` param or failure redirect `return_to + '/app?health=error'`; exchange code (`redirect_uri = SUPABASE_URL + '/functions/v1/health-oauth-callback'`); upsert `health_connections` (keep previous refresh token if Google omits it); redirect `return_to + '/app?health=connected'`.
- **data** (POST, JWT): body `{ from, to }` (YYYY-MM-DD, `to − from` ≤ 180 days). Load connection (404 `{error:'not_connected'}`); refresh access token if `access_expires_at` < now + 60s (on `ExpiredGrantError`: set `status='expired'`, 409 `{error:'expired'}`); fetch the five sources in parallel; normalize; update `last_synced_at`; respond `{ workouts, recovery, steps, lastSyncedAt }`. Google errors → 502 `{error:'google', detail}`.
- **disconnect** (POST, JWT): revoke (best effort), delete row, `{ ok: true }`.

- [ ] Step 1: Write shared modules and functions.
- [ ] Step 2: `deno check supabase/functions/*/index.ts` → no type errors.
- [ ] Step 3: Commit `feat(health): Supabase Edge Functions for Google Health OAuth and data`.

---

### Task 4: `googleProvider`, provider switch, OAuth return handling

**Files:**
- Create: `src/health/googleProvider.ts`
- Modify: `src/health/useHealth.ts`, `src/App.tsx`, `src/vite-env.d.ts`, `.env.example`

**Interfaces:**
```ts
export class HealthExpiredError extends Error {}
export function createGoogleProvider(deps?: { now?: () => Date }): HealthProvider
```
- `getConnection` → `supabase.rpc('health_connection_status')`; no row → disconnected.
- `connect` → `functions.invoke('health-oauth-start', { body: { returnTo: location.origin } })` → `location.assign(url)` (never resolves meaningfully).
- `disconnect` → invoke `health-disconnect`.
- Data methods share one in-flight `health-data` request per `to` date: `getWorkouts(from,to)`, `getDailySteps(from,to)`, `getRecovery(to)` all resolve from the same bundle when called together; a 409 rejects with `HealthExpiredError`.
- `markSynced` → no-op (server sets it).
- `useHealth`: provider = `import.meta.env.VITE_HEALTH_PROVIDER === 'google' ? createGoogleProvider() : createMockProvider(...)`; on a sync error, re-read the connection; if it is no longer `connected`, clear the error (profile row shows Reconnect).
- `App.tsx`: on mount, if `?health=connected|error` → toast ("Fitbit connected" / "Couldn't connect Fitbit", error variant) and remove the param with `history.replaceState`.

- [ ] Step 1: Implement. Step 2: `npm test && npm run build && npm run lint`. Step 3: Browser: with the flag unset, Phase 1 mock behavior is unchanged. Step 4: Commit `feat(health): Google Health provider behind VITE_HEALTH_PROVIDER`.

---

### Task 5: Setup docs

**Files:** Modify `README.md` — "Fitbit / Google Health (optional)" section: Google Cloud steps (spec §7.1), Supabase CLI install/link, `supabase db push` or SQL editor for 013/014, `supabase secrets set GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET ALLOWED_ORIGINS`, deploy commands (callback with `--no-verify-jwt`), Vercel `VITE_HEALTH_PROVIDER=google`, 7-day testing-mode note, demo-data cleanup SQL.

- [ ] Step 1: Write docs. Step 2: Commit `docs: Fitbit / Google Health setup`.
