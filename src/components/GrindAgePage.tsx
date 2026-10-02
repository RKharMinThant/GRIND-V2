import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import {
  FACTOR_GROUPS,
  ageGap,
  ageGapLabel,
  factorTip,
  formatFactorValue,
  formatGap,
  formatPace,
  formatYears,
  gapSentence,
  gapSublabel,
  gapTone,
  groupYears,
  missingHint,
  paceSublabel,
  paceTone,
  paceWeeksToGo,
  parseMeasurement,
  PACE_SPAN_WEEKS,
  trendPoints,
  type GrindAgeFactor,
  type GrindAgeOk,
} from '../health/grindAge'
import type { GrindAgeState } from '../hooks/useGrindAge'
import { useElementWidth } from '../hooks/useElementWidth'
import { friendlyDateShort, toLocalDateString } from '../lib/dates'
import { supabase } from '../lib/supabase'
import { AgeTrend } from './charts/AgeTrend'
import { ArcGauge } from './charts/ArcGauge'

type Props = {
  grindAge: GrindAgeState
  /** Fitbit is linked. When it isn't, the hook sits idle with no data, so say so instead of showing a skeleton. */
  connected: boolean
  onBack: () => void
  onOpenSettings: () => void
}

const GAUGE_MAX = 300
/** A factor this many years from target fills its whole half of the bar */
const BAR_FULL_YEARS = 1.5

const yearsDir = (years: number | null) =>
  years == null || Math.abs(years) <= 0.05 ? 'flat' : years < 0 ? 'young' : 'old'

function BackHeader({ onBack, children }: { onBack: () => void; children?: ReactNode }) {
  return (
    <div className="set-head ga-head">
      <button type="button" className="set-back" onClick={onBack} aria-label="Back">
        <svg viewBox="0 0 12 20" aria-hidden>
          <path d="M10 2 2 10l8 8" />
        </svg>
        Back
      </button>
      {children}
      <h1 className="page-title">GRIND Age</h1>
    </div>
  )
}

/** Full page behind the Home card: the hero reading, pace, trend, what drives it, and a quick way to log weight. */
export function GrindAgePage({ grindAge, connected, onBack, onOpenSettings }: Props) {
  const { data, loading, error, refresh } = grindAge

  // A pushed page opens at the top, whatever the previous tab's scroll was
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  if (connected && data?.status === 'ok') {
    return <GrindAgeBody data={data} error={error} onBack={onBack} onRefresh={refresh} />
  }

  let body: ReactNode
  if (!connected || data?.status === 'not_connected') {
    body = (
      <div className="card ga-state">
        <p className="t-subhead">Connect Fitbit in Settings to see your GRIND Age.</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={onOpenSettings}>
          Open Settings
        </button>
      </div>
    )
  } else if (data?.status === 'needs_profile') {
    body = (
      <div className="card ga-state">
        <p className="t-subhead">Add your birth date and sex to see your GRIND Age.</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={onOpenSettings}>
          Open Settings
        </button>
      </div>
    )
  } else if (error) {
    body = (
      <div className="card ga-state">
        <p className="t-subhead">Couldn’t load your GRIND Age.</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void refresh()} disabled={loading}>
          Retry
        </button>
      </div>
    )
  } else {
    body = (
      <div className="card ga-skel" aria-hidden>
        <span className="ga-skel__dial" />
        <span className="ga-skel__line" />
        <span className="ga-skel__line ga-skel__line--short" />
      </div>
    )
  }

  return (
    <div className="page ga-page" aria-busy={connected && !data && !error}>
      <BackHeader onBack={onBack} />
      {body}
    </div>
  )
}

function GrindAgeBody({
  data,
  error,
  onBack,
  onRefresh,
}: {
  data: GrindAgeOk
  error: string | null
  onBack: () => void
  onRefresh: () => Promise<boolean>
}) {
  const { result, pace, history } = data
  const chrono = result.chronologicalAge
  const gap = ageGap(result)
  const tone = gapTone(gap)
  const points = trendPoints(data)

  const first = points[0]
  const trendNote =
    points.length >= 2
      ? `${formatYears(points[points.length - 1].grindAge - first.grindAge)} since ${friendlyDateShort(first.weekStart)}`
      : null

  return (
    <div className="page ga-page">
      <BackHeader onBack={onBack}>
        <p className="t-eyebrow ga-eyebrow">Updated weekly · week of {friendlyDateShort(data.weekStart)}</p>
      </BackHeader>
      {error && (
        <p className="t-footnote ga-stale" role="status">
          Couldn’t update just now.
        </p>
      )}

      <Hero data={data} gap={gap} tone={tone} />
      <PaceCard pace={pace} history={history} weekStart={data.weekStart} />

      <div className="section-header">
        <h2>Trend</h2>
        {trendNote && <span className="section-header-note">{trendNote}</span>}
      </div>
      <div className="card">
        <AgeTrend
          points={points}
          chronologicalAge={chrono}
          tone={tone}
          ariaLabel={`GRIND Age by week, from ${first.grindAge.toFixed(1)} to ${points[points.length - 1].grindAge.toFixed(1)}. Real age ${chrono.toFixed(1)}.`}
        />
      </div>

      <div className="section-header">
        <h2>Drivers</h2>
      </div>
      {FACTOR_GROUPS.map((group) => {
        const factors = group.factors
          .map((id) => result.factors.find((f) => f.id === id))
          .filter((f): f is GrindAgeFactor => Boolean(f))
        if (factors.length === 0) return null
        const net = groupYears(result, group.id)
        return (
          <section key={group.id} className="ga-group t-tone" data-tone={group.tone} aria-label={group.label}>
            <div className="ga-group-head">
              <h3 className="ga-group-title">{group.label}</h3>
              <span className="num ga-group-net" data-dir={yearsDir(net)}>
                {net == null ? '—' : formatYears(net)}
              </span>
            </div>
            <ul className="list-group ga-factors">
              {factors.map((f) => (
                <FactorRow key={f.id} factor={f} />
              ))}
            </ul>
          </section>
        )
      })}

      <MeasurementForm onRefresh={onRefresh} />

      <p className="t-footnote ga-disclaimer">An estimate from your own data — not medical advice. Updated weekly.</p>
    </div>
  )
}

function Hero({ data, gap, tone }: { data: GrindAgeOk; gap: number; tone: ReturnType<typeof gapTone> }) {
  const { result, pace } = data
  const chrono = result.chronologicalAge
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const size = Math.min(GAUGE_MAX, width || GAUGE_MAX)
  const min = chrono - 6
  const max = chrono + 6

  return (
    <section className="card instrument ga-hero" data-tone={tone} aria-label="GRIND Age">
      <div ref={ref} className="ga-hero-gauge">
        <ArcGauge
          sweep={240}
          size={size}
          value={result.grindAge}
          min={min}
          max={max}
          fillFrom={chrono}
          marker={{ value: chrono, label: 'Real age' }}
          bands={[
            { from: min, to: chrono, tone: 'accent' },
            { from: chrono, to: max, tone: 'danger' },
          ]}
          endLabels={['Younger', 'Older']}
          tone={tone}
          label={result.grindAge.toFixed(1)}
          sublabel={gapSublabel(gap)}
          eyebrow="GRIND AGE"
          countUp
          decimals={1}
          ariaLabel={`GRIND Age ${result.grindAge.toFixed(1)}. ${ageGapLabel(result)}.`}
        />
      </div>

      <div className="ga-stats">
        <div className="ga-stat">
          <span className="t-display t-display--m">{chrono.toFixed(1)}</span>
          <span className="t-eyebrow">Real age</span>
        </div>
        <div className="ga-stat">
          <span className="t-display t-display--m ga-stat__tone">{formatGap(gap)}</span>
          <span className="t-eyebrow">Gap</span>
        </div>
        <div className="ga-stat">
          <span className="t-display t-display--m">{pace == null ? '—' : formatPace(pace)}</span>
          <span className="t-eyebrow">Pace</span>
        </div>
      </div>

      <p className="t-subhead ga-sentence">{gapSentence(gap)}</p>
    </section>
  )
}

function PaceCard({
  pace,
  history,
  weekStart,
}: {
  pace: number | null
  history: GrindAgeOk['history']
  weekStart: string
}) {
  if (pace == null) {
    const { weeksToGo, filled, needsReadings } = paceWeeksToGo(history, weekStart)
    return (
      <section className="card instrument ga-pace" data-tone="accent" aria-label="Pace of ageing">
        <h2 className="ga-pace-title">Pace of ageing unlocks soon</h2>
        <div
          className="ga-dots"
          role="img"
          aria-label={`${filled} of ${PACE_SPAN_WEEKS} weeks`}
        >
          {Array.from({ length: PACE_SPAN_WEEKS }, (_, i) => (
            <span key={i} className="ga-dot" data-filled={i < filled} />
          ))}
        </div>
        <p className="t-subhead ga-pace-sub">
          {needsReadings
            ? 'Pace needs a few more recent weekly readings'
            : `About ${weeksToGo} more ${weeksToGo === 1 ? 'week' : 'weeks'} to go`}
        </p>
      </section>
    )
  }

  const tone = paceTone(pace)
  return (
    <section className="card instrument ga-pace" data-tone={tone} aria-label="Pace of ageing">
      <p className="t-eyebrow t-tone">Pace of ageing</p>
      <PaceDial pace={pace} tone={tone} />
      <p className="t-footnote ga-pace-note">
        How fast your GRIND Age has moved over the last 6 months, per calendar year.
      </p>
    </section>
  )
}

// Own component so the width observer mounts with the dial, not with the empty state
function PaceDial({ pace, tone }: { pace: number; tone: ReturnType<typeof paceTone> }) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const size = Math.min(GAUGE_MAX, width || GAUGE_MAX)
  return (
    <div ref={ref} className="ga-pace-gauge">
      <ArcGauge
        sweep={180}
        size={size}
        value={pace}
        // Real paces cluster around 1×; the full −1…3 range would park 0.8× on the marker
        min={0}
        max={2}
        fillFrom={1}
        marker={{ value: 1, label: '1.0× calendar' }}
        tone={tone}
        label={formatPace(pace)}
        sublabel={paceSublabel(pace)}
        ariaLabel={`Pace of ageing ${formatPace(pace)}. ${paceSublabel(pace)}.`}
      />
    </div>
  )
}

function FactorRow({ factor: f }: { factor: GrindAgeFactor }) {
  const missing = f.value == null || f.years == null
  const dir = yearsDir(f.years)
  const fill = f.years == null ? 0 : Math.min(1, Math.abs(f.years) / BAR_FULL_YEARS)

  return (
    <li className="list-row ga-factor">
      <div className="ga-factor-main">
        <span className="ga-factor-label">
          {f.label}
          {f.estimated && <span className="chip ga-tag">estimate</span>}
        </span>
        <span className="t-footnote ga-factor-value">
          {missing ? (
            'Not enough data'
          ) : (
            <>
              {formatFactorValue(f.value as number, f.unit)}
              <span> · target {f.target}</span>
            </>
          )}
        </span>
      </div>
      <span className="num ga-years" data-dir={dir}>
        {f.years == null ? '—' : formatYears(f.years)}
      </span>

      {!missing && (
        <div className="ga-bar" data-dir={dir} style={{ '--ga-fill': fill } as CSSProperties} aria-hidden>
          <span className="ga-bar__fill" />
        </div>
      )}

      {missing ? (
        <p className="t-footnote ga-factor-note">{missingHint(f.id)}</p>
      ) : (
        f.years != null &&
        f.years > 0.05 && <p className="t-footnote ga-factor-note">{factorTip(f.id)}</p>
      )}
    </li>
  )
}

function MeasurementForm({ onRefresh }: { onRefresh: () => Promise<boolean> }) {
  const [weight, setWeight] = useState('')
  const [bodyFat, setBodyFat] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

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
    <form className="ga-form" onSubmit={(e) => void save(e)}>
      <div className="section-header">
        <h2>Log a measurement</h2>
      </div>
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
        <p className="t-footnote ga-msg" data-ok={message.ok} role="status">
          {message.text}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-lg btn-full ga-save" disabled={busy || !weight.trim()}>
        {busy ? 'Saving…' : 'Save measurement'}
      </button>
    </form>
  )
}
