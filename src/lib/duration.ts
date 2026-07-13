/** Duration stored as "1h 20m" / "45m" / "2h" for display & DB text field. */

export function formatDuration(hours: number, minutes: number): string | null {
  const h = Math.max(0, Math.min(12, Math.floor(hours)))
  const m = Math.max(0, Math.min(59, Math.floor(minutes)))
  if (h === 0 && m === 0) return null
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function parseDuration(value: string | null | undefined): { hours: number; minutes: number } {
  if (!value?.trim()) return { hours: 0, minutes: 0 }
  const s = value.trim().toLowerCase()

  // "1h 20m", "1h20m", "1 hr 20 min"
  const hm = s.match(/(?:(\d+)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?/)
  if (hm && (hm[1] || hm[2])) {
    return {
      hours: hm[1] ? Number(hm[1]) : 0,
      minutes: hm[2] ? Number(hm[2]) : 0,
    }
  }

  // plain minutes number
  if (/^\d+$/.test(s)) {
    const total = Number(s)
    return { hours: Math.floor(total / 60), minutes: total % 60 }
  }

  return { hours: 0, minutes: 0 }
}

export const HOUR_OPTIONS = Array.from({ length: 13 }, (_, i) => i) // 0–12
export const MINUTE_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
