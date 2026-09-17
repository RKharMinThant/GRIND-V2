# Fitbit Body tab and Today strip — Design

**Date:** 2026-09-17
**Status:** Approved design, pending spec review
**Builds on:** `2026-09-17-fitbit-health-integration-design.md` (provider architecture, Edge Functions, gating)

---

## 1. Goal

Feature much more of the Fitbit Air's data in GRIND, beautifully:

1. Steps become a first-class number (Home ring + Body charts), with an editable daily goal.
2. A new **Body** tab shows Activity, Heart, Sleep and Night vitals.
3. Home gains a compact **Today** strip.

## 2. Decisions

| Topic | Decision |
|---|---|
| Placement | New Body tab + Home Today strip |
| Dock | Body replaces Calendar (for health-enabled accounts); Calendar opens from a button in History |
| Body sections | Activity, Heart, Sleep, Night vitals |
| Step goal | Editable in profile, default 10,000, stored on `profiles` (migration 015) |
| Loading | Per-section `health-body` calls when Body opens; Home stays on `health-data` (+ small `today`) |
| Charts | Hand-built SVG components, no chart library |

## 3. Data availability (verified on the user's account, 2026-09-17)

| Available | Not available |
|---|---|
| Daily roll-ups: steps, distance, active-zone-minutes, active-minutes, total-calories, floors (some days), heart-rate (min/avg/max), time-in-heart-rate-zone | vo2-max / daily-vo2-max (0 points) |
| Lists: exercise, sleep (stages), daily-resting-heart-rate, daily-heart-rate-variability, heart-rate samples, daily-oxygen-saturation, daily-respiratory-rate, respiratory-rate-sleep-summary, daily-sleep-temperature-derivations, weight (2 entries) | body-fat, altitude (0 points); body-temperature (invalid type id); daily-heart-rate-zones roll-up (400); hydration-log (scope not granted) |

### Live response shapes used by this design

```
dailyRollUp  rollupDataPoints[]: { civilStartTime: { date }, civilEndTime, <value> }
  steps                 steps.countSum                          "int64 string"
  distance              distance.millimetersSum                 "int64 string"
  active-zone-minutes   activeZoneMinutes.{sumInFatBurnHeartZone,sumInCardioHeartZone,sumInPeakHeartZone}  strings
  active-minutes        activeMinutes.activeMinutesRollupByActivityLevel[] { activityLevel: LIGHT|MODERATE|VIGOROUS, activeMinutesSum }
  total-calories        totalCalories.kcalSum                   number
  floors                floors.countSum                         string
  heart-rate            heartRate.{beatsPerMinuteMin,beatsPerMinuteAvg,beatsPerMinuteMax}  numbers
  time-in-heart-rate-zone  timeInHeartRateZone.timeInHeartRateZones[] { heartRateZone, duration "Ns" }
list
  heart-rate            heartRate.{ sampleTime.{physicalTime,utcOffset,civilTime}, beatsPerMinute }
  sleep                 sleep.{ interval.{startTime,endTime,endUtcOffset}, metadata.mainSleep, stages[] {type,startTime,endTime}, summary.{minutesAsleep,minutesAwake,minutesToFallAsleep,stagesSummary[]} }
  daily-oxygen-saturation      dailyOxygenSaturation.{ date, averagePercentage, lowerBoundPercentage, upperBoundPercentage }
  daily-respiratory-rate       dailyRespiratoryRate.{ date, breathsPerMinute }
  daily-sleep-temperature-derivations  dailySleepTemperatureDerivations.{ date, nightlyTemperatureCelsius, baselineTemperatureCelsius }
  weight                weight.{ sampleTime.civilTime, weightGrams }
```

Filter prefixes for list calls use snake_case of the data type (`daily_oxygen_saturation.date >= "…"`, verified pattern). Sample-type filters (`heart_rate.sample_time.civil_time`, `weight.sample_time.civil_time`) follow the documented pattern but are **unverified** — confirm live in build step 1 alongside the heart-rate `rollUp`. Roll-up maximum ranges: heart-rate, active-minutes, total-calories = 14 days; others 90 days.

## 4. Normalized types (`src/health/types.ts`, mirrored in `supabase/functions/_shared/types.ts`)

```ts
type TodaySummary = {
  date: string
  steps: number | null
  distanceKm: number | null
  zoneMinutes: number | null          // sumInFatBurn + sumInCardio + sumInPeak as returned (values are already active zone minutes; no extra weighting)
  calories: number | null
}

type DailyActivity = {
  date: string
  steps: number | null
  distanceKm: number | null
  azm: { fatBurn: number; cardio: number; peak: number } | null
  activeMin: { light: number; moderate: number; vigorous: number } | null
  calories: number | null
  floors: number | null
}

type HeartSection = {
  restingHr: { date: string; bpm: number }[]         // 30 days
  hrv: { date: string; ms: number }[]                // 30 days
  daily: { date: string; min: number; avg: number; max: number }[]   // 14 days
  zonesToday: { light: number; moderate: number; vigorous: number; peak: number } | null  // minutes
  curveToday: { minute: number; bpm: number }[]      // minute-of-day, 5-min buckets
}

type SleepNight = {
  date: string                   // local date the sleep ended
  start: string
  end: string
  asleepMin: number | null
  awakeMin: number | null
  toFallAsleepMin: number | null
  stages: SleepStages | null
  segments: { stage: 'awake' | 'light' | 'deep' | 'rem'; startMin: number; endMin: number }[]  // minutes from start
}
type SleepSection = { nights: SleepNight[] }         // up to 14, oldest → newest

type VitalsSection = {
  spo2: { date: string; avg: number; low: number | null; high: number | null }[]
  breathing: { date: string; bpm: number }[]
  skinTemp: { date: string; deltaC: number }[]      // nightly − baseline
  weight: { date: string; kg: number }[]
}

type BodySectionId = 'activity' | 'heart' | 'sleep' | 'vitals'
type BodySectionData = { activity: DailyActivity[]; heart: HeartSection; sleep: SleepSection; vitals: VitalsSection }
```

Rules: every numeric field that is absent in the response becomes `null` (or the entry is omitted from arrays); arrays are sorted by date ascending; `ASLEEP` maps to light, `RESTLESS` to awake.

## 5. Backend

### 5.1 `health-data` (existing) — adds `today`

Response gains `today: TodaySummary`, from single-day `dailyRollUp` calls for `to` on steps, distance, active-zone-minutes and total-calories, run in parallel with the existing calls.

### 5.2 `health-body` (new Edge Function)

`POST { section: BodySectionId, date: 'YYYY-MM-DD' }` (user JWT) → `BodySectionData[section]`.

| Section | Calls |
|---|---|
| activity | dailyRollUp over `date−29 … date`: steps, distance, active-zone-minutes, floors (90-day limit); active-minutes, total-calories in two ≤14-day chunks |
| heart | list daily-resting-heart-rate and daily-heart-rate-variability from `date−29`; dailyRollUp heart-rate over `date−13 … date`; dailyRollUp time-in-heart-rate-zone for `date`; today's curve via `rollUp` heart-rate with 5-minute windows (fallback: list heart-rate for `date`, ≤10 pages, bucketed server-side) |
| sleep | list sleep with `sleep.interval.civil_end_time >= date−13`, main sleep per night |
| vitals | list daily-oxygen-saturation, daily-respiratory-rate, daily-sleep-temperature-derivations from `date−29`; list weight from `date−89` |

Shared with `health-data`: auth, token refresh, 404 `not_connected`, 409 `expired`, 502 `{ error: 'google', source, detail }`. Refresh logic moves into `_shared/connection.ts` so both functions use one implementation.

### 5.3 Migration 015

```sql
alter table public.profiles
  add column if not exists daily_step_goal integer not null default 10000
  check (daily_step_goal between 1000 and 100000);
```

## 6. Client

### 6.1 Provider and hook

- `HealthProvider` gains `getToday(date)` and `getBodySection<S>(section: S, date): Promise<BodySectionData[S]>`.
- `googleProvider`: `getToday` reads `today` from the shared `health-data` bundle; `getBodySection` invokes `health-body`.
- `mockProvider`: seeded generators for every section (deterministic per date).
- `useHealth` exposes `today: TodaySummary | null`.
- New hook `useBodySection(health, section)` → `{ data, loading, error, retry }` with an in-memory cache keyed by `${section}:${date}`; `health.sync()` clears the cache.

### 6.2 Navigation

- `Tab` gains `'body'`. When `health.enabled`, dock slot 5 = Body (icon: pulse line); otherwise Calendar stays.
- History header gains a calendar icon button → `CalendarSheet` (overlay reusing `CalendarView`, same `onOpenLog` / `onCreateForDate`).
- `AnimatedPage` tab index includes `body`.

### 6.3 Components

| Component | Content |
|---|---|
| `TodayStrip` (Home, below hero) | Steps ring (steps / goal, animated), tiles: zone minutes, distance, calories, sleep (from recovery). Tap → Body tab. Shown only when connected. |
| `BodyView` | Page header "Body" + synced time; renders the four sections; not connected → Connect card; expired → Reconnect card |
| `ActivitySection` | `StepBars` (7d/30d segment, dashed goal line, goal-hit bars solid), today's `StackedBar` of active minutes, floors when > 0 |
| `HeartSection` | Resting HR and HRV tiles with `Sparkline` + delta vs 30-day mean; `DayCurve` for today; zone split `StackedBar` |
| `SleepSection` | 14-night bar strip (tap selects night); `Hypnogram` of selected night; bedtime → wake, fall-asleep, awake minutes, stage split |
| `VitalsSection` | Tiles: SpO2 (avg + range), breathing rate, skin temp delta; tap tile expands `Sparkline`; weight tile only if entries |
| Charts (`src/components/charts/`) | `StepBars`, `Sparkline`, `DayCurve`, `Hypnogram`, `StackedBar`, `Ring` — pure SVG, props in, tap-to-inspect value label, CSS tokens for color, `prefers-reduced-motion` disables animation |

Profile menu: "Daily step goal" number input (1,000–100,000, step 500) saved with the existing Save profile button.

### 6.4 Pure logic (`src/health/bodyLogic.ts`, tested)

- `stepGoalProgress(steps, goal)` → 0..1 clamped
- `lastNDays(series, n, endDate)` → fills missing dates with `null`
- `bucketHeartRate(samples, minutes = 5)` → `{ minute, bpm }[]` (server-side copy in `_shared`)
- `meanDelta(series)` → latest − mean of previous values, rounded
- `sleepSegments(night)` → segment minutes relative to start

## 7. Loading, caching, errors

- Opening Body requests all four sections in parallel; each renders independently with a skeleton.
- Cache per session keyed by section and date; Sync now clears it.
- Section error → inline "Couldn't load {section} · Retry"; other sections unaffected.
- 409 → connection becomes expired → Reconnect card (existing handling).
- Missing metrics hide their tile; empty section collapses.
- Migration 015 missing → goal defaults to 10,000; saving shows the existing migration hint.

## 8. Testing

- Vitest normalizers for every §3 shape using fixtures from the live response shapes.
- Vitest for §6.4 logic and mock section generators (deterministic, in range).
- Live verification of the heart-rate `rollUp` call before building `DayCurve` on it.
- Browser: demo + real; 375px and desktop; light and dark; one section failing; expired; non-health account keeps Calendar in dock; History calendar button.

## 9. Build order

1. Backend: `_shared/connection.ts`, normalizers, `health-body`, `today` in `health-data`, migration 015
2. Client data: types, providers, `useBodySection`, `today`
3. Home `TodayStrip` + History calendar button + dock change + step goal in profile
4. Body sections: Activity → Sleep → Heart → Vitals
5. Deploy functions; preview branch

## 10. Out of scope

- VO2 max, body fat (no data on this device)
- Hydration (scope not granted)
- Background sync / storing health data in Supabase
- Writing data back to Google Health
