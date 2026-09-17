// Google OAuth 2.0 helpers for the Google Health API.

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

export const HEALTH_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
]

export class ExpiredGrantError extends Error {
  constructor() {
    super('Google refresh token expired or revoked')
    this.name = 'ExpiredGrantError'
  }
}

export type TokenResponse = {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
}

export function callbackUrl(): string {
  return `${Deno.env.get('SUPABASE_URL')}/functions/v1/health-oauth-callback`
}

function clientCredentials() {
  const id = Deno.env.get('GOOGLE_CLIENT_ID')
  const secret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!id || !secret) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET secrets are not set')
  return { id, secret }
}

export function authorizationUrl(state: string): string {
  const { id } = clientCredentials()
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: callbackUrl(),
    response_type: 'code',
    scope: HEALTH_SCOPES.join(' '),
    access_type: 'offline',
    // Always return a refresh token. Do NOT add include_granted_scopes (breaks mixed-scope tokens).
    prompt: 'consent',
    state,
  })
  return `${GOOGLE_AUTH_URL}?${params}`
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (data?.error === 'invalid_grant') throw new ExpiredGrantError()
    throw new Error(`Google token error: ${data?.error ?? res.status} ${data?.error_description ?? ''}`.trim())
  }
  return data as TokenResponse
}

export function exchangeCode(code: string): Promise<TokenResponse> {
  const { id, secret } = clientCredentials()
  return tokenRequest({
    code,
    client_id: id,
    client_secret: secret,
    redirect_uri: callbackUrl(),
    grant_type: 'authorization_code',
  })
}

export function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const { id, secret } = clientCredentials()
  return tokenRequest({
    refresh_token: refreshToken,
    client_id: id,
    client_secret: secret,
    grant_type: 'refresh_token',
  })
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }).catch(() => undefined)
}
