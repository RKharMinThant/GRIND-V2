import { useState, type FormEvent } from 'react'
import { usePresence } from '../hooks/usePresence'
import { ageGapLabel, formatPace, formatYears, parseMeasurement, type GrindAgeOk } from '../health/grindAge'
import { toLocalDateString } from '../lib/dates'
import { supabase } from '../lib/supabase'

type Props = {
  open: boolean
  data: GrindAgeOk | null
  /** Recompute after a new measurement. */
  onRefresh: () => Promise<boolean>
  onClose: () => void
}

const yearsTone = (years: number | null) =>
  years == null || Math.abs(years) <= 0.05 ? 'flat' : years < 0 ? 'young' : 'old'

function formatValue(value: number, unit: string): string {
  const shown = Number.isInteger(value) ? value.toLocaleString() : String(Math.round(value * 10) / 10)
  return `${shown} ${unit}`
}

/** The breakdown behind the GRIND Age number, plus a quick way to log weight and body fat. */
export function GrindAgeSheet({ open, data, onRefresh, onClose }: Props) {
  const { mounted, visible } = usePresence(open && Boolean(data), 380)
  const [weight, setWeight] = useState('')
  const [bodyFat, setBodyFat] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  if (!mounted || !data) return null

  const { result, pace } = data

  async function save(e: FormEvent) {
    e.preventDefault()
    const parsed = parseMeasurement(weight, bodyFat)
    if ('error' in parsed) {
      setMessage({ text: parsed.error, ok: false })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const { error } = await supabase.from('body_measurements').insert({
        measured_on: toLocalDateString(),
        weight_kg: parsed.weightKg,
        body_fat_pct: parsed.bodyFatPct,
      })
      if (error) throw error
      setWeight('')
      setBodyFat('')
      setMessage({ text: 'Saved. Updating your GRIND Age…', ok: true })
      const updated = await onRefresh()
      setMessage({ text: updated ? 'Saved' : 'Saved — your GRIND Age will update next time.', ok: true })
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Could not save', ok: false })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={`overlay ${visible ? 'is-visible' : 'is-closing'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="grind-age-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && visible) onClose()
      }}
    >
      <div className="sheet sheet--grind-age">
        <div className="sheet-header">
          <div className="sheet-title" id="grind-age-title">
            GRIND Age
          </div>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="sheet-body">
          <div className="grind-age-main">
            <span className="grind-age-num">{result.grindAge.toFixed(1)}</span>
            <div className="grind-age-meta">
              <span>{ageGapLabel(result)}</span>
              <span className="grind-age-pace">Real age {result.chronologicalAge.toFixed(1)}</span>
              {pace != null && <span className="grind-age-pace">Pace of aging {formatPace(pace)}</span>}
            </div>
          </div>

          <ul className="grind-age-factors">
            {result.factors.map((f) => (
              <li key={f.id} className="grind-age-factor">
                <div className="grind-age-factor-main">
                  <span className="grind-age-factor-label">
                    {f.label}
                    {f.estimated && <span className="grind-age-tag">estimate</span>}
                  </span>
                  <span className="grind-age-factor-value">
                    {f.value == null ? 'Not enough data' : formatValue(f.value, f.unit)}
                    <span className="grind-age-factor-target"> · target {f.target}</span>
                  </span>
                </div>
                <span className="grind-age-years" data-tone={yearsTone(f.years)}>
                  {f.years == null ? '—' : formatYears(f.years)}
                </span>
              </li>
            ))}
          </ul>

          <form className="grind-age-form" onSubmit={(e) => void save(e)}>
            <h3 className="grind-age-form-title">Log a measurement</h3>
            <div className="field-row">
              <div className="field">
                <label htmlFor="gaWeight">Weight (kg)</label>
                <input
                  id="gaWeight"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={25}
                  max={350}
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="gaFat">Body fat % (optional)</label>
                <input
                  id="gaFat"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={3}
                  max={70}
                  value={bodyFat}
                  onChange={(e) => setBodyFat(e.target.value)}
                />
              </div>
            </div>
            {message && (
              <div className={message.ok ? 'settings-note' : 'auth-error'} role="status">
                {message.text}
              </div>
            )}
            <button type="submit" className="btn btn-primary btn-full" disabled={busy || !weight.trim()}>
              {busy ? 'Saving…' : 'Save measurement'}
            </button>
          </form>

          <p className="settings-note grind-age-disclaimer">
            An estimate from your own data — not medical advice. Updated weekly.
          </p>
        </div>
      </div>
    </div>
  )
}
