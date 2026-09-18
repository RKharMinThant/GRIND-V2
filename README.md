# GRIND v2

**Personal training journal** — log sessions, stay consistent, and track progressive overload without a custom backend.

GRIND is a client-only web app: **Vite + React + TypeScript** on the frontend, **Supabase** for auth, Postgres, and private photo storage. Your data is scoped per user with Row Level Security (RLS). No Node API, no server you have to operate beyond Supabase + a static host. The optional Fitbit integration adds a few Supabase Edge Functions that talk to the Google Health API.

---

## What it does

| Area | Behavior |
|------|----------|
| **Sessions** | Log workouts with focus areas, duration, meal/notes, protein/creatine, and optional proof photos (compressed in the browser). |
| **Consistency** | Streaks, weekly goal ring, week strip, activity heatmap, history filters, calendar. |
| **Progress** | Self-managed lift board by muscle group. One working weight, **per-set reps** (e.g. `15 · 12 · 10 @ 60kg`). Compare to the last log (↑ weight / reps / volume) and a volume trend over saves. |
| **Fitbit** *(optional)* | Connect a Fitbit (e.g. Fitbit Air) through Google Health: Today strip on Home, **Body** tab (activity, heart, sleep, night vitals), workout-detected prompt that pre-fills the log form, recovery card, steps heatmap. [Setup →](#fitbit--google-health-optional) |
| **Settings** | Tap your name for a full settings screen: profile and goals, appearance, units (km/mi, kg/lb), week start, Fitbit connection, data export (JSON / CSV), account. |
| **Account** | Invite-only email/password sign-up; profile display name, weekly session goal, and daily step goal. |
| **Admin** | Admin panel to create, expire and revoke invite links and list users. |

**Mental model**

- **Home / History / Calendar / Log** — *when* you trained and what the session looked like.  
- **Progress** — *what loads* you are progressing on (not tied to each log entry; you update lifts when you want).  
- **Body** — what your *tracker* saw: steps, heart, sleep and vitals (Fitbit-connected accounts; Calendar then opens from History).

This is v2 of the original habit-tracker idea: redesigned UI (light/dark citrus sport), multi-step log wizard, and a dedicated progressive-overload surface.

---

## Architecture

```
Browser (SPA)
  ├── Supabase Auth   (session, email/password, invite codes)
  ├── Supabase Postgres + RLS  (profiles, logs, tracked_lifts, lift_history, invites)
  ├── Supabase Storage         (log-photos, private)
  └── Supabase Edge Functions  (optional — Fitbit)
        ├── health-oauth-start / health-oauth-callback / health-disconnect
        ├── health-data   (Home: workouts, recovery, steps, today)
        └── health-body   (Body tab sections)
              └── Google Health API v4 (tokens in service-role-only tables)

GitHub Actions
  └── supabase-keepalive  (daily ping so the free Supabase project doesn't pause)
```

- Env vars are `VITE_*` only; the **anon** key is public by design. Never ship `service_role`.
- Photos are resized client-side (`browser-image-compression`) before upload.
- Migrations live in `supabase/migrations/` and are applied manually in the Supabase SQL editor (or via Supabase CLI if you prefer).
- Google client ID/secret and Fitbit refresh tokens stay server-side (Edge Function secrets and RLS-locked tables); the browser never sees them.

---

## Stack

- [Vite](https://vitejs.dev/) + React 19 + TypeScript  
- [@supabase/supabase-js](https://supabase.com/docs/reference/javascript)  
- browser-image-compression  
- [Vitest](https://vitest.dev/) for health logic and Google response parsing  
- Supabase Edge Functions (Deno) + [Google Health API](https://developers.google.com/health) for Fitbit data  
- Hand-built SVG charts (no chart library)  

---

## Local development

### Prerequisites

- Node 20+ (or current LTS)  
- A free [Supabase](https://supabase.com) project  

### 1. Clone and install

```bash
git clone https://github.com/RKharMinThant/GRIND-V2.git
cd GRIND-V2
npm install
```

### 2. Supabase project

1. Create a project at [supabase.com](https://supabase.com).  
2. Wait until the database is ready.  
3. **SQL Editor** → run migrations **in order**:

| # | File | Purpose |
|---|------|---------|
| 1 | [`001_init.sql`](supabase/migrations/001_init.sql) | Profiles, logs, RLS, signup trigger, `log-photos` bucket |
| 2 | [`002_weekly_goal.sql`](supabase/migrations/002_weekly_goal.sql) | Weekly goal on profile |
| 3 | [`003_focus_areas.sql`](supabase/migrations/003_focus_areas.sql) | Multi-select focus on logs |
| 4 | [`004_supplements.sql`](supabase/migrations/004_supplements.sql) | `protein_g`, `creatine_g` |
| 5 | [`005_exercise_sets.sql`](supabase/migrations/005_exercise_sets.sql) | Optional session-linked sets (legacy path) |
| 6 | [`006_tracked_lifts.sql`](supabase/migrations/006_tracked_lifts.sql) | Progress lift board |
| 7 | [`007_lift_sets_detail.sql`](supabase/migrations/007_lift_sets_detail.sql) | Per-set reps/weight JSON |
| 8 | [`008_lift_history.sql`](supabase/migrations/008_lift_history.sql) | Volume trend snapshots |
| 9 | [`009_invites.sql`](supabase/migrations/009_invites.sql) | Invite-only sign-up (`invites`, `redeem_invite`) |
| 10 | [`010_fix_invites_rls.sql`](supabase/migrations/010_fix_invites_rls.sql) | Admin invite policy via JWT email |
| 11 | [`011_invites_created_by_default.sql`](supabase/migrations/011_invites_created_by_default.sql) | `created_by` defaults to `auth.uid()` |
| 12 | [`012_profiles_admin_select.sql`](supabase/migrations/012_profiles_admin_select.sql) | Admin can list profiles |
| 13 | [`013_log_health_fields.sql`](supabase/migrations/013_log_health_fields.sql) | Fitbit workout stats on logs |
| 14 | [`014_health_connections.sql`](supabase/migrations/014_health_connections.sql) | Google Health tokens (Edge Functions only) |
| 15 | [`015_daily_step_goal.sql`](supabase/migrations/015_daily_step_goal.sql) | Daily step goal for the Fitbit steps ring |
| 16 | [`016_preferences.sql`](supabase/migrations/016_preferences.sql) | Units (km/mi, kg/lb) and week start |

Fresh projects: run all of them in order. Existing DBs: only apply migrations you have not run yet.

### 3. Auth (dev-friendly)

**Authentication → Providers → Email**: enabled.

For local work, turn **Confirm email** **off** so sign-up works without inbox confirmation. Turn confirmation on for production if you want verified emails.

### 4. Environment

```bash
cp .env.example .env.local
```

| Variable | Source |
|----------|--------|
| `VITE_SUPABASE_URL` | Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Project Settings → API → `anon` `public` key |
| `VITE_SITE_URL` | Optional — public site origin, e.g. `https://your-domain.com` (no trailing slash) |
| `VITE_HEALTH_PROVIDER` | Optional — `google` for real Fitbit data via Edge Functions; unset = demo data |
| `VITE_DEV_AUTO_LOGIN_EMAIL` / `VITE_DEV_AUTO_LOGIN_PASSWORD` | Optional, **`npm run dev` only** — skip the login screen locally. Stripped from production builds. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `ALLOWED_ORIGINS` | Optional, **no `VITE_` prefix** (never bundled) — uploaded to Supabase with `npm run health:secrets` |

`.env.local` is gitignored (`*.local`). Do not commit secrets. Downloaded Google OAuth credential JSON files are gitignored too.

### 5. Run

```bash
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`).

```bash
npm run build    # typecheck + production bundle → dist/
npm run preview  # serve dist/ locally
npm run lint
npm test         # Vitest (health logic + Google response parsing)
npm run health:secrets  # upload Google secrets from .env.local to Supabase
npm run health:deploy   # deploy the Fitbit Edge Functions
```

---

## URL map

| Path | What you get |
|------|----------------|
| **`/`** | Marketing landing |
| **`/app`** | Product: auth + journal (Home, History, Progress, Calendar or Body) |
| **`/invite/:code`** | Invite link → `/app?invite=:code` with sign-up pre-filled |

Local: open `http://localhost:5173/` for marketing, `http://localhost:5173/app` for the app.

### SEO & share

| Asset | Role |
|-------|------|
| `DocumentMeta` | Route title/description; `/app` is `noindex` |
| `public/robots.txt` | Allow `/`, disallow `/app` |
| `public/sitemap.xml` | Marketing home (set absolute URLs after deploy) |
| `public/og.svg` | Default share image |
| `VITE_SITE_URL` | Optional absolute origin for OG + canonical |

After production DNS is final, update `sitemap.xml` `<loc>` values and the `Sitemap:` line in `robots.txt` to full `https://` URLs.

---

## Deploy

The project is a **static SPA**. Build once, host `dist/`, inject the same two env vars at **build time** (Vite inlines `VITE_*`). SPA fallback is configured for Vercel (`vercel.json`) and Netlify (`public/_redirects`).

### Option A — Vercel (recommended)

1. Import `RKharMinThant/GRIND-V2` in [Vercel](https://vercel.com).  
2. Framework: **Vite** (auto-detected).  
3. Environment variables (Production + Preview if you want):

   - `VITE_SUPABASE_URL`  
   - `VITE_SUPABASE_ANON_KEY`  

4. Deploy. Build command: `npm run build`. Output: `dist`.  
5. Supabase → **Authentication → URL configuration**:

   - Site URL: `https://your-domain.com`  
   - Redirect URLs: `https://your-domain.com/**`, `https://your-domain.com/app/**`, plus localhost for dev  

Redeploy after changing env vars so Vite picks them up.

### Option B — Netlify

1. New site from Git → this repo.  
2. Build: `npm run build`. Publish directory: `dist`.  
3. Site settings → Environment variables: same two `VITE_*` keys.  
4. SPA fallback ships as `public/_redirects` (`/* → /index.html 200`).  
5. Update Supabase Site URL / Redirect URLs to the Netlify domain (include `/app/**`).

### Option C — Cloudflare Pages

1. Connect the repo.  
2. Build command: `npm run build`. Output directory: `dist`.  
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Pages → Settings → Environment variables.  
4. SPA: set a `_redirects` or Pages “Single-page application” fallback as needed.  
5. Point Supabase Auth URLs at the Pages domain.

### After deploy checklist

- [ ] `/` shows marketing; `/app` shows auth or journal  
- [ ] Supabase **Site URL** + **Redirect URLs** include apex and `/app/**` (and localhost for dev)  
- [ ] Sign up / sign in works on the production domain  
- [ ] Create a log with a photo  
- [ ] Progress: add a lift, update weight/reps, open the detail sheet  
- [ ] Second account cannot see the first account’s data  
- [ ] Hard refresh keeps the session  
- [ ] Optional: set `VITE_SITE_URL` and absolute `sitemap.xml` / robots Sitemap URL  
- [ ] Optional (Fitbit): `VITE_HEALTH_PROVIDER=google` set in the host, **every** serving origin (custom domain included) in `ALLOWED_ORIGINS`, Connect Fitbit works on the production domain  

### Keep the Supabase project awake

Free Supabase projects pause after 7 days without activity. [`.github/workflows/supabase-keepalive.yml`](.github/workflows/supabase-keepalive.yml) queries the database daily (03:17 UTC) and re-enables itself so GitHub's 60-day inactivity rule never turns it off.

Add two repository secrets (**Settings → Secrets and variables → Actions**): `SUPABASE_URL` and `SUPABASE_ANON_KEY` (same values as the `VITE_*` ones). Run it once from the **Actions** tab to confirm. A failed run emails you; if the project already paused, restore it in the Supabase dashboard.

### Lighthouse (marketing `/`)

After deploy, run Lighthouse on the marketing URL:

- Prefer **lazy `/app`** (already split) so first paint stays light  
- Confirm contrast on CTAs (citrus on light is intentional; ink text on solid lime)  
- Reduced-motion: section reveals should not force transforms

---

## Fitbit / Google Health (optional)

Admin-only for now (`isAdmin` in `useAuth`). Adds a Fitbit row to the profile menu. Once connected:

- **Home:** a **Today** strip (steps ring against your daily step goal, zone minutes, distance, calories, sleep), a **workout detected** card, a **recovery** card, and a **Sessions | Steps** heatmap switch.
- **Body tab** (takes Calendar's dock slot; Calendar opens from History): **Activity** (7/30-day steps vs goal, active minutes), **Heart** (resting HR and HRV trends, today's heart-rate curve, zone time), **Sleep** (14 nights, stage timeline), **Night vitals** (SpO2, breathing rate, skin temperature, weight).
- **Sessions** can carry tracker stats (calories, heart rate, zones).
- **Profile:** daily step goal (migration 015), plus units and week start (migration 016) in Settings.

Two data sources, chosen at build time:

| `VITE_HEALTH_PROVIDER` | Data |
|---|---|
| unset (default) | **Demo** — seeded fake data, no backend needed. Saved stats are tagged `health_source = 'demo'`. |
| `google` | **Real** — Google Health API through Supabase Edge Functions |

Design: [`docs/superpowers/specs/2026-09-17-fitbit-health-integration-design.md`](docs/superpowers/specs/2026-09-17-fitbit-health-integration-design.md)

### Demo mode

1. Run migrations **013** (tracker stats on sessions) and **015** (daily step goal). Without them the app still works, minus those fields.
2. Profile menu → **Connect Fitbit**. Preview the expired state with `/app?health=expired`.

Remove demo stats later (sessions are kept):

```sql
update public.logs
   set health_source = null, health_workout_id = null, calories_kcal = null,
       avg_hr = null, max_hr = null, hr_zone_minutes = null
 where health_source = 'demo';
```

### Real data (Google Health API)

**1. Google Cloud**

1. Create or pick a project at [console.cloud.google.com](https://console.cloud.google.com) and enable **Google Health API**.
2. **Google Auth Platform → Audience**: External, keep *Testing*, add your Google account under **Test users**.
3. **Data Access**: add the scopes `googlehealth.activity_and_fitness.readonly`, `googlehealth.health_metrics_and_measurements.readonly`, `googlehealth.sleep.readonly`.
4. **Clients → Create client → Web application**. Authorized redirect URI:
   `https://<project-ref>.supabase.co/functions/v1/health-oauth-callback`
5. Copy the client ID and secret.

> In *Testing*, Google refresh tokens expire after **7 days** — the app shows **Reconnect** when that happens. Publishing past Testing requires Google's review of these restricted scopes.

**2. Supabase**

Run migrations **013**, **014** and **015** (SQL editor), then with the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started):

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npm run health:secrets  # uploads GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ALLOWED_ORIGINS from .env.local (no VITE_ prefix)
npm run health:deploy   # deploys all five functions; the callback with --no-verify-jwt
```

`ALLOWED_ORIGINS` controls CORS and where the OAuth flow may return to. List **every origin the app is served from** — custom domain first, then the host's default domain and `http://localhost:5173`:

```
ALLOWED_ORIGINS=https://grind.example.com,https://your-app.vercel.app,http://localhost:5173
```

Entries are read as origins (scheme + host + port), so a stray path, space or trailing slash is ignored. If an origin is missing, the browser blocks every Fitbit call and the app shows "Couldn't reach Fitbit" while the connection itself is fine. Re-run `npm run health:secrets` and `npm run health:deploy` after changing it.

**3. App**

Set `VITE_HEALTH_PROVIDER=google` in `.env.local` and/or Vercel (then redeploy), open the profile menu → **Connect Fitbit**, and approve on Google's screen. You return to `/app?health=connected`.

**Troubleshooting**: `health-data` returns `502 {error:'google', detail}` with Google's message. Filter field names live in `supabase/functions/_shared/googleApi.ts` (`FILTERS`) and response parsing in `_shared/normalize.ts` (unit-tested: `npm test`).

---

## Notifications (optional)

Web Push to the installed app — no App Store, no Apple developer account. Five opt-in
types, each toggled per user in **Settings → Notifications**:

| Type | When it fires (user's local time) | Needs Fitbit |
|---|---|---|
| `fitbit_expired` | Connection dropped · 08:00–21:00, at most every 3 days | connection status only |
| `streak_risk` | Live streak of 2+ days with nothing logged today · 18:00–21:00 | no |
| `inactivity` | 3+ days since the last session · 09:00–11:00, at most every 3 days | no |
| `step_goal` | Between 60% and 99% of the daily step goal · 18:00–20:00 | yes |
| `recovery_milestone` | Best sleep in 30 days, or resting HR 2+ bpm below its 30-day average · 08:00–10:00, at most weekly | yes |

**iPhone requires the app to be on the Home Screen.** Safari tabs cannot receive push.
Settings shows an explanation instead of the toggles until that is done.

### Setup

**1. Keys** — generate a VAPID pair once and put it in `.env.local`:

```
VITE_VAPID_PUBLIC_KEY=<public>   # public by design; safe in the browser bundle
VAPID_PUBLIC_KEY=<public>
VAPID_PRIVATE_KEY=<private>      # server only — never prefixed with VITE_
VAPID_SUBJECT=mailto:you@example.com
PUSH_CRON_SECRET=<32 random bytes, base64url>
```

**2. Database + functions**

```bash
npm run health:secrets   # uploads VAPID_*, PUSH_CRON_SECRET (and the Google keys)
npm run push:deploy      # push-subscribe, push-unsubscribe, push-test, push-dispatch
```

Apply `supabase/migrations/017_push_notifications.sql`. Set `VITE_VAPID_PUBLIC_KEY` in
Vercel too, or the UI stays hidden in production.

**3. Scheduler** — add two repo secrets (Settings → Secrets and variables → Actions):
`SUPABASE_URL` (already there for keep-alive) and `PUSH_CRON_SECRET`, matching the
Supabase secret exactly. `.github/workflows/push-notifications.yml` then runs hourly.

### How it works

`push-dispatch` is the only scheduled piece. It loads every subscription, works out each
user's local day and hour from the time zone their browser reported at subscribe time,
and asks `_shared/notifyRules.ts` what is due. That module is pure — no clock, no
database — so every rule is unit-tested (`npm test`).

A Fitbit read only happens for users whose local hour has actually opened a Fitbit rule's
window, so it costs at most one Google call per user per day rather than one per run.

Before sending, the dispatcher inserts into `notification_sends`, whose primary key is
`(user_id, type, local_day)`. A duplicate insert fails, so an overlapping or retried run
is a no-op instead of a second buzz. If nothing was delivered the row is released so a
later run can retry.

### Troubleshooting

- **Nothing arrives** — tap **Send a test** in Settings. That isolates delivery from the
  rules. `push-test` returns `404 not_subscribed` if this device was never registered.
- **Toggles but no button** — the device is registered; permission lives on the device,
  the toggles on the account.
- **Stopped after reinstalling** — deleting the Home Screen app discards its subscription.
  Enable it again; the old row is pruned on its next failed send.
- **Workflow is green but nothing sends** — the response prints `{users, evaluated, sent}`.
  `evaluated: 0` means no rule's hour window was open, which is normal for most runs.

---

## Project layout

```
src/
  main.tsx             # React Router: / marketing, /app product
  App.tsx              # Journal shell (under /app)
  marketing/           # Landing (Phase 0 placeholder → full page)
  components/          # Screens + sheets
    body/              # Body tab sections (Activity, Heart, Sleep, Night vitals)
    charts/            # SVG charts: Ring, StepBars, Sparkline, DayCurve, Hypnogram, StackedBar
  hooks/               # useAuth, useLogs, useTrackedLifts, usePush, …
  lib/                 # supabase, dates, streaks, photos, overload, push
  health/              # Fitbit: types, logic, mock + Google providers, useHealth, useBodySection
  styles/global.css
  types/database.ts
supabase/migrations/
supabase/functions/    # Edge Functions: health-*, push-* (+ _shared)
scripts/               # push-secrets.mjs (Edge Function secrets)
docs/superpowers/      # Design specs and implementation plans
.github/workflows/     # supabase-keepalive, push-notifications
vercel.json            # SPA rewrites
public/_redirects      # Netlify SPA fallback
```

---

## Security notes

- All tables use **RLS** so `auth.uid()` owns the row.  
- Storage bucket policies restrict photos to the authenticated owner.  
- Frontend only uses the **anon** key; RLS is the real authorization boundary.  
- Do not expose `service_role` in this repo or any static host config.
- `health_connections` and `health_oauth_states` have RLS **with no policies**: only Edge Functions (service role) can read tokens. The browser gets non-secret status through `health_connection_status()`.
- Fitbit Edge Functions verify the caller's Supabase JWT (except the OAuth callback, which validates a one-time `state`) and only answer CORS for `ALLOWED_ORIGINS`.
- `push_subscriptions` and `notification_sends` have RLS **with no policies** — only Edge Functions touch them. Notification toggles live on `profiles`, which the user owns.
- `push-dispatch` runs without a user JWT (the scheduler has none), so it is gated on the `PUSH_CRON_SECRET` header instead. Rotate it in both places at once.
- Stored push endpoints must be public HTTPS URLs (`_shared/pushEndpoint.ts`): without that check a stolen login could point the sender at an internal address.

---

## Version

Tagged release: **[v2](https://github.com/RKharMinThant/GRIND-V2/releases/tag/v2)**

---

## License

Personal project — use and fork freely. No warranty.
