// The user's wall clock, from the IANA zone their phone reported at subscribe time.
// Rules are written in local terms ("evening"), so everything downstream needs this.

export type LocalParts = {
  /** YYYY-MM-DD in the user's zone. */
  day: string
  /** 0–23 in the user's zone. */
  hour: number
}

export function localParts(now: Date, timeZone: string): LocalParts {
  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    })
  } catch {
    // A stored zone we can't parse must not abort the whole run
    return localParts(now, 'UTC')
  }

  const parts: Record<string, string> = {}
  for (const p of formatter.formatToParts(now)) parts[p.type] = p.value

  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    // hour12:false yields "24" at midnight in some locales
    hour: Number(parts.hour) % 24,
  }
}
