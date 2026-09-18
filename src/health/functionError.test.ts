import { describe, expect, it } from 'vitest'
import { functionErrorMessage, isAuthFailure } from './functionError'

describe('isAuthFailure', () => {
  it('recognises a stale Supabase login', () => {
    expect(isAuthFailure(401, { code: 'UNAUTHORIZED_LEGACY_JWT', message: 'Invalid JWT' })).toBe(true)
    expect(isAuthFailure(401, { error: 'unauthorized' })).toBe(true)
    expect(isAuthFailure(401, null)).toBe(true)
  })
  it('leaves other failures alone', () => {
    expect(isAuthFailure(502, { error: 'google', detail: 'quota' })).toBe(false)
    expect(isAuthFailure(404, { error: 'not_connected' })).toBe(false)
  })
})

describe('functionErrorMessage', () => {
  it('prefers the most specific field', () => {
    expect(functionErrorMessage(502, { error: 'google', detail: 'Invalid data point filter' })).toBe(
      'Invalid data point filter',
    )
    expect(functionErrorMessage(401, { code: 'X', message: 'Invalid JWT' })).toBe('Invalid JWT')
    expect(functionErrorMessage(404, { error: 'not_connected' })).toBe('Fitbit is not connected')
    expect(functionErrorMessage(500, null)).toBe('Fitbit request failed (500)')
  })
  it('keeps messages short enough for the UI', () => {
    expect(functionErrorMessage(502, { detail: 'x'.repeat(500) })).toHaveLength(140)
  })
})
