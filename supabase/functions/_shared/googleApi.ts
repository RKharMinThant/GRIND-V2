// Google Health API v4 calls. Filter field names come from the API reference and are not yet
// verified against live responses — if a call returns 400, adjust the FILTERS below.

import type { GDataPoint, GRollupPoint } from './normalize.ts'

const BASE = 'https://health.googleapis.com/v4/users/me/dataTypes'
const MAX_ROLLUP_DAYS = 90

export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`Google Health API ${status}: ${detail}`)
    this.name = 'GoogleApiError'
  }
}

/** Dates are YYYY-MM-DD (civil / the user's local time). */
export const FILTERS = {
  exercise: (from: string) => `exercise.interval.civil_start_time >= "${from}"`,
  sleep: (from: string) => `sleep.interval.civil_end_time >= "${from}"`,
  dailyRestingHeartRate: (from: string) => `dailyRestingHeartRate.date >= "${from}"`,
  dailyHeartRateVariability: (from: string) => `dailyHeartRateVariability.date >= "${from}"`,
}

async function call(accessToken: string, url: string, init?: RequestInit): Promise<GDataPoint> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text()
  if (!res.ok) throw new GoogleApiError(res.status, text.slice(0, 500))
  return text ? JSON.parse(text) : {}
}

export async function listAll(
  accessToken: string,
  dataType: string,
  filter: string,
  maxPages = 10,
): Promise<GDataPoint[]> {
  const out: GDataPoint[] = []
  let pageToken: string | undefined
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({ filter, pageSize: '1000' })
    if (pageToken) params.set('pageToken', pageToken)
    const data = await call(accessToken, `${BASE}/${dataType}/dataPoints?${params}`)
    out.push(...(data.dataPoints ?? []))
    pageToken = data.nextPageToken
    if (!pageToken) break
  }
  return out
}

function civil(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return { date: { year, month, day }, time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 } }
}

function addDaysIso(date: string, delta: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10)
}

/** Daily step totals for [from, to] inclusive, in ≤90-day windows. */
export async function dailyStepsRollUp(accessToken: string, from: string, to: string): Promise<GRollupPoint[]> {
  const out: GRollupPoint[] = []
  for (let start = from; start <= to; start = addDaysIso(start, MAX_ROLLUP_DAYS)) {
    const endExclusive = [addDaysIso(start, MAX_ROLLUP_DAYS), addDaysIso(to, 1)].sort()[0]
    let pageToken: string | undefined
    do {
      const data = await call(accessToken, `${BASE}/steps/dataPoints:dailyRollUp`, {
        method: 'POST',
        body: JSON.stringify({ range: { start: civil(start), end: civil(endExclusive) }, pageToken }),
      })
      out.push(...(data.rollupDataPoints ?? []))
      pageToken = data.nextPageToken
    } while (pageToken)
  }
  return out
}
