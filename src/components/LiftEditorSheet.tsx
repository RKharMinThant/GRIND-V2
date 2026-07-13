import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePresence } from '../hooks/usePresence'
import { formatSetsDetail, getLiftSets, getPrevLiftSets } from '../lib/overload'
import {
  MUSCLE_GROUPS,
  type LiftSet,
  type TrackedLift,
  type TrackedLiftInput,
} from '../types/database'

export type LiftEditorSheetProps = {
  open: boolean
  mode: 'add' | 'edit'
  initialGroup?: string
  lift: TrackedLift | null
  onClose: () => void
  onSave: (input: TrackedLiftInput) => Promise<void>
  onDelete?: () => Promise<void>
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

function draftsFromLift(lift: TrackedLift): SetDraft[] {
  const detail = getLiftSets(lift)
  if (!detail.length) return [newSetDraft('8')]
  return detail.map((s) => newSetDraft(String(s.reps)))
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

/**
 * Progressive-overload lift editor.
 * One shared weight + per-set reps (15 · 12 · 10 @ 60kg).
 * Portaled to document.body.
 */
export function LiftEditorSheet({
  open,
  mode,
  initialGroup,
  lift,
  onClose,
  onSave,
  onDelete,
}: LiftEditorSheetProps) {
  const { mounted, visible } = usePresence(open, 380)
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
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    if (lift) {
      const known = (MUSCLE_GROUPS as readonly string[]).includes(lift.muscle_group)
      setMuscle(known ? lift.muscle_group : mapLegacyMuscle(lift.muscle_group))
      setName(lift.exercise_name)
      setWeight(weightFromLift(lift))
      setSetDrafts(draftsFromLift(lift))
      setUnit(lift.unit === 'lb' ? 'lb' : 'kg')
    } else {
      const g = initialGroup
        ? (MUSCLE_GROUPS as readonly string[]).includes(initialGroup)
          ? initialGroup
          : mapLegacyMuscle(initialGroup)
        : MUSCLE_GROUPS[0]
      setMuscle(g)
      setName('')
      setWeight('')
      setSetDrafts([newSetDraft('8'), newSetDraft('8'), newSetDraft('8')])
      setUnit('kg')
    }
    setError(null)
    setBusy(false)
    setConfirmDelete(false)
    requestAnimationFrame(() => {
      if (bodyRef.current) bodyRef.current.scrollTop = 0
    })
  }, [open, lift, initialGroup])

  useEffect(() => {
    if (!open || !visible) return
    if (bodyRef.current) bodyRef.current.scrollTop = 0
    const t = window.setTimeout(() => {
      if (bodyRef.current) bodyRef.current.scrollTop = 0
      const el = nameRef.current
      if (!el) return
      try {
        el.focus({ preventScroll: true })
      } catch {
        /* older browsers */
      }
    }, 280)
    return () => window.clearTimeout(t)
  }, [open, visible])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

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

  if (!mounted) return null

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

  const node = (
    <div
      className={`overlay overlay--lift ${visible ? 'is-visible' : 'is-closing'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lift-sheet-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && visible) onClose()
      }}
    >
      <div className="sheet sheet--lift">
        <header className="lift-sheet-header">
          <h2 id="lift-sheet-title" className="lift-sheet-title">
            {mode === 'edit' ? 'Edit lift' : 'Add lift'}
          </h2>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div ref={bodyRef} className="lift-sheet-body">
          {error && <div className="auth-error">{error}</div>}

          <div className="lift-field">
            <label className="lift-field-label" htmlFor="liftName">
              Exercise
            </label>
            <input
              ref={nameRef}
              id="liftName"
              className="lift-name-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bench press"
              autoComplete="off"
            />
          </div>

          <div className="lift-field">
            <span className="lift-field-label" id="muscle-label">
              Muscle
            </span>
            <div className="muscle-grid" role="group" aria-labelledby="muscle-label">
              {MUSCLE_GROUPS.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`muscle-grid-btn ${muscle === g ? 'is-selected' : ''}`}
                  onClick={() => setMuscle(g)}
                  aria-pressed={muscle === g}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Shared working weight — same for every set */}
          <div className="lift-field">
            <div className="lift-field-label-row">
              <span className="lift-field-label">Weight</span>
              <div className="unit-seg" role="group" aria-label="Weight unit">
                <button
                  type="button"
                  className={unit === 'kg' ? 'is-selected' : ''}
                  onClick={() => setUnit('kg')}
                  aria-pressed={unit === 'kg'}
                >
                  kg
                </button>
                <button
                  type="button"
                  className={unit === 'lb' ? 'is-selected' : ''}
                  onClick={() => setUnit('lb')}
                  aria-pressed={unit === 'lb'}
                >
                  lb
                </button>
              </div>
            </div>
            <div className="weight-stepper-wrap">
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
                  className="stepper-input"
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
              <span className="weight-stepper-unit">{unit}</span>
            </div>
            <p className="field-hint" style={{ marginTop: 8, marginBottom: 0 }}>
              Same load for all sets — only reps change below.
            </p>
          </div>

          <div className="lift-field">
            <span className="lift-field-label">Reps per set</span>
            <p className="field-hint" style={{ marginTop: 0, marginBottom: 10 }}>
              e.g. 15, then 12, then 10
            </p>

            <div className="set-list">
              {setDrafts.map((row, index) => (
                <div key={row.key} className="set-row set-row--reps-only">
                  <span className="set-row-label">Set {index + 1}</span>

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
                      className="stepper-input"
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

                  <span className="set-row-reps-unit">reps</span>

                  <button
                    type="button"
                    className="set-row-remove"
                    aria-label={`Remove set ${index + 1}`}
                    disabled={setDrafts.length <= 1}
                    onClick={() => removeSet(index)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <button type="button" className="btn btn-ghost btn-full set-add-btn" onClick={addSet}>
              + Add set
            </button>
          </div>

          <div className={`lift-summary ${preview.hasName ? 'is-ready' : ''}`} aria-live="polite">
            <span className="lift-summary-muscle">{preview.muscle}</span>
            <span className="lift-summary-name">
              {preview.hasName ? preview.name : 'Name this exercise'}
            </span>
            <span className="lift-summary-nums">{preview.line}</span>
          </div>

          {mode === 'edit' && prevLine && (
            <div className="lift-prev-note">
              <span className="lift-prev-label">Previous</span>
              <span className="lift-prev-value">{prevLine}</span>
            </div>
          )}
        </div>

        <footer className="lift-sheet-footer">
          {onDelete ? (
            <button
              type="button"
              className="lift-delete-btn"
              onClick={() => void handleDelete()}
              disabled={busy}
            >
              {confirmDelete ? 'Tap again to delete' : 'Delete'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost lift-cancel-btn"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary lift-save-btn"
            onClick={() => void submit()}
            disabled={busy}
          >
            {busy ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Add lift'}
          </button>
        </footer>
      </div>
    </div>
  )

  return createPortal(node, document.body)
}
