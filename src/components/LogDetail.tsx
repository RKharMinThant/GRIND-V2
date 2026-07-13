import { useEffect, useState } from 'react'
import { usePresence } from '../hooks/usePresence'
import { friendlyDate } from '../lib/dates'
import { formatFocusAreas, formatGrams, parseFocusAreas, type Log } from '../types/database'

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
  const { mounted, visible } = usePresence(open, 380)
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

  if (!mounted || !displayLog) return null

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

  return (
    <div
      className={`overlay ${visible ? 'is-visible' : 'is-closing'}`}
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && visible) onClose()
      }}
    >
      <div className="sheet">
        <div className="sheet-header">
          <div className="sheet-title">Session</div>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="sheet-body">
          {displayPhoto && (
            <div className="detail-hero">
              <img src={displayPhoto} alt="Proof" />
              <div className="scrim" />
            </div>
          )}
          <div className="detail-title">{current.workout}</div>
          <div className="detail-meta">
            {[friendlyDate(current.log_date), current.duration, current.workout_type]
              .filter(Boolean)
              .join(' · ')}
          </div>

          {focuses.length > 0 && (
            <div className="detail-block">
              <div className="label">Focus</div>
              <div className="tags" style={{ marginTop: 4 }}>
                {focuses.map((f) => (
                  <span key={f} className="tag focus">
                    {f}
                  </span>
                ))}
              </div>
              {focusLabel && current.workout !== focusLabel && (
                <p style={{ marginTop: 8, color: 'var(--muted)', fontSize: '0.85rem' }}>{focusLabel}</p>
              )}
            </div>
          )}

          {(protein || creatine) && (
            <div className="detail-block">
              <div className="label">Supplements</div>
              <div className="tags" style={{ marginTop: 4 }}>
                {protein && <span className="tag supp">Protein {protein}</span>}
                {creatine && <span className="tag supp">Creatine {creatine}</span>}
              </div>
            </div>
          )}

          {current.meal && (
            <div className="detail-block">
              <div className="label">Fuel</div>
              <p>{current.meal}</p>
            </div>
          )}
          {current.notes && (
            <div className="detail-block">
              <div className="label">Notes</div>
              <p>{current.notes}</p>
            </div>
          )}

          <div className="sheet-actions" style={{ justifyContent: 'space-between' }}>
            <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={busy}>
              {busy ? 'Deleting…' : confirming ? 'Confirm delete' : 'Delete'}
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              {confirming && (
                <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              )}
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onEdit(current)}
                disabled={busy}
              >
                Edit
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
