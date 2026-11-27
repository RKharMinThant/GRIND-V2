// Shared plumbing for the GRIND MCP tools: context, results, errors, time zone, Edge Function calls.
// SECURITY: nothing here may read the service role key, and nothing may put the bearer token,
// headers or health_connections data into tool output or logs.
import type { McpServer } from '@modelcontextprotocol/server'
import type { SupabaseContext } from '@supabase/server'
import { z } from 'zod'
import { localParts } from '../_shared/localTime.ts'
import { addDays, isRealDate, isValidTimeZone, snakeKeys } from './domain.ts'

export type Db = SupabaseContext['supabase']

export type Ctx = {
  /** User-scoped client: every query runs under the caller's RLS. */
  db: Db
  userId: string
  email: string | null
  /** The caller's exact bearer header. Only ever sent back to this project's own Edge Functions. */
  authorization: string
  supabaseUrl: string
  anonKey: string
}

// ---------------------------------------------------------------- results and errors

export type ToolResult = {
  content: { type: 'text'; text: string }[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

export type ErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'conflict'
  | 'unauthorized'
  | 'fitbit_not_connected'
  | 'fitbit_expired'
  | 'fitbit_unavailable'
  | 'needs_profile'
  | 'upstream_error'
  | 'db_error'
  | 'rate_limited'

export const ok = (obj: Record<string, unknown>): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(obj) }],
  structuredContent: obj,
})

export const fail = (code: ErrorCode, message: string, extra?: Record<string, unknown>): ToolResult => ({
  isError: true,
  content: [{ type: 'text', text: message }],
  structuredContent: { error: code, message, ...extra },
})

/** Thrown inside tool handlers; the wrapper turns it into a plain isError result. */
export class ToolError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message)
  }
}
export const bad = (message: string) => new ToolError('invalid_input', message)

type PgErr = { code?: string; message?: string }

export function mapPgError(e: PgErr): ToolError {
  switch (e.code) {
    case 'PGRST116':
    case '42501': // RLS: never reveal another user's row
      return new ToolError('not_found', 'Not found.')
    case '23505':
      return new ToolError('conflict', 'That record already exists.')
    case '23514':
      return new ToolError('invalid_input', 'A value is out of range.')
    case '22P02':
      return new ToolError('invalid_input', 'A value has an invalid format.')
    default:
      // Server-side only; the agent gets a generic message
      console.error('db error', e.code ?? '', e.message ?? '')
      return new ToolError('db_error', 'Database error. Try again.')
  }
}

/** Unwraps a Supabase response, throwing the mapped error. Rows are untyped (no generated DB types). */
// deno-lint-ignore no-explicit-any
export function must(res: { data: any; error: PgErr | null }): any {
  if (res.error) throw mapPgError(res.error)
  return res.data
}

// ---------------------------------------------------------------- tool registration

export type ToolDef<S extends z.ZodRawShape> = {
  title: string
  description: string
  input: S
  /** readOnlyHint, destructiveHint, idempotentHint, openWorldHint */
  hints: { ro: boolean; destructive?: boolean; idempotent: boolean; open?: boolean }
  run: (args: z.infer<z.ZodObject<S>>, ctx: Ctx) => Promise<ToolResult>
}

export function defineTool<S extends z.ZodRawShape>(server: McpServer, ctx: Ctx, name: string, def: ToolDef<S>) {
  server.registerTool(
    name,
    {
      title: def.title,
      description: def.description,
      inputSchema: z.object(def.input),
      annotations: {
        title: def.title,
        readOnlyHint: def.hints.ro,
        destructiveHint: def.hints.destructive ?? false,
        idempotentHint: def.hints.idempotent,
        openWorldHint: def.hints.open ?? false,
      },
    },
    // deno-lint-ignore no-explicit-any
    (async (args: any) => {
      try {
        return await def.run(args, ctx)
      } catch (e) {
        if (e instanceof ToolError) return fail(e.code, e.message, e.extra)
        // Message only: never log or return headers, tokens or stacks
        console.error('tool error', name, (e as Error)?.message ?? 'unknown')
        return fail('db_error', 'Something went wrong. Try again.')
      }
      // deno-lint-ignore no-explicit-any
    }) as any,
  )
}

// ---------------------------------------------------------------- zod fragments (v4)

export const LocalDate = z.iso.date().refine(isRealDate, 'Not a real calendar date')
export const Uuid = z.uuid()
export const TimeZone = z
  .string()
  .regex(/^[A-Za-z0-9+_\-/]{1,64}$/)
  .optional()
  .describe("IANA time zone, e.g. 'Asia/Yangon'. Defaults to the user's phone time zone, then UTC.")

export const FocusArea = z.enum([
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Arms', 'Forearms', 'Core', 'Abs',
  'Legs', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Full Body', 'Mobility',
])
export const WorkoutType = z.enum(['Strength', 'Cardio', 'HIIT', 'Flexibility', 'Swim', 'Cycle', 'Other'])
export const MuscleGroup = z.enum([
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Glutes', 'Core', 'Full Body',
])
export const WeightUnit = z.enum(['kg', 'lb'])

export const LiftSet = z.object({
  reps: z.number().int().min(1).max(999).describe('Reps in this set'),
  weight: z.number().min(0).max(2000).describe("Load for this set in the lift's unit (kg or lb). 0 for bodyweight."),
})
export const LiftSets = z.array(LiftSet).min(1).max(30).describe('Working sets in order, one entry per set')

export const Confirm = z
  .literal(true)
  .describe('Must be true. Set it only after the user has explicitly confirmed this deletion.')

// ---------------------------------------------------------------- time zone and date bounds

export type Zone = { timeZone: string; source: 'argument' | 'device' | 'utc_default'; today: string }

/** Resolves the zone once per call: argument, then the phone's zone via my_time_zone(), then UTC. */
export async function resolveZone(ctx: Ctx, arg?: string): Promise<Zone> {
  let timeZone = 'UTC'
  let source: Zone['source'] = 'utc_default'
  if (arg) {
    if (!isValidTimeZone(arg)) throw bad(`Unknown time zone '${arg}'. Use an IANA name like 'Asia/Yangon'.`)
    timeZone = arg
    source = 'argument'
  } else {
    // An error (e.g. migration 020 not applied yet) just means no device zone
    const { data, error } = await ctx.db.rpc('my_time_zone')
    if (!error && typeof data === 'string' && isValidTimeZone(data)) {
      timeZone = data
      source = 'device'
    }
  }
  return { timeZone, source, today: localParts(new Date(), timeZone).day }
}

/** Typo guards the app does not enforce. */
export function checkLogDate(date: string, today: string) {
  const max = addDays(today, 30)
  if (date < '2000-01-01' || date > max) throw bad(`Date must be between 2000-01-01 and ${max}.`)
}
export function checkMeasurementDate(date: string, today: string) {
  if (date < '2000-01-01' || date > today) throw bad(`Date must be between 2000-01-01 and ${today}.`)
}

// ---------------------------------------------------------------- rate limit

/** One slot from the caller's rate-limit bucket (mcp_take, migration 021). Fails closed on a DB error. */
export async function take(c: Ctx, bucket: string, max: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await c.db.rpc('mcp_take', { bucket, max_per_window: max, window_seconds: windowSeconds })
  if (error) throw new ToolError('db_error', 'Something went wrong. Try again.')
  return data === true
}

// ---------------------------------------------------------------- paging

// deno-lint-ignore no-explicit-any
export type Row = Record<string, any>

/** Unwraps a list response into rows. */
export function rowsOf(res: { data: unknown; error: PgErr | null }): Row[] {
  return (must(res) ?? []) as Row[]
}

/** Reads every row in pages of 1000 (PostgREST caps responses), up to `maxPages`. */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PgErr | null }>,
  maxPages: number,
): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < maxPages; i++) {
    const rows = must(await page(i * 1000, i * 1000 + 999)) ?? []
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

// ---------------------------------------------------------------- Edge Functions (health)

type EdgeName = 'health-data' | 'health-body' | 'health-age'

const EDGE_MESSAGES = {
  not_connected: "Fitbit isn't connected. The user can connect it in GRIND Settings.",
  expired: 'The Fitbit connection has expired. The user can reconnect it in GRIND Settings.',
  range: 'Date range is too large: from and to must be at most 180 days apart.',
  invalid: 'Invalid date range or section.',
  unauthorized: 'The GRIND sign-in has expired. Reconnect GRIND in this app.',
  upstream: "GRIND's health service didn't respond. Try again shortly.",
}

/** Maps a non-OK Edge Function response to a tool error. */
export function edgeError(status: number, body: Record<string, unknown> | null): ToolError {
  const err = typeof body?.error === 'string' ? body.error : ''
  if (status === 404 && err === 'not_connected') return new ToolError('fitbit_not_connected', EDGE_MESSAGES.not_connected)
  if (status === 409 && err === 'expired') return new ToolError('fitbit_expired', EDGE_MESSAGES.expired)
  if (status === 400 && err === 'range_too_large') return new ToolError('invalid_input', EDGE_MESSAGES.range)
  if (status === 400) return new ToolError('invalid_input', EDGE_MESSAGES.invalid)
  if (status === 401) return new ToolError('unauthorized', EDGE_MESSAGES.unauthorized)
  if (status === 502 && (err === 'google' || err === 'token_refresh_failed')) {
    const source = typeof body?.source === 'string' ? body.source.replace(/[^\w -]/g, '').slice(0, 40) : ''
    // Upstream detail is Google's message: truncated, structuredContent only
    const detail = typeof body?.detail === 'string' ? body.detail.slice(0, 200) : undefined
    return new ToolError(
      'fitbit_unavailable',
      `Fitbit (Google Health) didn't respond${source ? ` while reading ${source}` : ''}. Try again in a minute.`,
      detail ? { detail } : undefined,
    )
  }
  return new ToolError('upstream_error', EDGE_MESSAGES.upstream)
}

/** Calls one of this project's health Edge Functions as the caller. Throws ToolError. */
export async function callEdge<T = Record<string, unknown>>(ctx: Ctx, name: EdgeName, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${ctx.supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: { Authorization: ctx.authorization, apikey: ctx.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new ToolError('upstream_error', EDGE_MESSAGES.upstream)
  }
  let parsed: unknown = null
  try {
    parsed = await res.json()
  } catch {
    // tolerate a non-JSON body
  }
  const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  if (!res.ok) throw edgeError(res.status, obj)
  if (!obj) throw new ToolError('upstream_error', EDGE_MESSAGES.upstream)
  return obj as T
}

/** Converts upstream camelCase keys to snake_case for output. */
export const snake = <T = unknown>(v: unknown): T => snakeKeys(v) as T

// ---------------------------------------------------------------- shared output shapes

export const LOG_COLUMNS =
  'id, log_date, workout, workout_type, focus_areas, duration, meal, notes, protein_g, creatine_g, photo_path, health_source, health_workout_id, calories_kcal, avg_hr, max_hr, hr_zone_minutes, created_at, updated_at'

export const LIFT_COLUMNS =
  'id, muscle_group, exercise_name, sets, reps, weight, unit, sets_detail, prev_sets, prev_reps, prev_weight, prev_sets_detail, sort_order, created_at, updated_at'

export const MEASUREMENT_COLUMNS = 'id, measured_on, weight_kg, body_fat_pct, created_at'

export const num = (v: unknown): number | null => (v == null ? null : Number(v))

export function truncate(s: string | null, max = 200): { text: string | null; cut: boolean } {
  if (s == null) return { text: null, cut: false }
  return s.length > max ? { text: s.slice(0, max), cut: true } : { text: s, cut: false }
}
