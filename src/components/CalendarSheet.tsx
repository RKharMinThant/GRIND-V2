import type { Log } from '../types/database'
import { CalendarView } from './CalendarView'
import { Sheet, SheetCancel, SheetHeader } from './Sheet'

type Props = {
  open: boolean
  logs: Log[]
  onClose: () => void
  onOpenLog: (id: string) => void
  onCreateForDate: (date: string) => void
}

/** Calendar in a sheet, opened from History. */
export function CalendarSheet({ open, logs, onClose, onOpenLog, onCreateForDate }: Props) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      className="sheet--calendar"
      labelledBy="calendar-sheet-title"
      header={<SheetHeader title="Calendar" titleId="calendar-sheet-title" trailing={<SheetCancel primary>Done</SheetCancel>} />}
    >
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
    </Sheet>
  )
}
