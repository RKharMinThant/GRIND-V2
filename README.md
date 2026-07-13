# GRIND v2

**Personal training journal** — log sessions, stay consistent, and track progressive overload without a custom backend.

GRIND is a client-only web app: **Vite + React + TypeScript** on the frontend, **Supabase** for auth, Postgres, and private photo storage. Your data is scoped per user with Row Level Security (RLS). No Node API, no server you have to operate beyond Supabase + a static host.

---

## What it does

| Area | Behavior |
|------|----------|
| **Sessions** | Log workouts with focus areas, duration, meal/notes, protein/creatine, and optional proof photos (compressed in the browser). |
| **Consistency** | Streaks, weekly goal ring, week strip, activity heatmap, history filters, calendar. |
| **Progress** | Self-managed lift board by muscle group. One working weight, **per-set reps** (e.g. `15 · 12 · 10 @ 60kg`). Compare to the last log (↑ weight / reps / volume) and a volume trend over saves. |
| **Account** | Email/password auth; profile display name and weekly session goal. |

**Mental model**

- **Home / History / Calendar / Log** — *when* you trained and what the session looked like.  
- **Progress** — *what loads* you are progressing on (not tied to each log entry; you update lifts when you want).

This is v2 of the original habit-tracker idea: redesigned UI (light/dark citrus sport), multi-step log wizard, and a dedicated progressive-overload surface.

---

## Architecture

```
Browser (SPA)
  ├── Supabase Auth   (session, email/password)
  ├── Supabase Postgres + RLS  (profiles, logs, tracked_lifts, lift_history)
  └── Supabase Storage         (log-photos, private)
```

- Env vars are `VITE_*` only; the **anon** key is public by design. Never ship `service_role`.
- Photos are resized client-side (`browser-image-compression`) before upload.
- Migrations live in `supabase/migrations/` and are applied manually in the Supabase SQL editor (or via Supabase CLI if you prefer).

---

## Stack

- [Vite](https://vitejs.dev/) + React 19 + TypeScript  
- [@supabase/supabase-js](https://supabase.com/docs/reference/javascript)  
- browser-image-compression  

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

Fresh projects: run all eight. Existing DBs: only apply migrations you have not run yet.

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

`.env.local` is gitignored (`*.local`). Do not commit secrets.

### 5. Run

```bash
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`).

```bash
npm run build    # typecheck + production bundle → dist/
npm run preview  # serve dist/ locally
npm run lint
```

---

## Deploy

The app is a **static SPA**. Build once, host `dist/`, inject the same two env vars at **build time** (Vite inlines `VITE_*`).

### Option A — Vercel (recommended)

1. Import `RKharMinThant/GRIND-V2` in [Vercel](https://vercel.com).  
2. Framework: **Vite** (auto-detected).  
3. Environment variables (Production + Preview if you want):

   - `VITE_SUPABASE_URL`  
   - `VITE_SUPABASE_ANON_KEY`  

4. Deploy. Build command: `npm run build`. Output: `dist`.  
5. Supabase → **Authentication → URL configuration**:

   - Site URL: `https://your-app.vercel.app`  
   - Redirect URLs: `https://your-app.vercel.app/**`  

Redeploy after changing env vars so Vite picks them up.

### Option B — Netlify

1. New site from Git → this repo.  
2. Build: `npm run build`. Publish directory: `dist`.  
3. Site settings → Environment variables: same two `VITE_*` keys.  
4. Optional `public/_redirects` for SPA fallback if deep links 404:

   ```
   /*    /index.html   200
   ```

   (Vite SPA: add this file under `public/` if you use client-side routes later.)

5. Update Supabase Site URL / Redirect URLs to the Netlify domain.

### Option C — Cloudflare Pages

1. Connect the repo.  
2. Build command: `npm run build`. Output directory: `dist`.  
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Pages → Settings → Environment variables.  
4. SPA: set a `_redirects` or Pages “Single-page application” fallback as needed.  
5. Point Supabase Auth URLs at the Pages domain.

### After deploy checklist

- [ ] Sign up / sign in works on the production domain  
- [ ] Create a log with a photo  
- [ ] Progress: add a lift, update weight/reps, open the detail sheet  
- [ ] Second account cannot see the first account’s data  
- [ ] Hard refresh keeps the session  

---

## Project layout

```
src/
  App.tsx              # Shell, tabs, root-level sheets
  components/          # Screens + sheets (log wizard, lifts, progress)
  hooks/               # useAuth, useLogs, useTrackedLifts, useTheme, …
  lib/                 # supabase client, dates, streaks, photos, overload
  styles/global.css    # design tokens + layout
  types/database.ts    # shared domain types
supabase/migrations/   # ordered SQL (schema + RLS + storage)
```

---

## Security notes

- All tables use **RLS** so `auth.uid()` owns the row.  
- Storage bucket policies restrict photos to the authenticated owner.  
- Frontend only uses the **anon** key; RLS is the real authorization boundary.  
- Do not expose `service_role` in this repo or any static host config.

---

## Version

Tagged release: **[v2](https://github.com/RKharMinThant/GRIND-V2/releases/tag/v2)**

---

## License

Personal project — use and fork freely. No warranty.
