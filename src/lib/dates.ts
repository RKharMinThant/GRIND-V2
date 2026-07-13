/** Local calendar date helpers — avoid UTC off-by-one from toISOString(). */

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Format a Date as local YYYY-MM-DD */
export function toLocalDateString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Parse YYYY-MM-DD as local midnight */
export function parseLocalDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function friendlyDate(str: string): string {
  return parseLocalDate(str).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function friendlyDateShort(str: string): string {
  return parseLocalDate(str).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/** Format ISO / timestamptz for list meta (local date). */
export function friendlyUpdatedAt(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function addDays(dateStr: string, delta: number): string {
  const d = parseLocalDate(dateStr)
  d.setDate(d.getDate() + delta)
  return toLocalDateString(d)
}

export function startOfWeekSunday(dateStr: string): string {
  const d = parseLocalDate(dateStr)
  d.setDate(d.getDate() - d.getDay())
  return toLocalDateString(d)
}

export function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7)
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

export function monthTitle(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

export function todayHeading(d: Date = new Date()): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function greetingForHour(hour = new Date().getHours()): string {
  if (hour < 5) return 'Still grinding'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  if (hour < 21) return 'Good evening'
  return 'Night session'
}

export function monthLabelFromKey(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

/** Unique session days in the local week containing `today` (Sun–Sat). */
export function weekSessionCount(logDates: string[], today = toLocalDateString()): number {
  const start = startOfWeekSunday(today)
  const set = new Set(logDates)
  let n = 0
  for (let i = 0; i < 7; i++) {
    if (set.has(addDays(start, i))) n += 1
  }
  return n
}
