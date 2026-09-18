/** Shape of the JSON our Edge Functions and the Supabase gateway return on failure. */
export type FunctionErrorPayload = {
  error?: string
  detail?: string
  message?: string
  code?: string
} | null

/** True when the failure is only a stale Supabase login: refreshing and retrying fixes it. */
export function isAuthFailure(status: number, payload: FunctionErrorPayload): boolean {
  if (status !== 401) return false
  const code = payload?.code ?? ''
  const message = payload?.message ?? payload?.error ?? ''
  return /JWT|unauthorized|token/i.test(`${code} ${message}`) || !payload
}

/** Readable message for the UI, preferring the most specific field available. */
export function functionErrorMessage(status: number, payload: FunctionErrorPayload): string {
  const specific = payload?.detail || payload?.message || payload?.error
  if (status === 404 && payload?.error === 'not_connected') return 'Fitbit is not connected'
  if (specific) return String(specific).slice(0, 140)
  return `Fitbit request failed (${status})`
}
