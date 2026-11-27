// Thin wrappers over the existing health-* Edge Functions, called as the user.
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import {
  bad,
  callEdge,
  type Ctx,
  defineTool,
  fail,
  LocalDate,
  must,
  ok,
  resolveZone,
  snake,
  take,
  TimeZone,
  ToolError,
} from '../common.ts'
import { addDays, round1, zoneOffsetMinutes } from '../domain.ts'

type Component = { value: number | null; baseline: number | null; score: number | null }
type Recovery = {
  date: string
  sleepMin: number | null
  stages: unknown
  restingHr: number | null
  restingHrAvg: number | null
  hrvMs: number | null
  hrvAvg: number | null
}
type Readiness = {
  date: string
  status: 'ok' | 'building'
  score: number | null
  zone: 'green' | 'yellow' | 'red' | null
  hrv: Component
  restingHr: Component
  sleep: Component
  baselineDays: number
}
type Workout = {
  id: string
  start: string
  end: string
  durationMin: number
  activity: string
  calories: number | null
  avgHr: number | null
  maxHr: number | null
  zoneMinutes: { fatBurn: number; cardio: number; peak: number } | null
}

const ZONE_LABEL = { green: 'Primed', yellow: 'Steady', red: 'Recover' } as const

const recoveryOut = (r: Recovery | null) =>
  r && {
    date: r.date,
    sleep_min: r.sleepMin,
    stages: r.stages ?? null,
    resting_hr: r.restingHr,
    resting_hr_7d_avg: r.restingHrAvg,
    hrv_ms: r.hrvMs,
    hrv_7d_avg: r.hrvAvg,
  }

const readinessOut = (r: Readiness | null) =>
  r && {
    date: r.date,
    status: r.status,
    score: r.score,
    zone: r.zone,
    zone_label: r.zone ? ZONE_LABEL[r.zone] : null,
    hrv: r.hrv,
    resting_hr: r.restingHr,
    sleep: r.sleep,
    baseline_days: r.baselineDays,
  }

/** Every Fitbit call fans out to Google Health, so agents get 30 per 10 minutes across all health tools. */
async function takeHealth(c: Ctx) {
  if (!(await take(c, 'health', 30, 600))) {
    throw new ToolError('rate_limited', 'Fitbit data is rate-limited to 30 requests per 10 minutes for agents. Try again shortly.')
  }
}

export function registerHealthTools(server: McpServer, ctx: Ctx) {
  defineTool(server, ctx, 'get_health_summary', {
    title: 'Fitbit summary',
    description:
      "Returns Fitbit data for a date range: workouts (with calories, heart rate and zone minutes, and the GRIND log each is attached to, if any), daily steps, plus last night's recovery, the readiness score and activity totals for the range's last day. Dates are the user's local YYYY-MM-DD, at most 180 days apart; the default is the last 7 days. Use a workout's id with create_log to log it.",
    input: {
      from: LocalDate.optional().describe('First day, YYYY-MM-DD; defaults to 6 days before `to`'),
      to: LocalDate.optional().describe('Last day, YYYY-MM-DD; defaults to today. Recovery, readiness and day_totals are for this day.'),
      time_zone: TimeZone,
    },
    hints: { ro: true, idempotent: true, open: true },
    run: async (a, c) => {
      const zone = await resolveZone(c, a.time_zone)
      const to = a.to ?? zone.today
      const from = a.from ?? addDays(to, -6)
      if (from > to) throw bad('from must be on or before to.')
      if (to > zone.today) throw bad("to can't be in the future.")
      if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 180) {
        throw bad('from and to must be at most 180 days apart.')
      }
      await takeHealth(c)
      const res = await callEdge<{
        workouts?: Workout[]
        recovery?: Recovery | null
        readiness?: Readiness | null
        steps?: { date: string; steps: number }[]
        today?: { date: string; steps: number | null; distanceKm: number | null; zoneMinutes: number | null; calories: number | null }
        lastSyncedAt?: string
      }>(c, 'health-data', { from, to })

      const all = [...(res.workouts ?? [])].sort((x, y) => x.start.localeCompare(y.start))
      const truncated = all.length > 100
      const workouts = truncated ? all.slice(-100) : all // newest 100, still oldest first

      const linked = new Map<string, string>()
      const ids = workouts.map((w) => w.id)
      for (let i = 0; i < ids.length; i += 100) {
        const rows = must(
          await c.db.from('logs').select('id, health_workout_id').eq('user_id', c.userId)
            .in('health_workout_id', ids.slice(i, i + 100)),
        ) ?? []
        for (const r of rows) linked.set(r.health_workout_id, r.id)
      }

      const t = res.today
      return ok({
        from,
        to,
        time_zone: zone.timeZone,
        last_synced_at: res.lastSyncedAt ?? null,
        workouts: workouts.map((w) => ({
          id: w.id,
          start: w.start,
          end: w.end,
          duration_min: w.durationMin,
          activity: w.activity,
          calories: w.calories,
          avg_hr: w.avgHr,
          max_hr: w.maxHr,
          zone_minutes: w.zoneMinutes
            ? { fat_burn: w.zoneMinutes.fatBurn, cardio: w.zoneMinutes.cardio, peak: w.zoneMinutes.peak }
            : null,
          logged_as: linked.get(w.id) ?? null,
        })),
        ...(truncated ? { workouts_truncated: true } : {}),
        steps: res.steps ?? [],
        day_totals: t
          ? { date: t.date, steps: t.steps, distance_km: t.distanceKm, zone_minutes: t.zoneMinutes, calories: t.calories }
          : null,
        recovery: recoveryOut(res.recovery ?? null),
        readiness: readinessOut(res.readiness ?? null),
      })
    },
  })

  defineTool(server, ctx, 'get_readiness', {
    title: 'Readiness score',
    description:
      "Returns the 0–100 readiness score for the night ending on a date (default today), built from HRV and resting heart rate against the user's 30-day baseline plus sleep against a 7.5 h need, with last night's recovery details. Zones: green 'Primed', yellow 'Steady', red 'Recover'; status 'building' means fewer than 7 days of history.",
    input: {
      date: LocalDate.optional().describe('YYYY-MM-DD, the morning the night ended; defaults to today'),
      time_zone: TimeZone,
    },
    hints: { ro: true, idempotent: true, open: true },
    run: async (a, c) => {
      const zone = await resolveZone(c, a.time_zone)
      const date = a.date ?? zone.today
      if (date > zone.today) throw bad("date can't be in the future.")
      await takeHealth(c)
      // The same range the app uses in googleProvider.getReadiness
      const res = await callEdge<{ recovery?: Recovery | null; readiness?: Readiness | null }>(c, 'health-data', {
        from: addDays(date, -7),
        to: date,
      })
      return ok({
        date,
        time_zone: zone.timeZone,
        readiness: readinessOut(res.readiness ?? null),
        recovery: recoveryOut(res.recovery ?? null),
      })
    },
  })

  defineTool(server, ctx, 'get_body_section', {
    title: 'Fitbit body detail',
    description:
      "Returns one detailed Fitbit section ending on a date (default today): 'activity' (30 days of steps, km, zone minutes, active minutes, calories, floors), 'heart' (resting HR and HRV for 30 days, daily min/avg/max for 14 days, today's zone minutes), 'sleep' (last 14 nights with stages) or 'vitals' (SpO₂, breathing rate, skin temperature over 30 days and Fitbit weight over 90). Set detail to true to include the 5-minute heart-rate curve and per-night sleep segments.",
    input: {
      section: z.enum(['activity', 'heart', 'sleep', 'vitals']).describe('Which section to load'),
      date: LocalDate.optional().describe('Last day of the window, YYYY-MM-DD; defaults to today'),
      detail: z.boolean().default(false).describe('Include the heart-rate curve and sleep stage segments (large)'),
      time_zone: TimeZone,
    },
    hints: { ro: true, idempotent: true, open: true },
    run: async (a, c) => {
      const zone = await resolveZone(c, a.time_zone)
      const date = a.date ?? zone.today
      if (date > zone.today) throw bad("date can't be in the future.")
      await takeHealth(c)
      const res = await callEdge<unknown>(c, 'health-body', {
        section: a.section,
        date,
        tzOffsetMin: zoneOffsetMinutes(zone.timeZone, date),
      })
      // deno-lint-ignore no-explicit-any
      let data: any = res
      if (a.section === 'activity') {
        data = { days: Array.isArray(res) ? res : (res as { days?: unknown }).days ?? [] }
      }
      if (!a.detail) {
        if (a.section === 'heart' && data) delete data.curveToday
        if (a.section === 'sleep' && Array.isArray(data?.nights)) {
          // deno-lint-ignore no-explicit-any
          data.nights = data.nights.map(({ segments: _s, ...n }: any) => n)
        }
      }
      return ok({ section: a.section, date, time_zone: zone.timeZone, data: snake(data) })
    },
  })

  defineTool(server, ctx, 'get_grind_age', {
    title: 'GRIND Age',
    description:
      "Returns the user's GRIND Age, a biological-age estimate from sleep, steps, heart-rate zones, strength training, resting heart rate, VO₂ max and body composition. It includes each factor's contribution in years (+ older, − younger), the Pace of Aging (1.0 = one year per calendar year; under 1 is slower) and up to 12 weekly readings. Readings are weekly (weeks start Monday) and cached; pass refresh: true to recompute after new data such as a measurement.",
    input: {
      refresh: z.boolean().default(false)
        .describe("Recompute now instead of returning this week's cached reading (slower)"),
      time_zone: TimeZone,
    },
    // Writes only the server's own weekly cache row
    hints: { ro: true, idempotent: true, open: true },
    run: async (a, c) => {
      const zone = await resolveZone(c, a.time_zone)
      await takeHealth(c)
      // A forced recompute is expensive: 2 per hour, then serve the cached reading
      let refresh = a.refresh
      if (refresh && !(await take(c, 'grind_age_refresh', 2, 3600))) refresh = false
      const refreshLimited = a.refresh && !refresh
      const res = await callEdge<{
        status: string
        weekStart: string
        computedAt: string
        result: {
          chronologicalAge: number
          grindAge: number
          factors: { id: string; label: string; value: number | null; unit: string; target: string; years: number | null; estimated?: boolean }[]
          missing: string[]
        }
        pace: number | null
        history: { weekStart: string; grindAge: number }[]
        partial?: boolean
      }>(c, 'health-age', { timeZone: zone.timeZone, refresh })

      if (res.status === 'needs_profile') {
        return fail(
          'needs_profile',
          "GRIND Age needs the user's birth date and sex (age 13–110). Ask the user, then set them with update_settings.",
        )
      }
      if (res.status === 'not_connected') {
        return fail(
          'fitbit_not_connected',
          "GRIND Age needs Fitbit, which isn't connected or has expired. The user can connect it in GRIND Settings.",
        )
      }
      if (res.status !== 'ok' || !res.result) {
        throw new ToolError('upstream_error', "GRIND's health service didn't respond. Try again shortly.")
      }
      const r = res.result
      const factors = r.factors.map((f) => ({
        id: f.id,
        label: f.label,
        value: f.value,
        unit: f.unit,
        target: f.target,
        years: f.years,
        ...(f.estimated ? { estimated: true as const } : {}),
      }))
      const withYears = factors.filter((f) => f.years != null) as (typeof factors[number] & { years: number })[]
      return ok({
        week_start: res.weekStart,
        computed_at: res.computedAt,
        time_zone: zone.timeZone,
        grind_age: r.grindAge,
        chronological_age: round1(r.chronologicalAge),
        age_gap: round1(r.grindAge - r.chronologicalAge),
        pace: res.pace ?? null,
        pace_note: res.pace == null ? 'Needs ≥4 weekly readings over ≥12 weeks' : 'Years of biological ageing per calendar year',
        factors,
        top_adding: withYears.filter((f) => f.years > 0).sort((x, y) => y.years - x.years).slice(0, 3).map((f) => f.id),
        top_reducing: withYears.filter((f) => f.years < 0).sort((x, y) => x.years - y.years).slice(0, 3).map((f) => f.id),
        missing: r.missing,
        history: (res.history ?? []).map((h) => ({ week_start: h.weekStart, grind_age: h.grindAge })),
        partial: res.partial === true,
        ...(refreshLimited
          ? { refresh_note: 'Refresh is limited to 2 per hour for agents, so this is the cached reading (refresh: false).' }
          : {}),
      })
    },
  })
}
