// Loads a user's Google connection and returns a fresh access token (refreshing when needed).
// `resolveAccessToken` is the plain result for callers with no request to answer (the
// scheduler); `getAccessToken` wraps it in the HTTP responses the browser-facing functions use.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json } from './cors.ts'
import { ExpiredGrantError, refreshAccessToken } from './google.ts'

export type TokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'not_connected' | 'expired' | 'refresh_failed'; detail?: string }

export async function resolveAccessToken(db: SupabaseClient, userId: string): Promise<TokenResult> {
  const { data: conn } = await db
    .from('health_connections')
    .select('refresh_token, access_token, access_expires_at, status')
    .eq('user_id', userId)
    .maybeSingle()
  if (!conn) return { ok: false, reason: 'not_connected' }
  if (conn.status === 'expired') return { ok: false, reason: 'expired' }

  if (conn.access_token && conn.access_expires_at && Date.parse(conn.access_expires_at) > Date.now() + 60_000) {
    return { ok: true, token: conn.access_token as string }
  }

  try {
    const t = await refreshAccessToken(conn.refresh_token)
    await db
      .from('health_connections')
      .update({
        access_token: t.access_token,
        access_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
        ...(t.refresh_token ? { refresh_token: t.refresh_token } : {}),
      })
      .eq('user_id', userId)
    return { ok: true, token: t.access_token }
  } catch (e) {
    if (e instanceof ExpiredGrantError) {
      await db.from('health_connections').update({ status: 'expired' }).eq('user_id', userId)
      return { ok: false, reason: 'expired' }
    }
    return { ok: false, reason: 'refresh_failed', detail: (e as Error).message }
  }
}

export async function getAccessToken(req: Request, db: SupabaseClient, userId: string): Promise<string | Response> {
  const result = await resolveAccessToken(db, userId)
  if (result.ok) return result.token
  if (result.reason === 'not_connected') return json(req, { error: 'not_connected' }, 404)
  if (result.reason === 'expired') return json(req, { error: 'expired' }, 409)
  return json(req, { error: 'token_refresh_failed', detail: result.detail }, 502)
}

/** Force a token refresh on the next call (Google rejected the current one). */
export async function invalidateAccessToken(db: SupabaseClient, userId: string): Promise<void> {
  await db.from('health_connections').update({ access_expires_at: null }).eq('user_id', userId)
}
