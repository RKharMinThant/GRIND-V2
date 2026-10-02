import { useEffect, useMemo, useRef, useState } from 'react'
import {
  activityToWorkoutType,
  pickHealthFields,
  roundDurationToOptions,
  workoutLocalDate,
  workoutToHealthFields,
} from '../health/logic'
import {
  EMPTY_HEALTH_FIELDS,
  type HealthSource,
  type HealthWorkout,
  type LogHealthFields,
} from '../health/types'
import { friendlyDate, toLocalDateString } from '../lib/dates'
import {
  formatDuration,
  HOUR_OPTIONS,
  MINUTE_OPTIONS,
  parseDuration,
} from '../lib/duration'
import { patternsEqual, suggestSplits, type SplitPattern } from '../lib/patterns'
import { compressImage } from '../lib/photos'
import type { Log, LogInsert } from '../types/database'
import {
  CREATINE_PRESETS,
  FOCUS_AREAS,
  formatFocusAreas,
  formatGrams,
  parseFocusAreas,
  parseGrams,
  PROTEIN_PRESETS,
  serializeFocusAreas,
  WORKOUT_TYPES,
} from '../types/database'
import { Sheet, SheetCancel, SheetHeader } from './Sheet'
import { WorkoutMetrics } from './WorkoutMetrics'

type Props = {
  open: boolean
  initial?: Log | null
  defaultDate?: string
  existingPhotoUrl?: string
  logs?: Log[]
  onClose: () => void
  onSave: (data: LogInsert, photoFile: File | null, removePhoto: boolean) => Promise<void>
  /** Tracker workouts available to attach (empty when Fitbit is off) */
  healthWorkouts?: HealthWorkout[]
  healthSource?: HealthSource
  /** Open a new log pre-filled from this tracker workout */
  attachWorkout?: HealthWorkout | null
}

const STEPS = [
  { id: 'when', title: 'When', blurb: 'Pick the day and how long you trained.' },
  { id: 'train', title: 'Train', blurb: 'Choose a split or fine-tune focus areas.' },
  { id: 'fuel', title: 'Fuel', blurb: 'Protein, creatine, and what you ate.' },
  { id: 'proof', title: 'Proof', blurb: 'Notes and an optional photo.' },
  { id: 'review', title: 'Review', blurb: 'Check everything, then save.' },
] as const

type StepId = (typeof STEPS)[number]['id']

function inferFocusesFromWorkout(workout: string): string[] {
  const parts = workout.split(/[,·|/]+/).map((s) => s.trim()).filter(Boolean)
  const known = new Set<string>(FOCUS_AREAS)
  if (parts.length && parts.every((p) => known.has(p))) return parts
  return []
}

export function LogFormSheet({
  open,
  initial: initialProp,
  defaultDate: defaultDateProp,
  existingPhotoUrl: existingPhotoUrlProp,
  logs = [],
  onClose,
  onSave,
  healthWorkouts,
  healthSource = 'demo',
  attachWorkout: attachWorkoutProp,
}: Props) {
  // The parent clears these as soon as it saves; keep what the sheet opened with while it slides away
  const incoming = {
    initial: initialProp,
    defaultDate: defaultDateProp,
    existingPhotoUrl: existingPhotoUrlProp,
    attachWorkout: attachWorkoutProp,
  }
  const held = useRef(incoming)
  if (open) held.current = incoming
  const { initial, defaultDate, existingPhotoUrl, attachWorkout } = held.current

  const [step, setStep] = useState(0)
  const [dir, setDir] = useState<'forward' | 'back'>('forward')

  const [logDate, setLogDate] = useState(toLocalDateString())
  const [sessionName, setSessionName] = useState('')
  const [focuses, setFocuses] = useState<string[]>([])
  const [workoutType, setWorkoutType] = useState('')
  const [durHours, setDurHours] = useState(0)
  const [durMinutes, setDurMinutes] = useState(0)
  const [meal, setMeal] = useState('')
  const [notes, setNotes] = useState('')
  const [protein, setProtein] = useState('')
  const [creatine, setCreatine] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const [isRest, setIsRest] = useState(false)
  const [health, setHealth] = useState<LogHealthFields>(EMPTY_HEALTH_FIELDS)
  const [opened, setOpened] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const suggestions = useMemo(() => suggestSplits(logs, 9), [logs])
  const current = STEPS[step] ?? STEPS[0]
  const isLast = step === STEPS.length - 1
  const isFirst = step === 0

  const dayWorkouts = useMemo(
    () => (healthWorkouts ?? []).filter((w) => workoutLocalDate(w) === logDate),
    [healthWorkouts, logDate],
  )

  /** Keep minutes options including a parsed non-standard value when editing. */
  const minuteOptions = useMemo(() => {
    if ((MINUTE_OPTIONS as readonly number[]).includes(durMinutes)) {
      return MINUTE_OPTIONS as number[]
    }
    return [...MINUTE_OPTIONS, durMinutes].sort((a, b) => a - b)
  }, [durMinutes])

  useEffect(() => {
    if (!open) return
    setBaseline(null)
    setOpened((n) => n + 1)
    setStep(0)
    setDir('forward')
    if (initial) {
      setLogDate(initial.log_date)
      const storedFocus = parseFocusAreas(initial.focus_areas)
      const inferred = storedFocus.length ? storedFocus : inferFocusesFromWorkout(initial.workout)
      setFocuses(inferred)
      const focusLabel = formatFocusAreas(serializeFocusAreas(inferred))
      const nameOnly =
        inferred.length && (initial.workout === focusLabel || initial.workout === inferred.join(', '))
          ? ''
          : initial.workout
      const rest =
        inferred.length === 0 &&
        (initial.workout?.toLowerCase() === 'rest' || initial.workout?.toLowerCase() === 'rest day')
      setIsRest(rest)
      setSessionName(rest ? 'Rest' : nameOnly)
      setWorkoutType(initial.workout_type ?? '')
      const parsed = parseDuration(initial.duration)
      setDurHours(parsed.hours)
      setDurMinutes(Math.min(59, Math.max(0, parsed.minutes || 0)))
      setMeal(initial.meal ?? '')
      setNotes(initial.notes ?? '')
      setProtein(initial.protein_g != null ? String(initial.protein_g) : '')
      setCreatine(initial.creatine_g != null ? String(initial.creatine_g) : '')
      setPreview(existingPhotoUrl ?? null)
      setRemovePhoto(false)
      setHealth(pickHealthFields(initial))
    } else {
      setLogDate(defaultDate || toLocalDateString())
      setSessionName('')
      setFocuses([])
      setWorkoutType('')
      setDurHours(0)
      setDurMinutes(0)
      setMeal('')
      setNotes('')
      setProtein('')
      setCreatine('')
      setPreview(null)
      setRemovePhoto(false)
      setIsRest(false)
      setHealth(EMPTY_HEALTH_FIELDS)
      if (attachWorkout) applyWorkout(attachWorkout)
    }
    setPhotoFile(null)
    setCompressing(false)
    setError(null)
    setBusy(false)
    // applyWorkout only uses setters and healthSource
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, existingPhotoUrl, defaultDate, attachWorkout])

  // Unsaved input: a flick, scrim tap or Esc must not throw it away (Cancel asks first).
  // `baseline` is the snapshot taken once the open effect above has applied its values.
  const snapshot = JSON.stringify([
    logDate,
    sessionName,
    focuses,
    workoutType,
    durHours,
    durMinutes,
    meal,
    notes,
    protein,
    creatine,
    isRest,
    removePhoto,
    photoFile?.name,
    photoFile?.size,
    health,
  ])
  const [baseline, setBaseline] = useState<string | null>(null)
  const dirty = baseline !== null && snapshot !== baseline
  useEffect(() => {
    if (open) setBaseline(snapshot)
    // Only when the form (re)opens; `opened` bumps after the open effect's values have rendered
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened])

  useEffect(() => {
    if (!photoFile) return
    const url = URL.createObjectURL(photoFile)
    setPreview(url)
    setRemovePhoto(false)
    return () => URL.revokeObjectURL(url)
  }, [photoFile])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step])

  function workoutTitle(): string {
    if (isRest) return sessionName.trim() || 'Rest'
    const name = sessionName.trim()
    const focusLabel = formatFocusAreas(serializeFocusAreas(focuses))
    return name || focusLabel
  }

  function durationLabel(): string | null {
    return formatDuration(durHours, durMinutes)
  }

  function validateStep(index: number): string | null {
    const id = STEPS[index].id as StepId
    if (id === 'when') {
      if (!logDate) return 'Pick a date'
      return null
    }
    if (id === 'train') {
      if (isRest) return null
      if (!focuses.length && !sessionName.trim()) {
        return 'Pick a split, focus areas, or name this session'
      }
      return null
    }
    if (id === 'fuel') {
      if (protein.trim() && parseGrams(protein) == null) return 'Protein must be a number (grams)'
      if (creatine.trim() && parseGrams(creatine) == null) return 'Creatine must be a number (grams)'
      return null
    }
    return null
  }

  function goNext() {
    const err = validateStep(step)
    if (err) {
      setError(err)
      return
    }
    setError(null)
    if (isLast) {
      void submit()
      return
    }
    setDir('forward')
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  function goBack() {
    setError(null)
    if (isFirst) {
      onClose()
      return
    }
    setDir('back')
    setStep((s) => Math.max(s - 1, 0))
  }

  function goToStep(index: number) {
    // Only allow jumping back to completed steps, or one step forward if current is valid
    if (index < step) {
      setError(null)
      setDir('back')
      setStep(index)
      return
    }
    if (index === step + 1) {
      goNext()
    }
  }

  function toggleFocus(area: string) {
    setIsRest(false)
    setFocuses((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
    )
  }

  /** Attach a tracker workout: date, duration, type (if unset) and its stats. */
  function applyWorkout(w: HealthWorkout) {
    const d = roundDurationToOptions(w.durationMin)
    setLogDate(workoutLocalDate(w))
    setDurHours(d.hours)
    setDurMinutes(d.minutes)
    setWorkoutType((t) => t || activityToWorkoutType(w.activity))
    setIsRest(false)
    setSessionName((name) => (name === 'Rest' ? '' : name))
    setHealth(workoutToHealthFields(w, healthSource))
  }

  function linkedElsewhere(workoutId: string): boolean {
    return logs.some((l) => l.health_workout_id === workoutId && l.id !== initial?.id)
  }

  function applySplit(p: SplitPattern) {
    if (p.rest) {
      setIsRest(true)
      setFocuses([])
      setSessionName('Rest')
      setWorkoutType('')
      return
    }
    setIsRest(false)
    setFocuses([...p.focuses])
    if (p.type) setWorkoutType(p.type)
    setSessionName((name) => (name === 'Rest' ? '' : name))
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    const looksLikeImage =
      file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(file.name)
    if (!looksLikeImage) {
      setError('Please choose an image file')
      return
    }
    setError(null)
    setCompressing(true)
    try {
      const compressed = await compressImage(file)
      setPhotoFile(compressed)
    } catch (err) {
      setPhotoFile(null)
      setPreview(null)
      setError(err instanceof Error ? err.message : 'Could not process image')
    } finally {
      setCompressing(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function submit() {
    for (let i = 0; i < STEPS.length - 1; i++) {
      const err = validateStep(i)
      if (err) {
        setDir(i < step ? 'back' : 'forward')
        setStep(i)
        setError(err)
        return
      }
    }

    const workout = workoutTitle()
    if (!workout) {
      setStep(1)
      setError('Pick a split, focus areas, or name this session')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await onSave(
        {
          log_date: logDate,
          workout,
          workout_type: isRest ? null : workoutType || null,
          focus_areas: isRest ? null : serializeFocusAreas(focuses),
          duration: durationLabel(),
          meal: meal.trim() || null,
          notes: notes.trim() || null,
          protein_g: parseGrams(protein),
          creatine_g: parseGrams(creatine),
          ...(isRest ? EMPTY_HEALTH_FIELDS : health),
        },
        photoFile,
        removePhoto,
      )
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const titleId = 'log-sheet-title'

  return (
    <Sheet
      open={open}
      onClose={onClose}
      dismissible={!busy && !dirty}
      labelledBy={titleId}
      className="sheet--log"
      scrollRef={bodyRef}
      header={
        <SheetHeader
          title={initial ? 'Edit session' : 'New session'}
          titleId={titleId}
          leading={
            <SheetCancel disabled={busy} confirm={dirty ? 'Discard this session?' : undefined} />
          }
        />
      }
      footer={
        <div className="sheet-footer-actions">
          {!isFirst && (
            <button type="button" className="btn btn-ghost btn-lg" onClick={goBack} disabled={busy}>
              Back
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-lg sheet-footer-main"
            onClick={goNext}
            disabled={busy || compressing}
          >
            {busy ? 'Saving…' : isLast ? (initial ? 'Save changes' : 'Save session') : 'Continue'}
          </button>
        </div>
      }
    >
      <div className="segmented segmented--full sheet-steps" role="tablist" aria-label="Steps">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === step}
            onClick={() => goToStep(i)}
          >
            {s.title}
          </button>
        ))}
      </div>

      {error && (
        <div className="sheet-error" role="alert">
          {error}
        </div>
      )}

      <div key={current.id} className={`sheet-pane${dir === 'back' ? ' sheet-pane--back' : ''}`}>
        <div className="sheet-step-head">
          <h3 className="t-title2">{current.title}</h3>
          <p className="t-subhead">{current.blurb}</p>
        </div>

        {current.id === 'when' && (
          <>
            <div className="sheet-section">
              <div className="list-group">
                <label className="list-row" htmlFor="logDate">
                  <span className="list-row-label">Date</span>
                  <input
                    id="logDate"
                    className="list-row-input"
                    type="date"
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    required
                  />
                </label>
                <div className="list-row" role="group" aria-label="Duration">
                  <span className="list-row-label">Duration</span>
                  <span className="row-inline">
                    <select
                      id="durHours"
                      className="sheet-select num"
                      aria-label="Hours"
                      value={durHours}
                      onChange={(e) => setDurHours(Number(e.target.value))}
                    >
                      {HOUR_OPTIONS.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <span className="list-row-unit">hr</span>
                    <select
                      id="durMinutes"
                      className="sheet-select num"
                      aria-label="Minutes"
                      value={durMinutes}
                      onChange={(e) => setDurMinutes(Number(e.target.value))}
                    >
                      {minuteOptions.map((m) => (
                        <option key={m} value={m}>
                          {String(m).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                    <span className="list-row-unit">min</span>
                  </span>
                </div>
              </div>
              <p className="sheet-hint">
                {durationLabel()
                  ? `Selected: ${durationLabel()}`
                  : 'Optional — leave at 0 if you skip duration'}
              </p>
            </div>

            {!isRest && health.health_workout_id && (
              <div className="sheet-section">
                <div className="sheet-label">From Fitbit</div>
                <div className="list-group">
                  <div className="list-row sheet-workout">
                    <div className="sheet-workout-main">
                      <span>Fitbit workout</span>
                      <WorkoutMetrics fields={health} />
                    </div>
                    <button
                      type="button"
                      className="sheet-icon-btn"
                      aria-label="Detach Fitbit workout"
                      title="Detach"
                      onClick={() => setHealth(EMPTY_HEALTH_FIELDS)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden>
                        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm3.7 12.3a1 1 0 0 1-1.4 1.4L12 13.4l-2.3 2.3a1 1 0 0 1-1.4-1.4l2.3-2.3-2.3-2.3a1 1 0 0 1 1.4-1.4l2.3 2.3 2.3-2.3a1 1 0 0 1 1.4 1.4L13.4 12l2.3 2.3Z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!isRest && !health.health_workout_id && dayWorkouts.length > 0 && (
              <div className="sheet-section">
                <div className="sheet-label">Fitbit workouts on this day</div>
                <div className="list-group">
                  {dayWorkouts.map((w) => {
                    const taken = linkedElsewhere(w.id)
                    const time = new Date(w.start).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                    return (
                      <button
                        key={w.id}
                        type="button"
                        className="list-row sheet-workout"
                        disabled={taken}
                        onClick={() => applyWorkout(w)}
                      >
                        <span className="sheet-workout-main">
                          <span>{w.activity}</span>
                          <span className="sheet-workout-sub">
                            {time} · {w.durationMin} min
                            {w.calories != null ? ` · ${w.calories} kcal` : ''}
                          </span>
                        </span>
                        <span className={`list-row-trail${taken ? ' list-row-trail--muted' : ''}`}>
                          {taken ? 'Logged' : 'Attach'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {current.id === 'train' && (
          <>
            <div className="sheet-section">
              <div className="sheet-label">Quick splits</div>
              <div className="chip-row" role="group" aria-label="Workout splits">
                {suggestions.map((p) => {
                  const active = p.rest
                    ? isRest
                    : !isRest && patternsEqual(focuses, p.focuses) && focuses.length > 0
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`chip chip--button sheet-chip${p.rest ? ' sheet-chip--muted' : ''}`}
                      onClick={() => applySplit(p)}
                      aria-pressed={active}
                    >
                      <span>{p.label}</span>
                      {p.source === 'you' && p.count != null && p.count > 0 && (
                        <span className="sheet-chip__meta">×{p.count}</span>
                      )}
                    </button>
                  )
                })}
              </div>
              <p className="sheet-hint">
                {logs.length > 0
                  ? 'Your patterns first, then common templates'
                  : 'Common splits — personalizes as you log'}
              </p>
            </div>

            {isRest ? (
              <div className="sheet-banner">Rest day — recovery counts. Focus areas skipped.</div>
            ) : (
              <div className="sheet-section">
                <div className="sheet-label">Focus</div>
                <div className="chip-row" role="group" aria-label="Focus areas">
                  {FOCUS_AREAS.map((area) => (
                    <button
                      key={area}
                      type="button"
                      className="chip chip--button sheet-chip"
                      onClick={() => toggleFocus(area)}
                      aria-pressed={focuses.includes(area)}
                    >
                      {area}
                    </button>
                  ))}
                </div>
                {focuses.length > 0 && (
                  <div className="sheet-summary-line">
                    Selected: <strong>{focuses.join(' · ')}</strong>
                  </div>
                )}
              </div>
            )}

            <div className="field">
              <label htmlFor="sessionName">Session name {isRest ? '' : '(optional)'}</label>
              <input
                id="sessionName"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder={
                  isRest
                    ? 'Rest'
                    : focuses.length
                      ? `Defaults to “${formatFocusAreas(serializeFocusAreas(focuses))}”`
                      : 'e.g. Tempo run…'
                }
              />
            </div>

            {!isRest && (
              <div className="sheet-section">
                <div className="sheet-label">Type</div>
                <div className="chip-row" role="group" aria-label="Workout type">
                  {WORKOUT_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="chip chip--button sheet-chip"
                      onClick={() => setWorkoutType(workoutType === t ? '' : t)}
                      aria-pressed={workoutType === t}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {current.id === 'fuel' && (
          <>
            <div className="sheet-section">
              <div className="sheet-label">Protein</div>
              <div className="list-group">
                <label className="list-row" htmlFor="protein">
                  <span className="list-row-label">Amount</span>
                  <input
                    id="protein"
                    className="list-row-input num"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={1}
                    value={protein}
                    onChange={(e) => setProtein(e.target.value)}
                    placeholder="e.g. 40"
                  />
                  <span className="list-row-unit">g</span>
                </label>
              </div>
              <div className="chip-row" style={{ marginTop: 10 }}>
                {PROTEIN_PRESETS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className="chip chip--button sheet-chip sheet-chip--small"
                    aria-pressed={protein === String(g)}
                    onClick={() => setProtein(String(g))}
                  >
                    {g} g
                  </button>
                ))}
              </div>
            </div>

            <div className="sheet-section">
              <div className="sheet-label">Creatine</div>
              <div className="list-group">
                <label className="list-row" htmlFor="creatine">
                  <span className="list-row-label">Amount</span>
                  <input
                    id="creatine"
                    className="list-row-input num"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.5}
                    value={creatine}
                    onChange={(e) => setCreatine(e.target.value)}
                    placeholder="e.g. 5"
                  />
                  <span className="list-row-unit">g</span>
                </label>
              </div>
              <div className="chip-row" style={{ marginTop: 10 }}>
                {CREATINE_PRESETS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className="chip chip--button sheet-chip sheet-chip--small"
                    aria-pressed={creatine === String(g)}
                    onClick={() => setCreatine(String(g))}
                  >
                    {g} g
                  </button>
                ))}
                <button
                  type="button"
                  className="chip chip--button sheet-chip sheet-chip--small sheet-chip--muted"
                  onClick={() => setCreatine('')}
                >
                  Off
                </button>
              </div>
            </div>

            <div className="field">
              <label htmlFor="meal">Meal of the day</label>
              <textarea
                id="meal"
                value={meal}
                onChange={(e) => setMeal(e.target.value)}
                placeholder="What you ate — meals, macros…"
              />
            </div>
            <p className="sheet-hint">All optional — skip if you want.</p>
          </>
        )}

        {current.id === 'proof' && (
          <>
            <div className="field">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="How it felt, PRs, adjustments…"
                style={{ minHeight: 100 }}
              />
            </div>
            <div className="sheet-section">
              <div className="sheet-label">Photo</div>
              {compressing ? (
                <div className="list-group">
                  <div className="list-row" style={{ minHeight: 56 }} role="status">
                    <span className="list-row-label">Compressing…</span>
                    <div className="spinner" style={{ width: 22, height: 22, borderWidth: 2 }} />
                  </div>
                </div>
              ) : !preview ? (
                <div
                  className={`list-group sheet-photo-add${drag ? ' is-drag' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDrag(true)
                  }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDrag(false)
                    void onFile(e.dataTransfer.files[0])
                  }}
                >
                  <div className="list-row">
                    <span className="list-row-label" style={{ color: 'var(--accent-ink)' }}>
                      Add proof photo
                    </span>
                    <span className="list-row-value t-footnote">Compressed to JPEG · max ~1200px</span>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    aria-label="Add proof photo"
                    onChange={(e) => void onFile(e.target.files?.[0])}
                  />
                </div>
              ) : (
                <div className="photo-preview photo-preview--portrait">
                  <img src={preview} alt="Preview" />
                  <button
                    type="button"
                    className="remove"
                    onClick={() => {
                      setPhotoFile(null)
                      setPreview(null)
                      if (initial?.photo_path) setRemovePhoto(true)
                      if (fileRef.current) fileRef.current.value = ''
                    }}
                  >
                    Remove
                  </button>
                  {photoFile && (
                    <div className="photo-size-badge">{(photoFile.size / 1024).toFixed(0)} KB · ready</div>
                  )}
                </div>
              )}
              <p className="sheet-hint">Optional — you can save without a photo.</p>
            </div>
          </>
        )}

        {current.id === 'review' && (
          <>
            <div className="list-group">
              <button type="button" className="list-row list-row--nav" onClick={() => goToStep(0)}>
                <span className="sheet-review-label">When</span>
                <span className="sheet-review-value">
                  {friendlyDate(logDate)}
                  {durationLabel() ? ` · ${durationLabel()}` : ''}
                </span>
              </button>
              {!isRest && health.health_workout_id && (
                <button type="button" className="list-row list-row--nav" onClick={() => goToStep(0)}>
                  <span className="sheet-review-label">Fitbit</span>
                  <span className="sheet-review-value">
                    <WorkoutMetrics fields={health} />
                  </span>
                </button>
              )}
              <button type="button" className="list-row list-row--nav" onClick={() => goToStep(1)}>
                <span className="sheet-review-label">Train</span>
                <span className="sheet-review-value">
                  {workoutTitle() || '—'}
                  {!isRest && workoutType ? ` · ${workoutType}` : ''}
                  {isRest ? ' · Rest' : ''}
                </span>
              </button>
              <button type="button" className="list-row list-row--nav" onClick={() => goToStep(2)}>
                <span className="sheet-review-label">Fuel</span>
                <span className="sheet-review-value">
                  {[
                    formatGrams(parseGrams(protein)) ? `P ${formatGrams(parseGrams(protein))}` : null,
                    formatGrams(parseGrams(creatine)) ? `Cr ${formatGrams(parseGrams(creatine))}` : null,
                    meal.trim() ? 'Meal logged' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Skipped'}
                </span>
              </button>
              <button type="button" className="list-row list-row--nav" onClick={() => goToStep(3)}>
                <span className="sheet-review-label">Proof</span>
                <span className="sheet-review-value">
                  {[notes.trim() ? 'Notes' : null, preview ? 'Photo' : null].filter(Boolean).join(' · ') ||
                    'Skipped'}
                </span>
              </button>
            </div>
            {preview && (
              <div className="review-photo">
                <img src={preview} alt="Proof preview" />
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}
