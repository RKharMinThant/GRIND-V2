import type { Log, TrackedLift } from '../types/database'

const CSV_COLUMNS = [
  'date',
  'workout',
  'type',
  'focus_areas',
  'duration',
  'protein_g',
  'creatine_g',
  'calories_kcal',
  'avg_hr',
  'max_hr',
  'meal',
  'notes',
] as const

function csvCell(value: unknown): string {
  if (value == null) return ''
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Sessions as CSV, oldest first, for spreadsheets. */
export function logsToCsv(logs: Log[]): string {
  const rows = [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date))
  const lines = [CSV_COLUMNS.join(',')]
  for (const l of rows) {
    lines.push(
      [
        l.log_date,
        l.workout,
        l.workout_type,
        l.focus_areas,
        l.duration,
        l.protein_g,
        l.creatine_g,
        l.calories_kcal,
        l.avg_hr,
        l.max_hr,
        l.meal,
        l.notes,
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return lines.join('\n') + '\n'
}

/** Everything the app holds, for a backup you can read later. */
export function buildExportJson(logs: Log[], lifts: TrackedLift[]): string {
  return JSON.stringify(
    {
      app: 'GRIND',
      exportedAt: new Date().toISOString(),
      counts: { sessions: logs.length, lifts: lifts.length },
      sessions: [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date)),
      lifts,
    },
    null,
    2,
  )
}

/** Save text to a file from the browser (no server involved). */
export function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give Safari a moment before revoking
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportFilename(ext: 'json' | 'csv'): string {
  return `grind-export-${new Date().toISOString().slice(0, 10)}.${ext}`
}
