import { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_WEIGHT_UNIT, type WeightUnit } from '../lib/units'
import { formatSetsDetail, getLiftSets, getPrevLiftSets } from '../lib/overload'
import {
  MUSCLE_GROUPS,
  type LiftSet,
  type TrackedLift,
  type TrackedLiftInput,
} from '../types/database'
import { Sheet, SheetAction, SheetCancel, SheetHeader } from './Sheet'

export type LiftEditorSheetProps = {
  open: boolean
  mode: 'add' | 'edit'
  initialGroup?: string
  lift: TrackedLift | null
  onClose: () => void
  onSave: (input: TrackedLiftInput) => Promise<void>
  onDelete?: () => Promise<void>
  /** Unit new lifts start in (Settings → Units) */
  defaultUnit?: WeightUnit
}

type SetDraft = {
  key: string
  reps: string
}

let setKeySeq = 0
function newSetDraft(reps = '8'): SetDraft {
  setKeySeq += 1
  return { key: `set-${setKeySeq}`, reps }
}

function formatWeightLabel(n: number): string {
  if (n <= 0) return ''
  return Number.isInteger(n) ? String(n) : String(n)
}

/** Prefer a shared working weight (most common gym case). */
function weightFromLift(lift: TrackedLift): string {
  const detail = getLiftSets(lift)
  if (!detail.length) {
    return lift.weight > 0 ? formatWeightLabel(Number(lift.weight)) : ''
  }
  // Most frequent non-zero weight, else first set
  const nonzero = detail.map((s) => s.weight).filter((w) => w > 0)
  if (!nonzero.length) return ''
  const counts = new Map<number, number>()
  for (const w of nonzero) counts.set(w, (counts.get(w) ?? 0) + 1)
  let best = nonzero[0]
  let bestN = 0
  for (const [w, n] of counts) {
    if (n > bestN) {
      best = w
      bestN = n
    }
  }
  return formatWeightLabel(best)
}

function draftsToSets(drafts: SetDraft[], weightStr: string): LiftSet[] {
  const weight = Math.max(0, Number(weightStr) || 0)
  return drafts
    .map((d) => ({
      reps: Math.max(0, Math.floor(Number(d.reps) || 0)),
      weight,
    }))
    .filter((s) => s.reps > 0)
}

function mapLegacyMuscle(group: string): string {
  const g = group.trim().toLowerCase()
  if (g === 'quads' || g === 'hamstrings' || g === 'calves') return 'Legs'
  if (g === 'abs' || g === 'forearms') return 'Core'
  if (g === 'arms') return 'Biceps'
  const match = MUSCLE_GROUPS.find((m) => m.toLowerCase() === g)
  return match ?? 'Full Body'
}

/** The values the form opens with: the lift being edited, or an empty lift in the chosen group. */
function initialFields(
  lift: TrackedLift | null,
  initialGroup: string | undefined,
  defaultUnit: WeightUnit,
) {
  if (lift) {
    const known = (MUSCLE_GROUPS as readonly string[]).includes(lift.muscle_group)
    const detail = getLiftSets(lift)
    return {
      muscle: known ? lift.muscle_group : mapLegacyMuscle(lift.muscle_group),
      name: lift.exercise_name,
      weight: weightFromLift(lift),
      reps: detail.length ? detail.map((s) => String(s.reps)) : ['8'],
      unit: (lift.unit === 'lb' ? 'lb' : 'kg') as 'kg' | 'lb',
    }
  }
  const muscle = initialGroup
    ? (MUSCLE_GROUPS as readonly string[]).includes(initialGroup)
      ? initialGroup
      : mapLegacyMuscle(initialGroup)
    : MUSCLE_GROUPS[0]
  return { muscle, name: '', weight: '', reps: ['8', '8', '8'], unit: defaultUnit as 'kg' | 'lb' }
}

/**
 * Progressive-overload lift editor.
 * One shared weight + per-set reps (15 · 12 · 10 @ 60kg).
 * Portaled to document.body.
 */
export function LiftEditorSheet({
  open,
  mode: modeProp,
  initialGroup: initialGroupProp,
  lift: liftProp,
  onClose,
  onSave,
  onDelete: onDeleteProp,
  defaultUnit = DEFAULT_WEIGHT_UNIT,
}: LiftEditorSheetProps) {
  // The parent clears these as soon as it saves; keep what the sheet opened with while it slides away
  const incoming = {
    mode: modeProp,
    initialGroup: initialGroupProp,
    lift: liftProp,
    onDelete: onDeleteProp,
  }
  const held = useRef(incoming)
  if (open) held.current = incoming
  const { mode, initialGroup, lift, onDelete } = held.current
  const bodyRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const [muscle, setMuscle] = useState<string>(MUSCLE_GROUPS[0])
  const [name, setName] = useState('')
  const [weight, setWeight] = useState('')
  const [setDrafts, setSetDrafts] = useState<SetDraft[]>(() => [
    newSetDraft('8'),
    newSetDraft('8'),
    newSetDraft('8'),
  ])
  const [unit, setUnit] = useState<'kg' | 'lb'>(defaultUnit)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    const init = initialFields(lift, initialGroup, defaultUnit)
    setMuscle(init.muscle)
    setName(init.name)
    setWeight(init.weight)
    setSetDrafts(init.reps.map((r) => newSetDraft(r)))
    setUnit(init.unit)
    setError(null)
    setBusy(false)
    setConfirmDelete(false)
    requestAnimationFrame(() => {
      if (bodyRef.current) bodyRef.current.scrollTop = 0
    })
  }, [open, lift, initialGroup, defaultUnit])

  // Unsaved input: a flick, scrim tap or Esc must not throw it away (Cancel asks first)
  const dirty = useMemo(() => {
    const init = initialFields(lift, initialGroup, defaultUnit)
    return (
      muscle !== init.muscle ||
      name !== init.name ||
      weight !== init.weight ||
      unit !== init.unit ||
      setDrafts.map((d) => d.reps).join() !== init.reps.join()
    )
  }, [lift, initialGroup, defaultUnit, muscle, name, weight, unit, setDrafts])

  const preview = useMemo(() => {
    const sets = draftsToSets(setDrafts, weight)
    const line = sets.length ? formatSetsDetail(sets, unit) : '—'
    const title = name.trim()
    return {
      line,
      name: title,
      hasName: title.length > 0,
      muscle,
    }
  }, [setDrafts, weight, unit, name, muscle])

  const prevLine = useMemo(() => {
    if (!lift) return null
    const prev = getPrevLiftSets(lift)
    if (!prev?.length) return null
    return formatSetsDetail(prev, lift.unit || 'kg')
  }, [lift])

  function updateReps(index: number, value: string) {
    const cleaned = value.replace(/[^\d]/g, '')
    setSetDrafts((prev) =>
      prev.map((s, i) => (i === index ? { ...s, reps: cleaned } : s)),
    )
  }

  function nudgeReps(index: number, dir: 1 | -1) {
    setSetDrafts((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s
        const cur = Math.max(0, Math.floor(Number(s.reps) || 0))
        const next = Math.min(999, Math.max(0, cur + dir))
        return { ...s, reps: String(next) }
      }),
    )
  }

  function nudgeWeight(dir: 1 | -1) {
    const step = 0.5
    const cur = Math.max(0, Number(weight) || 0)
    const raw = Math.round((cur + dir * step) * 10) / 10
    const next = Math.min(2000, Math.max(0, raw))
    setWeight(next === 0 ? '' : formatWeightLabel(next))
  }

  function addSet() {
    setSetDrafts((prev) => {
      const last = prev[prev.length - 1]
      return [...prev, newSetDraft(last?.reps || '8')]
    })
  }

  function removeSet(index: number) {
    setSetDrafts((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((_, i) => i !== index)
    })
  }

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Give this exercise a name')
      return
    }
    const sets_detail = draftsToSets(setDrafts, weight)
    if (!sets_detail.length) {
      setError('Add at least one set with reps')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await onSave({
        muscle_group: muscle,
        exercise_name: trimmed,
        sets_detail,
        unit,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
      setBusy(false)
      return
    }
    setBusy(false)
  }

  async function handleDelete() {
    if (!onDelete) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setBusy(true)
    try {
      await onDelete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
      setBusy(false)
    }
  }

  const titleId = 'lift-sheet-title'
  const weightNum = Number(weight) || 0

  return (
    <Sheet
      open={open}
      onClose={onClose}
      dismissible={!busy && !dirty}
      labelledBy={titleId}
      className="sheet--lift"
      scrollRef={bodyRef}
      onOpened={() => {
        try {
          nameRef.current?.focus({ preventScroll: true })
        } catch {
          /* older browsers */
        }
      }}
      header={
        <SheetHeader
          title={mode === 'edit' ? 'Edit lift' : 'Add lift'}
          titleId={titleId}
          leading={
            <SheetCancel disabled={busy} confirm={dirty ? 'Discard changes?' : undefined} />
          }
          trailing={
            <SheetAction primary onClick={() => void submit()} disabled={busy}>
              {busy ? 'Saving…' : mode === 'edit' ? 'Save' : 'Add'}
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

      <div className="sheet-section">
        <div className="list-group">
          <label className="list-row" htmlFor="liftName">
            <span className="list-row-label">Exercise</span>
            <input
              ref={nameRef}
              id="liftName"
              className="list-row-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bench press"
              autoComplete="off"
            />
          </label>
        </div>
      </div>

      <div className="sheet-section">
        <div className="sheet-label" id="muscle-label">
          Muscle
        </div>
        <div className="chip-row" role="group" aria-labelledby="muscle-label">
          {MUSCLE_GROUPS.map((g) => (
            <button
              key={g}
              type="button"
              className="chip chip--button sheet-chip"
              onClick={() => setMuscle(g)}
              aria-pressed={muscle === g}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Shared working weight — same for every set */}
      <div className="sheet-section">
        <div className="sheet-label">Weight</div>
        <div className="list-group">
          <div className="list-row">
            <span className="list-row-label">Unit</span>
            <div className="segmented" role="group" aria-label="Weight unit">
              <button
                type="button"
                className={unit === 'kg' ? 'active' : ''}
                onClick={() => setUnit('kg')}
                aria-pressed={unit === 'kg'}
              >
                kg
              </button>
              <button
                type="button"
                className={unit === 'lb' ? 'active' : ''}
                onClick={() => setUnit('lb')}
                aria-pressed={unit === 'lb'}
              >
                lb
              </button>
            </div>
          </div>
          <div className="list-row">
            <span className="list-row-label">Working weight</span>
            <div className="stepper stepper--weight">
              <button
                type="button"
                className="stepper-btn"
                aria-label="Decrease weight"
                onClick={() => nudgeWeight(-1)}
              >
                −
              </button>
              <input
                className="stepper-input num"
                type="text"
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="0"
                aria-label="Working weight"
              />
              <button
                type="button"
                className="stepper-btn"
                aria-label="Increase weight"
                onClick={() => nudgeWeight(1)}
              >
                +
              </button>
            </div>
            <span className="list-row-unit">{unit}</span>
          </div>
        </div>
        <p className="sheet-hint">Same load for all sets — only reps change below.</p>
      </div>

      <div className="sheet-section">
        <div className="sheet-label">Reps per set</div>
        <div className="list-group">
          {setDrafts.map((row, index) => (
            <div key={row.key} className="list-row set-row">
              <span className="list-row-label">Set {index + 1}</span>
              <div className="stepper">
                <button
                  type="button"
                  className="stepper-btn"
                  aria-label={`Decrease set ${index + 1} reps`}
                  onClick={() => nudgeReps(index, -1)}
                >
                  −
                </button>
                <input
                  className="stepper-input num"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={row.reps}
                  onChange={(e) => updateReps(index, e.target.value)}
                  aria-label={`Set ${index + 1} reps`}
                />
                <button
                  type="button"
                  className="stepper-btn"
                  aria-label={`Increase set ${index + 1} reps`}
                  onClick={() => nudgeReps(index, 1)}
                >
                  +
                </button>
              </div>
              <span className="set-row-load num" aria-hidden>
                {weightNum > 0 ? `× ${formatWeightLabel(weightNum)} ${unit}` : '× —'}
              </span>
              <button
                type="button"
                className="set-row-remove"
                aria-label={`Remove set ${index + 1}`}
                disabled={setDrafts.length <= 1}
                onClick={() => removeSet(index)}
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5 11H7a1 1 0 1 1 0-2h10a1 1 0 1 1 0 2Z" />
                </svg>
              </button>
            </div>
          ))}
          <button type="button" className="list-row set-add-row" onClick={addSet}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5 11h-4v4a1 1 0 1 1-2 0v-4H7a1 1 0 1 1 0-2h4V7a1 1 0 1 1 2 0v4h4a1 1 0 1 1 0 2Z" />
            </svg>
            <span>Add set</span>
          </button>
        </div>
        <p className="sheet-hint">e.g. 15, then 12, then 10</p>
      </div>

      <div className={`lift-summary ${preview.hasName ? 'is-ready' : ''}`} aria-live="polite">
        <span className="lift-summary-muscle">{preview.muscle}</span>
        <span className="lift-summary-name">{preview.hasName ? preview.name : 'Name this exercise'}</span>
        <span className="lift-summary-nums num">{preview.line}</span>
      </div>

      {mode === 'edit' && prevLine && (
        <p className="lift-prev-note">
          Previous <span className="num">{prevLine}</span>
        </p>
      )}

      {onDelete && (
        <div className="sheet-section lift-delete">
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
          </div>
        </div>
      )}
    </Sheet>
  )
}
