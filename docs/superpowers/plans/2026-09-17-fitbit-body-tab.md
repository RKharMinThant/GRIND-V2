# Fitbit Body Tab + Today Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Body tab (Activity, Heart, Sleep, Night vitals), the Home Today strip, the History calendar button, and an editable daily step goal, on real Google Health data and demo data.

**Architecture:** New `health-body` Edge Function returns one normalized section per call; `health-data` adds `today`. Pure normalizers (server) and body logic (client) are Vitest-tested. Client `HealthProvider` gains `getToday` / `getBodySection`; `useBodySection` caches per session. Charts are small SVG components.

**Tech Stack:** React 19, TypeScript, Supabase Edge Functions (Deno), Google Health API v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-fitbit-body-tab-design.md`

## Global Constraints

- Live-verified (2026-09-17): heart-rate `rollUp` with `{ range: { startTime, endTime }, windowSize: "300s" }`; filters `heart_rate.sample_time.civil_time`, `weight.sample_time.civil_time >= "YYYY-MM-DD"`, `daily_oxygen_saturation.date`, `daily_respiratory_rate.date`, `daily_sleep_temperature_derivations.date`; roll-ups for active-minutes / heart-rate over 14 days; time-in-heart-rate-zone zones `LIGHT|MODERATE|VIGOROUS|PEAK`.
- List and roll-up responses are **newest first** → normalizers sort ascending.
- "Today" is the client's local day: client sends `tzOffsetMin` (`-new Date().getTimezoneOffset()`); server computes local midnight in UTC.
- Roll-up max ranges: heart-rate, active-minutes, total-calories, calories-in-heart-rate-zone 14 days; others 90.
- Every absent metric → `null` / omitted; UI hides tiles with no data.
- Colors from theme tokens (`--accent`, `--ice`, `--danger`, `--muted`, `--surface-*`); works in light and dark; `prefers-reduced-motion` disables chart animation.
- Dock shows Body only when `health.enabled`; otherwise Calendar stays.
- `npm test`, `npm run build`, `npx oxlint` clean after each task; `deno check --node-modules-dir=none` for functions.

---

### Task 1: Server normalizers for body data (TDD)

**Files:** Modify `supabase/functions/_shared/types.ts`; Create `supabase/functions/_shared/bodyNormalize.ts`, `bodyNormalize.test.ts`

Produces (types exactly as spec §4, plus):
```ts
normalizeToday(date, { steps, distance, azm, calories }: Record<string, GRollupPoint[]>): TodaySummary
normalizeActivity(rollups: { steps; distance; azm; activeMinutes; calories; floors }: Record<string, GRollupPoint[]>): DailyActivity[]
normalizeHeart(input: { rhr: GDataPoint[]; hrv: GDataPoint[]; daily: GRollupPoint[]; zones: GRollupPoint[]; curve: GRollupPoint[]; dayStartIso: string }): HeartSection
normalizeSleepNights(points: GDataPoint[]): SleepNight[]      // main sleep per end date, max 14, ascending
normalizeVitals(input: { spo2; breathing; temp; weight }: Record<string, GDataPoint[]>): VitalsSection
```
Rules: date from `civilStartTime.date` (roll-ups) or `<type>.date` (daily lists) or `sampleTime.civilTime.date` (weight). distance mm → km (1 decimal). calories rounded. zonesToday minutes = duration s / 60 rounded. curve: `minute` = minutes from `dayStartIso` to bucket `startTime`, `bpm` = rounded avg. HRV prefers deep-sleep RMSSD (existing rule). Sleep segments: stage minutes from session start, `ASLEEP→light`, `RESTLESS→awake`, other types skipped.

- [ ] Tests with fixtures copied from the live shapes (spec §3) including newest-first ordering and missing fields → FAIL → implement → PASS. Commit `feat(health): body data normalizers`.

### Task 2: Shared connection + API helpers, `health-body`, `today` in `health-data`

**Files:** Create `_shared/connection.ts` (`getAccessToken(req, db, userId): Promise<string | Response>` — moves refresh/expired logic out of `health-data`); Modify `_shared/googleApi.ts` (`dailyRollUpRange(token, type, from, to, maxDays)`, `rollUpWindow(token, type, startIso, endIso, windowSize)`, generic `listAll` unchanged, `FILTERS` additions); Create `health-body/index.ts`; Modify `health-data/index.ts` (use connection helper; add `today` from single-day civil roll-ups for `to`).

`health-body` body: `{ section, date, tzOffsetMin }`; validates section and date; returns section JSON. Heart `dayStartIso` = `Date.parse(date + 'T00:00:00Z') - tzOffsetMin*60000`.

- [ ] Implement; `deno check`; deploy `health-data` and `health-body`; live-call each section from the app page and confirm 200 + non-empty. Commit `feat(health): health-body function and today summary`.

### Task 3: Migration 015 + step goal in profile

**Files:** Create `supabase/migrations/015_daily_step_goal.sql`; Modify `src/types/database.ts` (`Profile.daily_step_goal?: number | null`), `src/hooks/useAuth.ts` (`dailyStepGoal`, `updateProfile` accepts `daily_step_goal`), `src/components/Shell.tsx` (input 1,000–100,000 step 500), `src/App.tsx` wiring, README migrations row.

- [ ] Implement; build. Commit `feat(health): editable daily step goal (migration 015)`.

### Task 4: Client types, body logic, mock sections, providers, hooks (TDD)

**Files:** Modify `src/health/types.ts`, `provider.ts`, `mockProvider.ts`, `googleProvider.ts`, `useHealth.ts`; Create `src/health/bodyLogic.ts`, `bodyLogic.test.ts`, `src/health/useBodySection.ts`; extend `mockProvider.test.ts`.

```ts
// bodyLogic.ts
stepGoalProgress(steps: number | null, goal: number): number               // 0..1
lastNDays<T extends { date: string }>(series: T[], n: number, endDate: string): (T | null)[]  // oldest → newest
meanDelta(values: number[]): number | null                                 // last − mean(previous), rounded; null if < 2
formatKm(km: number | null): string                                        // "5.3 km" / "—"
formatClock(iso: string): string                                           // local "11:52 pm"
// provider.ts additions
getToday(date: string): Promise<TodaySummary | null>
getBodySection<S extends BodySectionId>(section: S, date: string): Promise<BodySectionData[S]>
// useHealth: today: TodaySummary | null ; bodyCacheKey: number (increments on sync)
// useBodySection(health: HealthState, section: S): { data: BodySectionData[S] | null; loading: boolean; error: string | null; retry(): void }
```
Mock: seeded per date, consistent with existing mock steps/recovery values for the same date.

- [ ] Tests → FAIL → implement → PASS; build. Commit `feat(health): client body data layer`.

### Task 5: Chart components

**Files:** Create `src/components/charts/{Ring,StepBars,Sparkline,DayCurve,Hypnogram,StackedBar}.tsx`; CSS in `global.css`.

- `Ring({ value, max, size, label, sublabel })`
- `StepBars({ days: (DailyActivity | null)[], goal, onSelect? })` — dashed goal line, goal-hit bars full accent, others accent-dim; tap shows value
- `Sparkline({ values: (number | null)[], tone: 'accent' | 'ice' | 'danger' })`
- `DayCurve({ points: { minute, bpm }[], nowMinute })` — area line 0–1440
- `Hypnogram({ night: SleepNight })` — 4 lanes (awake, REM, light, deep)
- `StackedBar({ parts: { label, value, tone }[] })` with legend

- [ ] Implement; build + lint. Commit `feat(health): SVG chart components`.

### Task 6: Today strip, Body tab navigation, History calendar sheet

**Files:** Create `src/components/TodayStrip.tsx`, `src/components/CalendarSheet.tsx`, `src/components/BodyView.tsx` (shell with state cards); Modify `Shell.tsx` (`Tab` adds `'body'`, dock slot 5 conditional, `IconBody`), `App.tsx`, `Dashboard.tsx`, `LogsList.tsx` (calendar button prop), `AnimatedPage` index.

- [ ] Implement; browser check dock swap, calendar sheet opens and day tap works, Today strip renders. Commit `feat(health): Today strip, Body tab and History calendar button`.

### Task 7: Body sections

**Files:** Create `src/components/body/{ActivitySection,HeartSection,SleepSection,VitalsSection,SectionFrame}.tsx`; Modify `BodyView.tsx`, `global.css`.

`SectionFrame({ title, meta, loading, error, onRetry, children })` handles skeleton/error/empty.

- [ ] Implement Activity → Sleep → Heart → Vitals; browser check real + demo, 375px + desktop, light + dark, section error (temporarily unreachable) and expired. Commit `feat(health): Body sections`.

### Task 8: Finish

- [ ] Full verify; deploy functions; push branch; wait for Vercel preview; update README Fitbit section (Body tab, migration 015, `health:deploy` includes `health-body`).
