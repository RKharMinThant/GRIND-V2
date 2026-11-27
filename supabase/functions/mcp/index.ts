// GRIND remote MCP server: stateless Streamable HTTP on a Supabase Edge Function.
// Tool groups: profile (get_profile, update_settings), logs (list/get/create/update/delete_log,
// log_rest_day), summaries (get_week_summary, get_training_load, get_recent_prs), lifts (board +
// history), measurements, and Fitbit health (get_health_summary, get_readiness, get_body_section,
// get_grind_age; rate-limited by mcp_take), and photos (add_log_photo only: upload, never view).
// Deploy: `npm run mcp:deploy` (= supabase functions deploy mcp --no-verify-jwt). The function
// verifies the OAuth-issued access token itself (and re-checks the session on every request, so a
// revoked grant stops working at once); unauthenticated calls get the `WWW-Authenticate: Bearer
// resource_metadata=...` challenge MCP clients need for discovery.
//
// SECURITY: this function never reads the service role key. Every query runs through the
// caller's user-scoped client (RLS) and also filters on user_id. The bearer token and request
// headers are never logged or returned. OAuth tokens are limited in SQL (migration 021).
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { pipeline } from '@supabase/middleware'
import { withOAuthProtectedResource, withSupabase } from '@supabase/server'
import type { Ctx } from './common.ts'
import { registerHealthTools } from './tools/health.ts'
import { registerLiftTools } from './tools/lifts.ts'
import { registerLogTools } from './tools/logs.ts'
import { registerMeasurementTools } from './tools/measurements.ts'
import { registerPhotoTools } from './tools/photos.ts'
import { registerProfileTools } from './tools/profile.ts'
import { registerSummaryTools } from './tools/summaries.ts'

const INSTRUCTIONS =
  `GRIND is the user's personal workout and health journal. It holds session logs (one row per workout or rest day), a lift board (tracked exercises with per-set reps and weight plus a progress history), body measurements, and optional Fitbit data from Google Health.
Conventions: dates are the user's local calendar date as YYYY-MM-DD. Date-sensitive tools accept an optional IANA time_zone; otherwise they use the time zone of the user's phone, or UTC, and report the zone they used. Body weight is always kg. Each lift has its own weight unit (kg or lb). Durations are minutes; protein and creatine are grams. A rest day is a log whose workout is "Rest", and it counts toward the streak and the weekly session count, as in the app.
Start with get_week_summary for "how am I doing" questions, list_logs for history and list_lifts / get_lift_progress for strength.
Deletes are permanent: before any delete_* call, tell the user exactly what will be removed and wait for a clear yes. Also confirm update_settings changes. Fitbit tools fail when Fitbit isn't connected; the user connects it in GRIND Settings (not possible here). Photos: add_log_photo can attach one image to a log that has none; photos can't be viewed, replaced or removed through this server.`

const env = (k: string) => Deno.env.get(k) || undefined

/** The anon key: the legacy variable, else the first publishable key. Never logged. */
function anonKey(): string {
  const direct = env('SUPABASE_ANON_KEY') ?? env('SUPABASE_PUBLISHABLE_KEY')
  if (direct) return direct
  try {
    const keys = JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS') ?? '{}') as Record<string, string>
    return keys.default ?? Object.values(keys)[0] ?? ''
  } catch {
    return ''
  }
}

function buildServer(ctx: Ctx): McpServer {
  const server = new McpServer({ name: 'grind', title: 'GRIND', version: '1.0.0' }, { instructions: INSTRUCTIONS })
  registerProfileTools(server, ctx) // get_profile, update_settings
  registerLogTools(server, ctx) // list_logs, get_log, create_log, update_log, delete_log, log_rest_day
  registerSummaryTools(server, ctx) // get_week_summary, get_training_load, get_recent_prs
  registerLiftTools(server, ctx) // list_lifts, get_lift_progress, create_lift, log_lift_session, update_lift, delete_lift, delete_lift_entry
  registerMeasurementTools(server, ctx) // add_measurement, list_measurements, delete_measurement
  registerHealthTools(server, ctx) // get_health_summary, get_readiness, get_body_section, get_grind_age
  registerPhotoTools(server, ctx) // add_log_photo (upload only)
  return server
}

const key = anonKey()
// Explicit, so the advertised metadata never depends on how the request URL was proxied
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
// The public address agents connect to: the app's domain, proxied here by a Vercel rewrite.
// Agents check the advertised resource matches the URL they were given.
const PUBLIC_URL = Deno.env.get('MCP_PUBLIC_URL') ?? 'https://grind.andrewmarcello.me/mcp'

export const handler = pipeline(
  [
    // 1. Serves /oauth-protected-resource and adds the WWW-Authenticate challenge to 401s
    withOAuthProtectedResource({
      resourceServer: PUBLIC_URL,
      authorizationServer: `${SUPABASE_URL}/auth/v1`,
    }),
    // 2. Verifies the user's access token and scopes a client to them (RLS applies)
    withSupabase({ auth: 'user', errors: { detailed: false }, ...(key ? { env: { publishableKeys: { default: key } } } : {}) }),
  ],
  async (req, { supabase, userClaims }) => {
    const authorization = req.headers.get('Authorization')
    if (!userClaims || !authorization) {
      return Response.json({ error: 'unauthorized' }, { status: 401 })
    }
    // The JWT alone stays valid until it expires; getUser() asks Auth, which checks the session,
    // so a revoked grant fails here. The outer middleware adds the WWW-Authenticate challenge.
    const { error: sessionError } = await supabase.auth.getUser(authorization.replace(/^Bearer\s+/i, ''))
    if (sessionError) return Response.json({ error: 'unauthorized' }, { status: 401 })
    const ctx: Ctx = {
      db: supabase,
      userId: userClaims.id,
      email: userClaims.email ?? null,
      authorization,
      supabaseUrl: SUPABASE_URL,
      anonKey: key,
    }
    // A fresh server per request: Edge Functions are stateless
    return createMcpHandler(() => buildServer(ctx), {
      onerror: (e) => console.error('mcp error', e.message), // message only
      maxRequestBodySize: 6 * 1024 * 1024, // room for a 3 MB image as base64 (default is 4 MiB)
    }).fetch(req)
  },
)

Deno.serve(handler)
