// Health-specific wording on top of the shared Edge Function error helpers.
export { isAuthFailure, type FunctionErrorPayload } from '../lib/invokeFunction'

import type { FunctionErrorPayload } from '../lib/invokeFunction'

/** Readable message for the UI, preferring the most specific field available. */
export function functionErrorMessage(status: number, payload: FunctionErrorPayload): string {
  const specific = payload?.detail || payload?.message || payload?.error
  if (status === 404 && payload?.error === 'not_connected') return 'Fitbit is not connected'
  if (specific) return String(specific).slice(0, 140)
  return `Fitbit request failed (${status})`
}
