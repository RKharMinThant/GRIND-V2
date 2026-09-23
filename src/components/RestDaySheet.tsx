import { useState } from 'react'
import { usePresence } from '../hooks/usePresence'
import { friendlyDate } from '../lib/dates'

type Props = {
  open: boolean
  /** The day to log, from the notification link. Kept while closing so the exit animates. */
  date: string | null
  displayName: string
  /** False until logs have loaded, so a duplicate rest day can't slip through. */
  ready: boolean
  onConfirm: (date: string) => Promise<void>
  onClose: () => void
}

/**
 * The one-tap confirm behind the "Rest day?" notification. It asks rather than logs
 * straight away, so a stray tap on the lock screen never records a rest day.
 */
export function RestDaySheet({ open, date, displayName, ready, onConfirm, onClose }: Props) {
  const { mounted, visible } = usePresence(open && Boolean(date), 380)
  const [busy, setBusy] = useState(false)
  if (!mounted || !date) return null

  const first = displayName.trim().split(/\s+/)[0]

  async function confirm() {
    if (!date) return
    setBusy(true)
    try {
      await onConfirm(date)
      onClose()
    } catch {
      // logRestDay already showed the error toast; keep the sheet open to retry
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={`overlay ${visible ? 'is-visible' : 'is-closing'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rest-day-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && visible && !busy) onClose()
      }}
    >
      <div className="sheet sheet--rest">
        <div className="sheet-header">
          <div className="sheet-title" id="rest-day-title">
            {first ? `${first}, rest day?` : 'Rest day?'}
          </div>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Close" disabled={busy}>
            ✕
          </button>
        </div>
        <div className="sheet-body">
          <p className="rest-day-copy">
            Log <strong>{friendlyDate(date)}</strong> as a rest day. Recovery is part of the plan, and it
            keeps your streak going.
          </p>
          <div className="sheet-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
              Not now
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void confirm()}
              disabled={busy || !ready}
            >
              {busy ? 'Logging…' : ready ? 'Log rest day' : 'Loading…'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
