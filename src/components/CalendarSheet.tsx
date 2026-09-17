import { usePresence } from '../hooks/usePresence'
import type { Log } from '../types/database'
import { CalendarView } from './CalendarView'

type Props = {
  open: boolean
  logs: Log[]
  onClose: () => void
  onOpenLog: (id: string) => void
  onCreateForDate: (date: string) => void
}

/** Calendar in a sheet, opened from History. */
export function CalendarSheet({ open, logs, onClose, onOpenLog, onCreateForDate }: Props) {
  const { mounted, visible } = usePresence(open, 380)
  if (!mounted) return null

  return (
    <div
      className={`overlay ${visible ? 'is-visible' : 'is-closing'}`}
      role="dialog"
      aria-modal="true"
      aria-label="Calendar"
      onClick={(e) => {
        if (e.target === e.currentTarget && visible) onClose()
      }}
    >
      <div className="sheet sheet--calendar">
        <div className="sheet-header">
          <div className="sheet-title">Calendar</div>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="sheet-body">
          <CalendarView
            embedded
            logs={logs}
            onOpenLog={(id) => {
              onClose()
              onOpenLog(id)
            }}
            onCreateForDate={(date) => {
              onClose()
              onCreateForDate(date)
            }}
          />
        </div>
      </div>
    </div>
  )
}
