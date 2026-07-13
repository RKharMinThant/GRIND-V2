# GRIND — Habit Tracker

Personal workout & meal habit tracker with **Supabase** (Auth, Postgres, Storage). Client-only React app — no custom backend.

## Features

- Email / password auth (Supabase Auth)
- Daily session logs: workout, type, duration, meal, notes, photo proof
- Progress board: user-managed lifts by muscle group, **per-set** reps/weight (e.g. 15 · 12 · 10 @ 60kg) for progressive overload
- Edit & delete logs
- Streaks, stats, week strip, activity heatmap
- History with search + type filters
- Calendar month view
- Private Storage for photos (compressed client-side)
- Row Level Security — each user only sees their own data

## Setup

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project  
2. Wait for the database to finish provisioning  

### 2. Run the migration

1. Open **SQL Editor** → New query  
2. Paste and run [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql)  
3. Paste and run [`supabase/migrations/002_weekly_goal.sql`](supabase/migrations/002_weekly_goal.sql) (weekly goal + profile settings)  
4. Paste and run [`supabase/migrations/003_focus_areas.sql`](supabase/migrations/003_focus_areas.sql) (multi-select focus on logs)  
5. Paste and run [`supabase/migrations/004_supplements.sql`](supabase/migrations/004_supplements.sql) (protein_g + creatine_g)  
6. Paste and run [`supabase/migrations/006_tracked_lifts.sql`](supabase/migrations/006_tracked_lifts.sql) (Progress lift board)  
7. Paste and run [`supabase/migrations/007_lift_sets_detail.sql`](supabase/migrations/007_lift_sets_detail.sql) (per-set reps/weight)  
8. Paste and run [`supabase/migrations/008_lift_history.sql`](supabase/migrations/008_lift_history.sql) (volume trend history)

This creates `profiles`, `logs`, RLS policies, a signup trigger, the `log-photos` storage bucket, `profiles.weekly_goal`, `logs.focus_areas`, supplement grams, `tracked_lifts`, per-set `sets_detail`, and `lift_history`.

### 3. Auth settings (recommended for local / personal use)

**Authentication → Providers → Email**: enabled  

**Authentication → Providers → Email → Confirm email**: **off** while developing (otherwise sign-up requires inbox confirmation before you can sign in).

### 4. Environment variables

```bash
cp .env.example .env.local
```

From **Project Settings → API**:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | `anon` `public` key |

Never put the **service_role** key in the frontend.

### 5. Install & run

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

### 6. Build for production

```bash
npm run build
npm run preview
```

Deploy the `dist/` folder to Vercel, Netlify, Cloudflare Pages, etc. Add the same env vars in the host dashboard.

## Project structure

```
src/
  components/   UI screens & sheets
  hooks/        useAuth, useLogs, useTrackedLifts
  lib/          supabase client, dates, streaks, photos, overload
  styles/       design tokens + global CSS
  types/        Log, Profile, workout types
supabase/
  migrations/   001_init.sql
```

## Verification checklist

1. Sign up → land on Home (empty state)  
2. Log a session with photo → streak updates, heatmap lights, calendar marks the day  
3. Edit log / replace photo / delete log (photo removed from Storage)  
4. Second account cannot see first account’s logs  
5. Hard refresh keeps the session  

## Stack

- Vite + React + TypeScript  
- `@supabase/supabase-js`  
- `browser-image-compression` for proof photos  

## License

Personal project — use freely.
