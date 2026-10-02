import { useEffect, useMemo, useRef, useState } from 'react'
import { friendlyUpdatedAt } from '../lib/dates'
import {
  compareTrackedLift,
  formatSetsDetail,
  getLiftSets,
  getPrevLiftSets,
  volumeOf,
  type LiftHistoryPoint,
} from '../lib/overload'
import { bestOneRepMax, convertSets, personalBests } from '../lib/strength'
import type { TrackedLift } from '../types/database'
import { Sparkline } from './charts/Sparkline'
import { Sheet, SheetAction, SheetCancel, SheetHeader } from './Sheet'

type Props = {
  lift: TrackedLift | null
  fetchHistory: (liftId: string, limit?: number) => Promise<LiftHistoryPoint[]>
  onClose: () => void
  onEdit: (lift: TrackedLift) => void
  onDelete: (lift: TrackedLift) => Promise<void>
}

export function LiftProgressSheet({
  lift: liftProp,
  fetchHistory,
  onClose,
  onEdit,
  onDelete,
}: Props) {
  const open = Boolean(liftProp)
  // Keep the last lift on screen while the sheet slides away
  const lastLift = useRef<TrackedLift | null>(liftProp)
  if (liftProp) lastLift.current = liftProp
  const lift = liftProp ?? lastLift.current
  const lastId = useRef<string | null>(null)
  const [history, setHistory] = useState<LiftHistoryPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!liftProp) {
      setConfirmDelete(false)
      setBusy(false)
      setError(null)
      return
    }
    const lift = liftProp
    if (lastId.current !== lift.id) {
      lastId.current = lift.id
      setHistory([])
    }
    setConfirmDelete(false)
    setBusy(false)
    setError(null)
    let cancelled = false
    setLoading(true)
    void fetchHistory(lift.id, 500).then((rows) => {
      if (!cancelled) {
        setHistory(rows)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [liftProp, fetchHistory])

  const current = useMemo(() => (lift ? getLiftSets(lift) : []), [lift])
  const previous = lift ? getPrevLiftSets(lift) : null
  const status = lift ? compareTrackedLift(lift) : null
  const unit = lift?.unit || 'kg'
  const curVol = volumeOf(current)
  const prevVol = previous ? volumeOf(previous) : null

  const chart = useMemo(() => {
    const points =
      history.length > 0
        ? history
        : lift
          ? [
              {
                id: 'cur',
                lift_id: lift.id,
                sets_detail: current,
                unit,
                volume: curVol,
                recorded_at: lift.updated_at,
              },
            ]
          : []
    const maxVol = Math.max(1, ...points.map((p) => p.volume))
    return points.slice(-12).map((p) => ({
      ...p,
      pct: Math.max(6, Math.round((p.volume / maxVol) * 100)),
    }))
  }, [history, lift, current, unit, curVol])

  const strength = useMemo(() => {
    const u: 'kg' | 'lb' = unit === 'lb' ? 'lb' : 'kg'
    // No history rows yet: fall back to the lift's current sets, like the volume chart
    const source: LiftHistoryPoint[] =
      history.length > 0
        ? history
        : lift && current.length > 0
          ? [
              {
                id: 'cur',
                lift_id: lift.id,
                sets_detail: current,
                unit: u,
                volume: curVol,
                recorded_at: lift.updated_at,
              },
            ]
          : []
    const trend = history.map((p) =>
      bestOneRepMax(convertSets(p.sets_detail, p.unit === 'lb' ? 'lb' : 'kg', u)),
    )
    return { u, trend, bests: personalBests(source, u) }
  }, [history, lift, current, unit, curVol])

  if (!lift) return null
  const shown = lift

  async function handleDelete() {
    if (!lift) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onDelete(lift)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  const titleId = 'lift-progress-title'
  const arrowTone = status?.status === 'up' ? 'up' : status?.status === 'down' ? 'down' : 'flat'
  const latest1rm = strength.trend.length >= 2 ? strength.trend[strength.trend.length - 1] : null

  return (
    <Sheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      labelledBy={titleId}
      className="sheet--lift"
      header={
        <SheetHeader
          title="Progress"
          leading={<SheetCancel disabled={busy}>Close</SheetCancel>}
          trailing={
            <SheetAction primary onClick={() => onEdit(shown)} disabled={busy || confirmDelete}>
              Edit
            </SheetAction>
          }
        />
      }
    >
      {error && (
        <div className="sheet-error" role="alert">
          {error}
        </div>
      )}

      <div className="sheet-title-block">
        <h2 id={titleId} className="t-title2">
          {shown.exercise_name}
        </h2>
        <p className="t-subhead">{shown.muscle_group}</p>
        <p className={`lp-delta lp-delta--${arrowTone}`}>
          <span className="lp-delta-arrow" aria-hidden>
            {status?.arrow ?? '·'}
          </span>
          <span className="lp-delta-label">{status?.deltaLabel ?? 'New'}</span>
          <span className="lp-delta-sub">vs last log</span>
        </p>
      </div>

      <div className="lp-pair">
        <div className="lp-tile">
          <div className="lp-tile-label">Current</div>
          <div className="lp-tile-value">{formatSetsDetail(current, unit)}</div>
          <div className="lp-tile-meta">
            Volume <span className="num">{Math.round(curVol)}</span> {unit}·reps
          </div>
        </div>
        <div className="lp-tile">
          <div className="lp-tile-label">Previous</div>
          <div className="lp-tile-value">{previous?.length ? formatSetsDetail(previous, unit) : '—'}</div>
          <div className="lp-tile-meta">
            {prevVol != null ? (
              <>
                Volume <span className="num">{Math.round(prevVol)}</span>
              </>
            ) : (
              'No prior log'
            )}
          </div>
        </div>
      </div>

      <section className="sheet-section">
        <div className="lp-head">
          <h3 className="t-headline">Volume</h3>
          {loading && <span className="t-footnote lp-muted">Loading…</span>}
        </div>
        {chart.length < 2 ? (
          <p className="t-footnote lp-muted">Update this lift again to build a trend. Each save adds a point.</p>
        ) : (
          <div className="lp-bars" role="img" aria-label="Volume over recent updates">
            {chart.map((p, i) => (
              <div key={p.id} className="lp-bar-col">
                <div className="lp-bar-track">
                  <div className="lp-bar" style={{ height: `${p.pct}%` }} />
                </div>
                <div className="lp-bar-vol num">{Math.round(p.volume)}</div>
                <div className="lp-bar-date" data-edge={i === 0 ? 'start' : i === chart.length - 1 ? 'end' : undefined}>
                  {i === 0 || i === chart.length - 1 ? shortDate(p.recorded_at) : '\u00a0'}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="sheet-section">
        <div className="lp-head">
          <h3 className="t-headline">Estimated 1RM</h3>
          {latest1rm != null && (
            <span className="lp-1rm num">
              {formatNum(latest1rm)} {strength.u}
            </span>
          )}
        </div>
        {strength.trend.length < 2 ? (
          <p className="t-footnote lp-muted">Update this lift again to see your estimated 1RM trend.</p>
        ) : (
          <>
            <div className="lp-spark">
              <Sparkline
                values={strength.trend.slice(-12)}
                tone="strength"
                height={56}
                ariaLabel={`Estimated one-rep max over recent updates, latest ${formatNum(
                  strength.trend[strength.trend.length - 1],
                )} ${strength.u}`}
              />
            </div>
            <p className="sheet-hint">Estimated from your best set (Epley)</p>
          </>
        )}
      </section>

      <section className="sheet-section">
        <h3 className="t-headline lp-head-solo">Personal bests</h3>
        <div className="lp-bests">
          <div className="lp-tile">
            <div className="lp-tile-label">Est. 1RM</div>
            <div className="lp-tile-num num">
              {strength.bests.oneRepMax ? formatNum(strength.bests.oneRepMax.value) : '—'}
              {strength.bests.oneRepMax && <small>{strength.u}</small>}
            </div>
            <div className="lp-tile-meta">
              {strength.bests.oneRepMax ? shortDate(strength.bests.oneRepMax.recorded_at) : ''}
            </div>
          </div>
          <div className="lp-tile">
            <div className="lp-tile-label">Heaviest</div>
            <div className="lp-tile-num num">
              {strength.bests.heaviest ? formatNum(strength.bests.heaviest.value) : '—'}
              {strength.bests.heaviest && <small>× {strength.bests.heaviest.reps}</small>}
            </div>
            <div className="lp-tile-meta">
              {strength.bests.heaviest ? shortDate(strength.bests.heaviest.recorded_at) : ''}
            </div>
          </div>
          <div className="lp-tile">
            <div className="lp-tile-label">Best volume</div>
            <div className="lp-tile-num num">
              {strength.bests.volume ? Math.round(strength.bests.volume.value).toLocaleString('en-US') : '—'}
            </div>
            <div className="lp-tile-meta">
              {strength.bests.volume ? shortDate(strength.bests.volume.recorded_at) : ''}
            </div>
          </div>
        </div>
      </section>

      <p className="t-footnote lp-muted lp-updated">Last updated {friendlyUpdatedAt(shown.updated_at)}</p>

      <div className="sheet-section">
        <div className="list-group">
          <button
            type="button"
            className="list-row sheet-danger-row"
            data-confirm={confirmDelete}
            onClick={() => void handleDelete()}
            disabled={busy}
          >
            {confirmDelete ? 'Tap again to delete' : 'Delete lift'}
          </button>
          {confirmDelete && (
            <button
              type="button"
              className="list-row"
              style={{ justifyContent: 'center', color: 'var(--accent-ink)' }}
              onClick={() => setConfirmDelete(false)}
              disabled={busy}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </Sheet>
  )
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
