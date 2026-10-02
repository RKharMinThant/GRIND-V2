import { useEffect, useState } from 'react'
import { pickHealthFields } from '../health/logic'
import { friendlyDate } from '../lib/dates'
import { formatFocusAreas, formatGrams, parseFocusAreas, type Log } from '../types/database'
import { HealthStats } from './HealthStats'
import { Sheet, SheetAction, SheetCancel, SheetHeader } from './Sheet'
import { WorkoutMetrics } from './WorkoutMetrics'

type Props = {
  log: Log | null
  photoUrl?: string
  onClose: () => void
  onEdit: (log: Log) => void
  onDelete: (id: string) => Promise<void>
}

export function LogDetail({ log, photoUrl, onClose, onEdit, onDelete }: Props) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const open = Boolean(log)
  const [displayLog, setDisplayLog] = useState<Log | null>(log)
  const [displayPhoto, setDisplayPhoto] = useState(photoUrl)

  useEffect(() => {
    if (log) {
      setDisplayLog(log)
      setDisplayPhoto(photoUrl)
      setConfirming(false)
      setBusy(false)
    }
  }, [log, photoUrl])

  if (!displayLog) return null

  const current = displayLog
  const focuses = parseFocusAreas(current.focus_areas)
  const focusLabel = formatFocusAreas(current.focus_areas)
  const protein = formatGrams(current.protein_g)
  const creatine = formatGrams(current.creatine_g)

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    setBusy(true)
    try {
      await onDelete(current.id)
      onClose()
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  const health = pickHealthFields(current)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      labelledBy="log-detail-title"
      header={
        <SheetHeader
          title="Session"
          leading={<SheetCancel disabled={busy}>Close</SheetCancel>}
          trailing={
            <SheetAction primary onClick={() => onEdit(current)} disabled={busy}>
              Edit
            </SheetAction>
          }
        />
      }
    >
      {displayPhoto && (
        <div className="detail-hero">
          <img src={displayPhoto} alt="Proof" />
        </div>
      )}
      <div className="sheet-title-block">
        <h2 id="log-detail-title" className="t-title2">
          {current.workout}
        </h2>
        <p className="t-subhead">
          {[friendlyDate(current.log_date), current.duration, current.workout_type].filter(Boolean).join(' · ')}
        </p>
      </div>

      {focuses.length > 0 && (
        <div className="sheet-section">
          <div className="sheet-label">Focus</div>
          <div className="sheet-card">
            <div className="detail-chips">
              {focuses.map((f) => (
                <span key={f} className="chip">
                  {f}
                </span>
              ))}
            </div>
            {focusLabel && current.workout !== focusLabel && (
              <p className="t-subhead detail-focus-note">{focusLabel}</p>
            )}
          </div>
        </div>
      )}

      {current.health_workout_id && (
        <div className="sheet-section">
          <div className="sheet-label">Fitbit</div>
          <div className="sheet-card detail-fitbit">
            <WorkoutMetrics fields={health} />
            <HealthStats fields={health} />
          </div>
        </div>
      )}

      {(protein || creatine) && (
        <div className="sheet-section">
          <div className="sheet-label">Supplements</div>
          <div className="sheet-card">
            <div className="detail-chips">
              {protein && <span className="chip">Protein {protein}</span>}
              {creatine && <span className="chip">Creatine {creatine}</span>}
            </div>
          </div>
        </div>
      )}

      {current.meal && (
        <div className="sheet-section">
          <div className="sheet-label">Fuel</div>
          <div className="sheet-card">
            <p>{current.meal}</p>
          </div>
        </div>
      )}
      {current.notes && (
        <div className="sheet-section">
          <div className="sheet-label">Notes</div>
          <div className="sheet-card">
            <p>{current.notes}</p>
          </div>
        </div>
      )}

      <div className="sheet-section">
        <div className="list-group">
          <button
            type="button"
            className="list-row sheet-danger-row"
            data-confirm={confirming}
            onClick={handleDelete}
            disabled={busy}
          >
            {busy ? 'Deleting…' : confirming ? 'Confirm delete' : 'Delete session'}
          </button>
          {confirming && (
            <button
              type="button"
              className="list-row"
              style={{ justifyContent: 'center', color: 'var(--accent-ink)' }}
              onClick={() => setConfirming(false)}
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
