import { useRef, useState, type FormEvent } from 'react'
import { ageGapLabel, formatPace, formatYears, parseMeasurement, type GrindAgeOk } from '../health/grindAge'
import { toLocalDateString } from '../lib/dates'
import { supabase } from '../lib/supabase'
import { GapArrow } from './GrindAgeCard'
import { Sheet, SheetCancel, SheetHeader } from './Sheet'

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
export function GrindAgeSheet({ open, data: dataProp, onRefresh, onClose }: Props) {
  // Keep the reading on screen while the sheet slides away
  const lastData = useRef<GrindAgeOk | null>(dataProp)
  if (dataProp) lastData.current = dataProp
  const data = dataProp ?? lastData.current
  const [weight, setWeight] = useState('')
  const [bodyFat, setBodyFat] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  if (!data) return null

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

  const gap = Math.round((result.grindAge - result.chronologicalAge) * 10) / 10

  return (
    <Sheet
      open={open && Boolean(dataProp)}
      onClose={onClose}
      className="sheet--grind-age"
      labelledBy="grind-age-title"
      header={
        <SheetHeader
          title="GRIND Age"
          titleId="grind-age-title"
          trailing={<SheetCancel primary>Done</SheetCancel>}
        />
      }
    >
      <div className="ga-summary">
        <span className="num t-large-title grind-age-num">{result.grindAge.toFixed(1)}</span>
        <p className="t-subhead ga-gap">
          <GapArrow result={result} />
          <span>{ageGapLabel(result)}</span>
        </p>
        <div className="ga-summary-meta">
          <span className="chip">Real age {result.chronologicalAge.toFixed(1)}</span>
          {pace != null && <span className="chip">Pace of aging {formatPace(pace)}</span>}
          {Math.abs(gap) < 0.05 && <span className="chip chip--accent">On par</span>}
        </div>
      </div>

      <div className="sheet-label">What moves it</div>
      <ul className="list-group ga-factors">
        {result.factors.map((f) => (
          <li key={f.id} className="list-row ga-factor">
            <div className="ga-factor-main">
              <span className="ga-factor-label">
                {f.label}
                {f.estimated && <span className="chip ga-tag">estimate</span>}
              </span>
              <span className="t-footnote ga-factor-value">
                {f.value == null ? 'Not enough data' : formatValue(f.value, f.unit)}
                <span> · target {f.target}</span>
              </span>
            </div>
            <span className="num ga-years" data-tone={yearsTone(f.years)}>
              {f.years == null ? '—' : formatYears(f.years)}
            </span>
          </li>
        ))}
      </ul>

      <form className="ga-form" onSubmit={(e) => void save(e)}>
        <div className="sheet-label">Log a measurement</div>
        <div className="list-group">
          <label className="list-row" htmlFor="gaWeight">
            <span className="list-row-label">Weight</span>
            <input
              id="gaWeight"
              className="list-row-input num"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={25}
              max={350}
              placeholder="0.0"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
            <span className="list-row-unit">kg</span>
          </label>
          <label className="list-row" htmlFor="gaFat">
            <span className="list-row-label">Body fat</span>
            <input
              id="gaFat"
              className="list-row-input num"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={3}
              max={70}
              placeholder="Optional"
              value={bodyFat}
              onChange={(e) => setBodyFat(e.target.value)}
            />
            <span className="list-row-unit">%</span>
          </label>
        </div>
        {message && (
          <p
            className={message.ok ? 'sheet-note' : 'sheet-error'}
            data-ok={message.ok}
            role="status"
            style={{ marginTop: 12, marginBottom: 0 }}
          >
            {message.text}
          </p>
        )}
        <button
          type="submit"
          className="btn btn-primary btn-lg btn-full ga-save"
          disabled={busy || !weight.trim()}
        >
          {busy ? 'Saving…' : 'Save measurement'}
        </button>
      </form>

      <p className="t-footnote ga-disclaimer">
        An estimate from your own data — not medical advice. Updated weekly.
      </p>
    </Sheet>
  )
}
