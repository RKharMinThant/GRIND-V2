import { useState } from 'react'
import { friendlyDate } from '../lib/dates'
import { Sheet, SheetCancel, SheetHeader } from './Sheet'

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
  const [busy, setBusy] = useState(false)
  // Keep the date on screen while the sheet slides away
  const [shownDate, setShownDate] = useState(date)
  if (date && date !== shownDate) setShownDate(date)
  const day = date ?? shownDate
  if (!day) return null

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
    <Sheet
      open={open && Boolean(date)}
      onClose={onClose}
      dismissible={!busy}
      className="sheet--rest"
      labelledBy="rest-day-title"
      header={
        <SheetHeader
          title={first ? `${first}, rest day?` : 'Rest day?'}
          titleId="rest-day-title"
          leading={<SheetCancel disabled={busy}>Not now</SheetCancel>}
        />
      }
      footer={
        <button
          type="button"
          className="btn btn-primary btn-lg btn-full"
          onClick={() => void confirm()}
          disabled={busy || !ready}
        >
          {busy ? 'Logging…' : ready ? 'Log rest day' : 'Loading…'}
        </button>
      }
    >
      <p className="rest-day-copy">
        Log <strong>{friendlyDate(day)}</strong> as a rest day. Recovery is part of the plan, and it keeps
        your streak going.
      </p>
    </Sheet>
  )
}
