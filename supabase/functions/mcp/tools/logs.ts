import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import {
  bad,
  callEdge,
  checkLogDate,
  Confirm,
  type Ctx,
  defineTool,
  FocusArea,
  LocalDate,
  LOG_COLUMNS,
  must,
  rowsOf,
  mapPgError,
  ok,
  resolveZone,
  TimeZone,
  ToolError,
  Uuid,
  WorkoutType,
} from '../common.ts'
import {
  activityToWorkoutType,
  addDays,
  dedupe,
  durationText,
  focusLabel,
  gramsOrNull,
  isRest,
  parseFocusAreas,
  roundDurationToOptions,
  sanitizeSearch,
  serializeFocusAreas,
} from '../domain.ts'
import { toLog } from '../shapes.ts'

type Zone = Awaited<ReturnType<typeof resolveZone>>

const NO_HEALTH = {
  health_source: null,
  health_workout_id: null,
  calories_kcal: null,
  avg_hr: null,
  max_hr: null,
  hr_zone_minutes: null,
}

type EdgeWorkout = {
  id: string
  durationMin: number
  activity: string
  calories: number | null
  avgHr: number | null
  maxHr: number | null
  zoneMinutes: unknown
}

/** Looks up a Fitbit workout within a day of `date` and returns the log columns it fills. */
async function attachFitbit(ctx: Ctx, fid: string, date: string, today: string, excludeLogId?: string) {
  let dup = ctx.db.from('logs').select('id').eq('user_id', ctx.userId).eq('health_workout_id', fid)
  if (excludeLogId) dup = dup.neq('id', excludeLogId)
  const existing = must(await dup.maybeSingle())
  if (existing) throw new ToolError('conflict', `That Fitbit workout is already logged (log ${existing.id}).`)

  const from = addDays(date, -1)
  const to = addDays(date, 1) < today ? addDays(date, 1) : today
  if (from > to) throw bad("Can't attach a Fitbit workout to a future date.")
  const res = await callEdge<{ workouts?: EdgeWorkout[] }>(ctx, 'health-data', { from, to })
  const w = (res.workouts ?? []).find((x) => x.id === fid)
  if (!w) {
    throw new ToolError(
      'not_found',
      `No Fitbit workout with that id within a day of ${date}. Call get_health_summary for valid ids.`,
    )
  }
  return {
    cols: {
      health_source: 'google_health',
      health_workout_id: w.id,
      calories_kcal: w.calories,
      avg_hr: w.avgHr,
      max_hr: w.maxHr,
      hr_zone_minutes: w.zoneMinutes ?? null,
    },
    durationMin: w.durationMin,
    activity: w.activity,
  }
}

async function getLogRow(ctx: Ctx, id: string) {
  const row = must(await ctx.db.from('logs').select(LOG_COLUMNS).eq('id', id).eq('user_id', ctx.userId).maybeSingle())
  if (!row) throw new ToolError('not_found', 'No log with that id.')
  return row
}

const b64 = (s: string) => btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
const unb64 = (s: string) => atob(s.replaceAll('-', '+').replaceAll('_', '/'))

export function registerLogTools(server: McpServer, ctx: Ctx) {
  defineTool(server, ctx, 'list_logs', {
    title: 'List session logs',
    description:
      'Lists the user\'s workout and rest-day logs, newest first (by date, then creation time), with optional date range, type, focus-area and text filters. Dates are the user\'s local YYYY-MM-DD and both ends are inclusive. Long notes are truncated; use get_log for the full entry, and pass next_cursor back to get the next page.',
    input: {
      from: LocalDate.optional().describe('Earliest log date to include, YYYY-MM-DD (inclusive)'),
      to: LocalDate.optional().describe('Latest log date to include, YYYY-MM-DD (inclusive)'),
      kind: z.enum(['all', 'training', 'rest']).default('all')
        .describe("'training' excludes rest days; 'rest' returns only rest days"),
      type: WorkoutType.optional().describe('Only logs with this workout type'),
      focus_area: FocusArea.optional().describe('Only logs that include this focus area'),
      q: z.string().trim().min(1).max(100).optional()
        .describe('Case-insensitive text search in title, notes, meal and focus areas'),
      limit: z.number().int().min(1).max(200).default(30).describe('Page size (max 200)'),
      cursor: z.string().max(200).optional().describe('next_cursor from a previous call with the same filters'),
    },
    hints: { ro: true, idempotent: true },
    run: async (a, c) => {
      if (a.from && a.to && a.from > a.to) throw bad('from must be on or before to.')
      let offset = 0
      if (a.cursor) {
        try {
          const o = JSON.parse(unb64(a.cursor)).o
          if (!Number.isInteger(o) || o < 0 || o > 1_000_000) throw new Error()
          offset = o
        } catch {
          throw bad('Invalid cursor')
        }
      }
      let search = ''
      if (a.q !== undefined) {
        search = sanitizeSearch(a.q)
        if (!search) throw bad('The search text has no usable characters.')
      }

      const rest = '^\\s*rest( day)?\\s*$'
      let q = c.db.from('logs').select(LOG_COLUMNS, { count: 'exact' }).eq('user_id', c.userId)
      if (a.from) q = q.gte('log_date', a.from)
      if (a.to) q = q.lte('log_date', a.to)
      if (a.kind === 'rest') q = q.filter('workout', 'imatch', rest)
      if (a.kind === 'training') q = q.not('workout', 'imatch', rest)
      if (a.type) q = q.eq('workout_type', a.type)
      // Anchored on commas so 'Arms' doesn't match 'Forearms'
      if (a.focus_area) q = q.filter('focus_areas', 'imatch', `(^|,)\\s*${a.focus_area}\\s*(,|$)`)
      if (search) {
        q = q.or(['workout', 'notes', 'meal', 'focus_areas'].map((col) => `${col}.ilike.*${search}*`).join(','))
      }
      const res = await q
        .order('log_date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + a.limit) // limit + 1 rows, to detect another page
      const rows = rowsOf(res)
      const more = rows.length > a.limit
      return ok({
        logs: rows.slice(0, a.limit).map((r) => toLog(r, { list: true })),
        total_matching: res.count ?? rows.length,
        next_cursor: more ? b64(JSON.stringify({ o: offset + a.limit })) : null,
      })
    },
  })

  defineTool(server, ctx, 'get_log', {
    title: 'Get a log',
    description:
      'Returns one session log in full (title, date, type, focus areas, duration, meal, notes, protein and creatine grams, and any attached Fitbit workout stats). Use an id from list_logs.',
    input: { id: Uuid.describe('Log id') },
    hints: { ro: true, idempotent: true },
    run: async ({ id }, c) => ok({ log: toLog(await getLogRow(c, id)) }),
  })

  defineTool(server, ctx, 'create_log', {
    title: 'Log a session',
    description:
      "Creates a workout log for a date (the user's local YYYY-MM-DD, default today). Give a title, focus areas or both; when there is no title, the focus areas become the title (e.g. 'Chest · Triceps'). Duration is in minutes and protein/creatine in grams. Optionally attach a Fitbit workout by its id from get_health_summary to copy its calories and heart-rate stats. Use log_rest_day for rest days.",
    input: {
      date: LocalDate.optional().describe("Log date, YYYY-MM-DD in the user's time zone. Defaults to today."),
      workout: z.string().trim().max(80).optional()
        .describe("Session title, e.g. 'Push day' or '5k run'. Optional if focus_areas is given."),
      type: WorkoutType.optional().describe('Workout type'),
      focus_areas: z.array(FocusArea).max(16).optional().describe('Muscle or focus areas trained'),
      duration_minutes: z.number().int().min(1).max(779).optional()
        .describe('Session length in minutes (stored as e.g. "1h 20m")'),
      meal: z.string().trim().max(1000).optional().describe('What the user ate around the session'),
      notes: z.string().trim().max(2000).optional().describe('Free-text notes'),
      protein_g: z.number().min(0).max(1000).optional().describe('Protein intake for the day in grams'),
      creatine_g: z.number().min(0).max(100).optional().describe('Creatine intake for the day in grams'),
      fitbit_workout_id: z.string().min(1).max(200).optional()
        .describe('Id of a Fitbit workout from get_health_summary (within a day of the log date) to attach its stats'),
      time_zone: TimeZone,
    },
    // Reaches Fitbit only when fitbit_workout_id is given
    hints: { ro: false, idempotent: false },
    run: async (a, c) => {
      const zone: Zone = await resolveZone(c, a.time_zone)
      const date = a.date ?? zone.today
      checkLogDate(date, zone.today)
      const areas = dedupe(a.focus_areas ?? [])
      const title = a.workout || focusLabel(areas)
      if (!title) throw bad('Give the session a title or at least one focus area.')
      if (isRest(title)) throw bad('Use log_rest_day for rest days.')

      let health: Record<string, unknown> = {}
      let minutes = a.duration_minutes
      let type = a.type
      if (a.fitbit_workout_id) {
        const f = await attachFitbit(c, a.fitbit_workout_id, date, zone.today)
        health = f.cols
        if (minutes == null) minutes = roundDurationToOptions(f.durationMin) || undefined
        if (type == null) type = activityToWorkoutType(f.activity)
      }

      const res = await c.db.from('logs').insert({
        id: crypto.randomUUID(),
        user_id: c.userId,
        log_date: date,
        workout: title,
        workout_type: type ?? null,
        focus_areas: serializeFocusAreas(areas),
        duration: durationText(minutes),
        meal: a.meal || null,
        notes: a.notes || null,
        protein_g: gramsOrNull(a.protein_g),
        creatine_g: gramsOrNull(a.creatine_g),
        photo_path: null,
        ...health,
      }).select(LOG_COLUMNS).single()
      if (res.error?.code === '23505') throw new ToolError('conflict', 'That Fitbit workout is already logged.')
      return ok({ created: true, log: toLog(must(res)) })
    },
  })

  defineTool(server, ctx, 'update_log', {
    title: 'Edit a log',
    description:
      'Edits an existing log. Only the fields you pass change; pass null to clear an optional field, or an empty focus_areas list to remove all focus areas. If the title was generated from focus areas and you change the focus areas without a new title, the title is regenerated, as in the app. The photo is never changed.',
    input: {
      id: Uuid.describe('Log id'),
      date: LocalDate.optional().describe('New log date, YYYY-MM-DD'),
      workout: z.string().trim().min(1).max(80).optional().describe('New session title'),
      type: WorkoutType.nullable().optional().describe('Workout type, or null to clear'),
      focus_areas: z.array(FocusArea).max(16).optional().describe('Replaces the focus areas; [] clears them'),
      duration_minutes: z.number().int().min(1).max(779).nullable().optional().describe('Minutes, or null to clear'),
      meal: z.string().trim().max(1000).nullable().optional().describe('Meal text, or null to clear'),
      notes: z.string().trim().max(2000).nullable().optional().describe('Notes, or null to clear'),
      protein_g: z.number().min(0).max(1000).nullable().optional().describe('Grams, or null to clear'),
      creatine_g: z.number().min(0).max(100).nullable().optional().describe('Grams, or null to clear'),
      is_rest: z.boolean().optional().describe(
        'true turns this into a rest day (clears type, focus areas and Fitbit stats); false turns a rest day into a training session',
      ),
      fitbit_workout_id: z.string().min(1).max(200).nullable().optional()
        .describe('Attach a Fitbit workout by id, or null to detach its stats'),
      time_zone: TimeZone,
    },
    // Reaches Fitbit only when attaching
    hints: { ro: false, idempotent: true },
    run: async (a, c) => {
      const existing = await getLogRow(c, a.id)
      const { id: _id, time_zone, ...fields } = a
      if (!Object.values(fields).some((v) => v !== undefined)) throw bad('Pass at least one field to change.')

      const zone = await resolveZone(c, time_zone)
      // deno-lint-ignore no-explicit-any
      const patch: Record<string, any> = {}
      const wasRest = isRest(existing.workout)
      const rest = a.is_rest ?? wasRest
      const oldAreas = parseFocusAreas(existing.focus_areas)

      if (rest) {
        if (a.type || (a.focus_areas && a.focus_areas.length) || typeof a.fitbit_workout_id === 'string') {
          throw bad("Rest days can't have a type, focus areas or a Fitbit workout. Pass is_rest: false first.")
        }
        if (a.workout && !isRest(a.workout)) throw bad('Pass is_rest: false to turn a rest day into a session.')
        if (existing.workout !== 'Rest') patch.workout = 'Rest'
        Object.assign(patch, { workout_type: null, focus_areas: null, ...NO_HEALTH })
      } else {
        const areas = a.focus_areas !== undefined ? dedupe(a.focus_areas) : oldAreas
        let title: string = existing.workout
        if (a.workout) title = a.workout
        else if (
          wasRest || existing.workout === focusLabel(oldAreas) || existing.workout === oldAreas.join(', ')
        ) title = focusLabel(areas)
        if (!title || isRest(title)) throw bad('Give the session a title or at least one focus area.')
        if (title !== existing.workout) patch.workout = title
        if (a.focus_areas !== undefined) patch.focus_areas = serializeFocusAreas(areas)
        if (a.type !== undefined) patch.workout_type = a.type
      }

      if (a.date !== undefined) {
        checkLogDate(a.date, zone.today)
        patch.log_date = a.date
      }
      if (a.duration_minutes !== undefined) patch.duration = durationText(a.duration_minutes)
      if (a.meal !== undefined) patch.meal = a.meal || null
      if (a.notes !== undefined) patch.notes = a.notes || null
      if (a.protein_g !== undefined) patch.protein_g = gramsOrNull(a.protein_g)
      if (a.creatine_g !== undefined) patch.creatine_g = gramsOrNull(a.creatine_g)

      if (!rest && a.fitbit_workout_id === null) Object.assign(patch, NO_HEALTH)
      if (!rest && typeof a.fitbit_workout_id === 'string') {
        const date = patch.log_date ?? existing.log_date
        const f = await attachFitbit(c, a.fitbit_workout_id, date, zone.today, a.id)
        Object.assign(patch, f.cols)
        if (a.duration_minutes === undefined && !existing.duration) patch.duration = durationText(roundDurationToOptions(f.durationMin))
        if (a.type === undefined && !existing.workout_type) patch.workout_type = activityToWorkoutType(f.activity)
      }

      if (!Object.keys(patch).length) return ok({ updated: true, log: toLog(existing) })
      const res = await c.db.from('logs').update(patch).eq('id', a.id).eq('user_id', c.userId)
        .select(LOG_COLUMNS).single()
      if (res.error?.code === '23505') throw new ToolError('conflict', 'That Fitbit workout is already logged.')
      return ok({ updated: true, log: toLog(must(res)) })
    },
  })

  defineTool(server, ctx, 'delete_log', {
    title: 'Delete a log',
    description:
      'Permanently deletes one log (a photo file, if any, is not removed here). This cannot be undone and lowers the streak and weekly count if it was the only log that day. Only call after the user has confirmed; lift progress is not affected.',
    input: { id: Uuid.describe('Log id'), confirm: Confirm },
    hints: { ro: false, destructive: true, idempotent: true },
    run: async ({ id }, c) => {
      const row = must(
        await c.db.from('logs').select('id, log_date, workout, photo_path').eq('id', id).eq('user_id', c.userId)
          .maybeSingle(),
      )
      if (!row) throw new ToolError('not_found', 'No log with that id.')
      const del = await c.db.from('logs').delete().eq('id', id).eq('user_id', c.userId)
      if (del.error) throw mapPgError(del.error)
      // OAuth tokens can't touch the log-photos bucket (migration 021), and the app has no orphan
      // cleanup, so the file is only removed when the user deletes the log in GRIND.
      return ok({ deleted: true, id, date: row.log_date, workout: row.workout,
        photo_removed: false,
        ...(row.photo_path
          ? { note: "The log's photo file is not removed through this server; it is cleaned up when the user deletes a log in the GRIND app." }
          : {}),
      })
    },
  })

  defineTool(server, ctx, 'log_rest_day', {
    title: 'Log a rest day',
    description:
      "Marks a date (the user's local YYYY-MM-DD, default today) as a rest day by creating a log titled 'Rest'. Safe to repeat: if that date already has a rest log, it is returned unchanged. Rest days count toward the streak and the weekly session count.",
    input: {
      date: LocalDate.optional().describe("YYYY-MM-DD, defaults to today in the user's time zone"),
      time_zone: TimeZone,
    },
    hints: { ro: false, idempotent: true },
    run: async (a, c) => {
      const zone = await resolveZone(c, a.time_zone)
      const date = a.date ?? zone.today
      checkLogDate(date, zone.today)
      const same = rowsOf(
        await c.db.from('logs').select(LOG_COLUMNS).eq('user_id', c.userId).eq('log_date', date),
      )
      // Check-then-insert can race; the app has the same race, so it is accepted here
      const existing = same.find((r) => isRest(r.workout))
      const others = same.filter((r) => !isRest(r.workout)).length
      if (existing) return ok({ created: false, log: toLog(existing), other_logs_that_day: others })
      const row = must(
        await c.db.from('logs').insert({ id: crypto.randomUUID(), user_id: c.userId, log_date: date, workout: 'Rest' })
          .select(LOG_COLUMNS).single(),
      )
      return ok({ created: true, log: toLog(row), other_logs_that_day: others })
    },
  })
}
