import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { bad, type Ctx, defineTool, LocalDate, must, ok, resolveZone, TimeZone, ToolError, type Zone } from '../common.ts'
import { wholeYears } from '../domain.ts'

const NOTIFICATION_KEYS = [
  'readiness', 'workout_done', 'fitbit_expired', 'inactivity', 'streak_risk',
  'step_goal', 'recovery_milestone', 'rest_day', 'weekly_report',
] as const

const PROFILE_COLUMNS =
  'display_name, weekly_goal, daily_step_goal, distance_unit, weight_unit, week_start, notification_prefs, birth_date, sex, created_at'

// deno-lint-ignore no-explicit-any
function profileOut(ctx: Ctx, p: Record<string, any>, zone: Zone) {
  const prefs = (p.notification_prefs ?? {}) as Record<string, unknown>
  return {
    display_name: (p.display_name as string | null) ?? null,
    email: ctx.email,
    weekly_goal: (p.weekly_goal as number | null) ?? 4,
    daily_step_goal: (p.daily_step_goal as number | null) ?? 10000,
    distance_unit: p.distance_unit === 'mi' ? 'mi' : 'km',
    weight_unit: p.weight_unit === 'lb' ? 'lb' : 'kg',
    week_start: p.week_start === 1 ? 'monday' : 'sunday',
    notifications: Object.fromEntries(NOTIFICATION_KEYS.map((k) => [k, prefs[k] === true])),
    birth_date: (p.birth_date as string | null) ?? null,
    age: p.birth_date ? wholeYears(p.birth_date, zone.today) : null,
    sex: (p.sex as string | null) ?? null,
    time_zone: zone.timeZone,
    time_zone_source: zone.source,
    today: zone.today,
    member_since: p.created_at as string,
  }
}

async function readProfile(ctx: Ctx) {
  const res = await ctx.db.from('profiles').select(PROFILE_COLUMNS).eq('id', ctx.userId).single()
  if (res.error?.code === 'PGRST116') throw new ToolError('not_found', 'No GRIND profile found for this user.')
  return must(res)
}

export function registerProfileTools(server: McpServer, ctx: Ctx) {
  defineTool(server, ctx, 'get_profile', {
    title: 'Get profile and settings',
    description:
      "Returns the user's GRIND profile and settings: display name, email, weekly session goal, daily step goal, units, week start, notification toggles, birth date, sex, Fitbit connection status and the time zone this server uses for 'today'. Call this first if you need the user's units or goals.",
    input: { time_zone: TimeZone },
    hints: { ro: true, idempotent: true },
    run: async ({ time_zone }, c) => {
      const [profile, conn, zone] = await Promise.all([
        readProfile(c),
        c.db.rpc('health_connection_status'),
        resolveZone(c, time_zone),
      ])
      const row = Array.isArray(conn.data) ? conn.data[0] : null
      return ok({
        ...profileOut(c, profile, zone),
        fitbit: {
          status: row?.status === 'connected' || row?.status === 'expired' ? row.status : 'not_connected',
          last_synced_at: row?.last_synced_at ?? null,
        },
      })
    },
  })

  const notif = (d: string) => z.boolean().optional().describe(d)
  defineTool(server, ctx, 'update_settings', {
    title: 'Update settings',
    description:
      "Changes the user's GRIND settings: display name, weekly session goal, daily step goal, distance and weight units, week start day, notification toggles, birth date and sex. Only the fields you pass change. This edits the user's app settings, so confirm the change with the user first; email and password cannot be changed here.",
    input: {
      display_name: z.string().trim().min(1).max(60).optional().describe('Name shown in the app'),
      weekly_goal: z.number().int().min(1).max(14).optional().describe('Target training days per week (1–14)'),
      daily_step_goal: z.number().int().min(1000).max(100000).optional()
        .describe('Daily steps target (1,000–100,000). Rounded to the nearest 500, as in the app.'),
      distance_unit: z.enum(['km', 'mi']).optional().describe('Unit for distances shown in the app'),
      weight_unit: z.enum(['kg', 'lb']).optional()
        .describe('Default unit for NEW lifts. Existing lifts keep their own unit; body weight is always stored in kg.'),
      week_start: z.enum(['sunday', 'monday']).optional()
        .describe('First day of the week for weekly goals and streak rings'),
      notifications: z.object({
        readiness: notif('Morning readiness score (needs Fitbit)'),
        workout_done: notif('Summary when Fitbit syncs a workout (needs Fitbit)'),
        fitbit_expired: notif('Alert when the Fitbit connection drops (needs Fitbit)'),
        streak_risk: notif('Evening nudge when the streak is about to break'),
        rest_day: notif('~11pm rest-day check-in after three training days'),
        weekly_report: notif('Sunday 8 PM week-in-review'),
        inactivity: notif('Nudge after a few days without a session'),
        step_goal: notif('Early-evening nudge when close to the step goal (needs Fitbit)'),
        recovery_milestone: notif('Standout sleep or falling resting heart rate (needs Fitbit)'),
      }).optional().describe(
        'Notification toggles to change; unspecified ones keep their value. They only deliver on a device where the user enabled push in GRIND.',
      ),
      birth_date: LocalDate.optional()
        .describe('YYYY-MM-DD, between 1900-01-01 and today. Used for GRIND Age (needs age 13–110).'),
      sex: z.enum(['male', 'female']).optional().describe('Used for GRIND Age baselines'),
      time_zone: TimeZone,
    },
    hints: { ro: false, idempotent: true },
    run: async (a, c) => {
      // deno-lint-ignore no-explicit-any
      const patch: Record<string, any> = {}
      if (a.display_name !== undefined) patch.display_name = a.display_name
      if (a.weekly_goal !== undefined) patch.weekly_goal = a.weekly_goal
      if (a.daily_step_goal !== undefined) {
        patch.daily_step_goal = Math.min(100000, Math.max(1000, Math.round(a.daily_step_goal / 500) * 500))
      }
      if (a.distance_unit !== undefined) patch.distance_unit = a.distance_unit
      if (a.weight_unit !== undefined) patch.weight_unit = a.weight_unit
      if (a.week_start !== undefined) patch.week_start = a.week_start === 'monday' ? 1 : 0
      if (a.sex !== undefined) patch.sex = a.sex
      const given = a.notifications ? Object.entries(a.notifications).filter(([, v]) => v !== undefined) : []
      const changedKeys = Object.keys(patch)
      if (a.birth_date !== undefined) changedKeys.push('birth_date')
      if (given.length) changedKeys.push('notifications')
      if (!changedKeys.length) throw bad('Pass at least one setting to change.')

      const zone = await resolveZone(c, a.time_zone)
      if (a.birth_date !== undefined) {
        if (a.birth_date < '1900-01-01' || a.birth_date > zone.today) {
          throw bad(`birth_date must be between 1900-01-01 and ${zone.today}.`)
        }
        patch.birth_date = a.birth_date
      }
      if (given.length) {
        const current = await readProfile(c)
        patch.notification_prefs = { ...(current.notification_prefs ?? {}), ...Object.fromEntries(given) }
      }

      const updated = must(
        await c.db.from('profiles').update(patch).eq('id', c.userId).select(PROFILE_COLUMNS).single(),
      )
      return ok({ updated: changedKeys, profile: profileOut(c, updated, zone) })
    },
  })
}
