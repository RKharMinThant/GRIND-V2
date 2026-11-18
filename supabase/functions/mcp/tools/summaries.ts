import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { callEdge, type Ctx, defineTool, fetchAll, LocalDate, must, ok, rowsOf, resolveZone, TimeZone, ToolError } from '../common.ts'
import {
  addDays,
  calcStreakStats,
  convertSets,
  formatVsAverage,
  type HistoryPoint,
  isRest,
  loadSummary,
  LOAD_STATUS_TEXT,
  parseSetsDetail,
  PR_KIND_OUT,
  prEvents,
  round1,
  startOfWeek,
  volumeOf,
  zoneOffsetMinutes,
} from '../domain.ts'
import { localParts } from '../../_shared/localTime.ts'

function loadOut(s: ReturnType<typeof loadSummary>) {
  return {
    this_week: Math.round(s.thisWeek),
    weekly_average: Math.round(s.baseline),
    ratio: s.ratio === null ? null : Math.round(s.ratio * 100) / 100,
    vs_average: formatVsAverage(s.ratio),
    status: s.status,
    status_text: LOAD_STATUS_TEXT[s.status],
  }
}

export function registerSummaryTools(server: McpServer, ctx: Ctx) {
  defineTool(server, ctx, 'get_week_summary', {
    title: 'Weekly progress and streak',
    description:
      "Returns this week's progress against the user's weekly goal, the current and best streak, and whether today is logged, computed the same way as the GRIND home screen. A day counts once however many logs it has, and rest days count, as in the app; training-only numbers are included too. Pass date to see the week containing another day.",
    input: {
      date: LocalDate.optional().describe('Any day in the week to summarise; defaults to today'),
      time_zone: TimeZone,
    },
    hints: { ro: true, idempotent: true },
    run: async (a, c) => {
      const zone = await resolveZone(c, a.time_zone)
      const profile = must(
        await c.db.from('profiles').select('weekly_goal, week_start').eq('id', c.userId).single(),
      )
      const goal: number = profile.weekly_goal ?? 4
      const weekStart: 0 | 1 = profile.week_start === 1 ? 1 : 0

      const logs = await fetchAll<{ log_date: string; workout: string }>(
        (from, to) =>
          c.db.from('logs').select('log_date, workout').eq('user_id', c.userId)
            .order('log_date', { ascending: false }).order('id').range(from, to),
        20,
      )
      const byDate = new Map<string, string[]>()
      for (const l of logs) byDate.set(l.log_date, [...(byDate.get(l.log_date) ?? []), l.workout])

      const start = startOfWeek(a.date ?? zone.today, weekStart)
      const days = Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((date) => {
        const titles = byDate.get(date) ?? []
        return {
          date,
          logged: titles.length > 0,
          rest_only: titles.length > 0 && titles.every((t) => isRest(t)),
          workouts: titles,
        }
      })
      const sessions = days.filter((d) => d.logged).length
      const streak = calcStreakStats([...byDate.keys()], zone.today)
      return ok({
        today: zone.today,
        time_zone: zone.timeZone,
        week: { start, end: addDays(start, 6), starts_on: weekStart === 1 ? 'monday' : 'sunday' },
        goal,
        sessions,
        goal_met: sessions >= goal,
        remaining: Math.max(0, goal - sessions),
        training_days: days.filter((d) => d.logged && !d.rest_only).length,
        rest_days: days.filter((d) => d.rest_only).length,
        days,
        streak: {
          current: streak.current,
          best: streak.best,
          today_logged: streak.hasToday,
          total_days: streak.totalDays,
          days_this_month: streak.monthDays,
        },
      })
    },
  })

  defineTool(server, ctx, 'get_training_load', {
    title: 'Training load',
    description:
      "Compares the last 7 days of lifting volume (Σ reps × weight across lift-board entries, in the user's weight unit) with their average week over the 4 weeks before. Returns a status: building (no baseline yet), ramping (more than 1.5× usual), lighter (under 0.8×) or steady. Set include_cardio to also compare Fitbit zone minutes.",
    input: {
      include_cardio: z.boolean().default(false).describe('Also compare Fitbit active zone minutes (needs Fitbit; slower)'),
      time_zone: TimeZone,
    },
    hints: { ro: true, idempotent: true, open: true },
    run: async (a, c) => {
      const zone = await resolveZone(c, a.time_zone)
      const profile = must(await c.db.from('profiles').select('weight_unit').eq('id', c.userId).single())
      const unit = profile.weight_unit === 'lb' ? 'lb' : 'kg'
      const since = new Date(Date.now() - 36 * 86_400_000).toISOString()
      const rows = await fetchAll<{ sets_detail: unknown; unit: string; recorded_at: string }>(
        (from, to) =>
          c.db.from('lift_history').select('sets_detail, unit, recorded_at').eq('user_id', c.userId)
            .gte('recorded_at', since).order('recorded_at', { ascending: false }).order('id').range(from, to),
        10,
      )
      const byDay = new Map<string, number>()
      for (const r of rows) {
        const at = new Date(r.recorded_at)
        if (Number.isNaN(at.getTime())) continue
        const from = r.unit === 'lb' ? 'lb' : 'kg'
        const vol = volumeOf(convertSets(parseSetsDetail(r.sets_detail), from, unit))
        const day = localParts(at, zone.timeZone).day
        byDay.set(day, (byDay.get(day) ?? 0) + vol)
      }
      const out: Record<string, unknown> = {
        today: zone.today,
        time_zone: zone.timeZone,
        lifting: { unit, ...loadOut(loadSummary(byDay, zone.today, 28)) },
      }

      if (a.include_cardio) {
        try {
          const res = await callEdge<{ days?: { date: string; azm: { fatBurn: number; cardio: number; peak: number } | null }[] }>(
            c, 'health-body',
            { section: 'activity', date: zone.today, tzOffsetMin: zoneOffsetMinutes(zone.timeZone, zone.today) },
          )
          const zm = new Map<string, number>()
          for (const d of res.days ?? []) if (d.azm) zm.set(d.date, d.azm.fatBurn + d.azm.cardio + d.azm.peak)
          out.cardio = { unit: 'zone_minutes', ...loadOut(loadSummary(zm, zone.today, 23)) }
        } catch (e) {
          if (!(e instanceof ToolError)) throw e
          out.cardio = null
          out.cardio_error = e.message
        }
      }
      return ok(out)
    },
  })

  defineTool(server, ctx, 'get_recent_prs', {
    title: 'Recent personal records',
    description:
      "Lists personal records set on the lift board in the last N days, newest first. A PR is an estimated 1RM (Epley, reps capped at 12), heaviest weight or session volume that beats every earlier entry for that lift; values are in each lift's own unit. A lift's first entry is never a PR.",
    input: {
      days: z.number().int().min(1).max(365).default(30).describe('Look-back window in days, counting today'),
      limit: z.number().int().min(1).max(50).default(20).describe('Max PRs to return'),
      time_zone: TimeZone,
    },
    hints: { ro: true, idempotent: true },
    run: async (a, c) => {
      const zone = await resolveZone(c, a.time_zone)
      const lifts = rowsOf(
        await c.db.from('tracked_lifts').select('id, exercise_name, unit').eq('user_id', c.userId).limit(200),
      )
      const history = await fetchAll<{ lift_id: string; sets_detail: unknown; unit: string; recorded_at: string }>(
        (from, to) =>
          c.db.from('lift_history').select('lift_id, sets_detail, unit, recorded_at').eq('user_id', c.userId)
            .order('recorded_at', { ascending: false }).order('id').range(from, to),
        10,
      )
      const byLift = new Map<string, HistoryPoint[]>()
      for (const h of history) {
        const list = byLift.get(h.lift_id) ?? []
        list.push({ sets_detail: parseSetsDetail(h.sets_detail), unit: h.unit, recorded_at: h.recorded_at })
        byLift.set(h.lift_id, list)
      }
      const cutoff = addDays(zone.today, -(a.days - 1))
      const prs = lifts.flatMap((l) => {
        const unit = l.unit === 'lb' ? 'lb' : 'kg'
        return prEvents(byLift.get(l.id) ?? [], unit).map((e) => ({
          lift_id: l.id as string,
          lift: l.exercise_name as string,
          kind: PR_KIND_OUT[e.kind],
          value: round1(e.value),
          unit,
          date: localParts(new Date(e.recorded_at), zone.timeZone).day,
          recorded_at: e.recorded_at,
        }))
      })
        .filter((p) => p.date >= cutoff)
        .sort((x, y) => y.recorded_at.localeCompare(x.recorded_at))
        .slice(0, a.limit)
      return ok({ today: zone.today, time_zone: zone.timeZone, prs })
    },
  })
}
