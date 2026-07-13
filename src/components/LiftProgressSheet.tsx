import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePresence } from '../hooks/usePresence'
import { friendlyUpdatedAt } from '../lib/dates'
import {
  compareTrackedLift,
  formatSetsDetail,
  getLiftSets,
  getPrevLiftSets,
  volumeOf,
  type LiftHistoryPoint,
} from '../lib/overload'
import type { TrackedLift } from '../types/database'

type Props = {
  lift: TrackedLift | null
  fetchHistory: (liftId: string) => Promise<LiftHistoryPoint[]>
  onClose: () => void
  onEdit: (lift: TrackedLift) => void
  onDelete: (lift: TrackedLift) => Promise<void>
}

export function LiftProgressSheet({
  lift,
  fetchHistory,
  onClose,
  onEdit,
  onDelete,
}: Props) {
  const open = Boolean(lift)
  const { mounted, visible } = usePresence(open, 380)
  const [history, setHistory] = useState<LiftHistoryPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!lift) {
      setHistory([])
      setConfirmDelete(false)
      setBusy(false)
      setError(null)
      return
    }
    setConfirmDelete(false)
    setBusy(false)
    setError(null)
    let cancelled = false
    setLoading(true)
    void fetchHistory(lift.id).then((rows) => {
      if (!cancelled) {
        setHistory(rows)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [lift, fetchHistory])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const current = lift ? getLiftSets(lift) : []
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

  if (!mounted || !lift) return null

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

  const node = (
    <div
      className={`overlay overlay--lift ${visible ? 'is-visible' : 'is-closing'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lift-progress-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && visible) onClose()
      }}
    >
      <div className="sheet sheet--lift sheet--progress">
        <header className="lift-sheet-header">
          <div>
            <p className="lift-progress-kicker">{lift.muscle_group}</p>
            <h2 id="lift-progress-title" className="lift-sheet-title">
              {lift.exercise_name}
            </h2>
          </div>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="lift-sheet-body">
          {error && <div className="auth-error">{error}</div>}

          <div className={`lift-delta-banner status-${status?.status ?? 'new'}`}>
            <span className="lift-delta-arrow" aria-hidden>
              {status?.arrow ?? '·'}
            </span>
            <div>
              <div className="lift-delta-label">{status?.deltaLabel ?? 'New'}</div>
              <div className="lift-delta-sub">vs last log</div>
            </div>
          </div>

          <div className="lift-compare-grid">
            <div className="lift-compare-card">
              <div className="lift-compare-label">Current</div>
              <div className="lift-compare-value">{formatSetsDetail(current, unit)}</div>
              <div className="lift-compare-meta">
                Vol {Math.round(curVol)}
                {unit === 'lb' ? ' lb' : ' kg'}·reps
              </div>
            </div>
            <div className="lift-compare-card lift-compare-card--prev">
              <div className="lift-compare-label">Previous</div>
              <div className="lift-compare-value">
                {previous?.length ? formatSetsDetail(previous, unit) : '—'}
              </div>
              <div className="lift-compare-meta">
                {prevVol != null ? `Vol ${Math.round(prevVol)}` : 'No prior log'}
              </div>
            </div>
          </div>

          <section className="lift-chart-block">
            <div className="lift-field-label-row">
              <h3 className="lift-field-label" style={{ marginBottom: 0 }}>
                Volume trend
              </h3>
              {loading && <span className="section-meta">Loading…</span>}
            </div>
            {chart.length < 2 ? (
              <p className="field-hint" style={{ marginTop: 8 }}>
                Update this lift again to build a trend. Each save adds a point.
              </p>
            ) : (
              <div className="lift-chart" role="img" aria-label="Volume over recent updates">
                {chart.map((p) => (
                  <div key={p.id} className="lift-chart-col">
                    <div className="lift-chart-track">
                      <div className="lift-chart-bar" style={{ height: `${p.pct}%` }} />
                    </div>
                    <div className="lift-chart-vol">{Math.round(p.volume)}</div>
                    <div className="lift-chart-date">{shortDate(p.recorded_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <p className="muscle-lift-updated" style={{ marginTop: 4, opacity: 0.55 }}>
            Last updated: {friendlyUpdatedAt(lift.updated_at)}
          </p>
        </div>

        <footer className="lift-sheet-footer lift-sheet-footer--triple">
          <button
            type="button"
            className="lift-delete-btn"
            onClick={() => void handleDelete()}
            disabled={busy}
          >
            {confirmDelete ? 'Tap again to delete' : 'Delete'}
          </button>
          {confirmDelete ? (
            <button
              type="button"
              className="btn btn-ghost lift-cancel-btn"
              onClick={() => setConfirmDelete(false)}
              disabled={busy}
            >
              Cancel
            </button>
          ) : (
            <button type="button" className="btn btn-ghost lift-cancel-btn" onClick={onClose}>
              Close
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary lift-save-btn"
            onClick={() => onEdit(lift)}
            disabled={busy || confirmDelete}
          >
            Edit lift
          </button>
        </footer>
      </div>
    </div>
  )

  return createPortal(node, document.body)
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
