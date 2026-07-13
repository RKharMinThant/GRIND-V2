import { useEffect, useMemo, useRef, useState } from 'react'
import { usePresence } from '../hooks/usePresence'
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

type Props = {
  open: boolean
  initial?: Log | null
  defaultDate?: string
  existingPhotoUrl?: string
  logs?: Log[]
  onClose: () => void
  onSave: (data: LogInsert, photoFile: File | null, removePhoto: boolean) => Promise<void>
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
  initial,
  defaultDate,
  existingPhotoUrl,
  logs = [],
  onClose,
  onSave,
}: Props) {
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
  const fileRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const { mounted, visible } = usePresence(open, 380)

  const suggestions = useMemo(() => suggestSplits(logs, 9), [logs])
  const current = STEPS[step] ?? STEPS[0]
  const isLast = step === STEPS.length - 1
  const isFirst = step === 0

  /** Keep minutes options including a parsed non-standard value when editing. */
  const minuteOptions = useMemo(() => {
    if ((MINUTE_OPTIONS as readonly number[]).includes(durMinutes)) {
      return MINUTE_OPTIONS as number[]
    }
    return [...MINUTE_OPTIONS, durMinutes].sort((a, b) => a - b)
  }, [durMinutes])

  useEffect(() => {
    if (!open) return
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
    }
    setPhotoFile(null)
    setCompressing(false)
    setError(null)
    setBusy(false)
  }, [open, initial, existingPhotoUrl, defaultDate])

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

  // Hooks must run every render — only then can we bail out of painting
  if (!mounted) return null

  function toggleFocus(area: string) {
    setIsRest(false)
    setFocuses((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
    )
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

  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <div
      className={`overlay ${visible ? 'is-visible' : 'is-closing'}`}
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && visible) onClose()
      }}
    >
      <div className="sheet sheet--log sheet--wizard">
        <div className="sheet-header sheet-header--wizard">
          <div>
            <div className="wizard-kicker">
              {initial ? 'Edit' : 'New'} · Step {step + 1} of {STEPS.length}
            </div>
            <div className="sheet-title">{current.title}</div>
            <p className="wizard-blurb">{current.blurb}</p>
          </div>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="wizard-progress" aria-hidden>
          <div className="wizard-progress-bar" style={{ width: `${progress}%` }} />
        </div>

        <div className="wizard-steps" role="tablist" aria-label="Steps">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === step}
              className={`wizard-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
              onClick={() => goToStep(i)}
              title={s.title}
            >
              <span className="wizard-dot-n">{i + 1}</span>
              <span className="wizard-dot-label">{s.title}</span>
            </button>
          ))}
        </div>

        <div ref={bodyRef} className="sheet-body sheet-body--flat wizard-body">
          {error && <div className="auth-error">{error}</div>}

          <div
            key={current.id}
            className={`wizard-pane wizard-pane--${dir}`}
          >
            {current.id === 'when' && (
              <>
                <div className="field">
                  <label htmlFor="logDate">Date</label>
                  <input
                    id="logDate"
                    type="date"
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label>Duration</label>
                  <div className="duration-pickers">
                    <div className="duration-pick">
                      <select
                        id="durHours"
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
                      <span className="duration-unit">hr</span>
                    </div>
                    <div className="duration-pick">
                      <select
                        id="durMinutes"
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
                      <span className="duration-unit">min</span>
                    </div>
                  </div>
                  <p className="field-hint">
                    {durationLabel()
                      ? `Selected: ${durationLabel()}`
                      : 'Optional — leave at 0 if you skip duration'}
                  </p>
                </div>
              </>
            )}

            {current.id === 'train' && (
              <>
                <div className="field">
                  <label>Quick splits</label>
                  <p className="field-hint">
                    {logs.length > 0
                      ? 'Your patterns first, then common templates'
                      : 'Common splits — personalizes as you log'}
                  </p>
                  <div className="split-row" role="group" aria-label="Workout splits">
                    {suggestions.map((p) => {
                      const active = p.rest
                        ? isRest
                        : !isRest && patternsEqual(focuses, p.focuses) && focuses.length > 0
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className={`split-chip ${active ? 'selected' : ''} ${
                            p.rest ? 'split-chip--rest' : ''
                          } ${p.source === 'you' ? 'split-chip--you' : ''}`}
                          onClick={() => applySplit(p)}
                          aria-pressed={active}
                        >
                          <span className="split-chip-label">{p.label}</span>
                          {p.source === 'you' && p.count != null && p.count > 0 && (
                            <span className="split-chip-meta">×{p.count}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {isRest ? (
                  <div className="rest-banner">
                    Rest day — recovery counts. Focus areas skipped.
                  </div>
                ) : (
                  <div className="field">
                    <label>Focus</label>
                    <div className="focus-grid" role="group" aria-label="Focus areas">
                      {FOCUS_AREAS.map((area) => (
                        <button
                          key={area}
                          type="button"
                          className={`focus-btn ${focuses.includes(area) ? 'selected' : ''}`}
                          onClick={() => toggleFocus(area)}
                          aria-pressed={focuses.includes(area)}
                        >
                          {area}
                        </button>
                      ))}
                    </div>
                    {focuses.length > 0 && (
                      <div className="focus-summary">
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
                  <div className="field">
                    <label>Type</label>
                    <div className="type-grid" role="group" aria-label="Workout type">
                      {WORKOUT_TYPES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`type-btn ${workoutType === t ? 'selected' : ''}`}
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
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="protein">Protein (g)</label>
                    <input
                      id="protein"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={1}
                      value={protein}
                      onChange={(e) => setProtein(e.target.value)}
                      placeholder="e.g. 40"
                    />
                    <div className="preset-row">
                      {PROTEIN_PRESETS.map((g) => (
                        <button
                          key={g}
                          type="button"
                          className={`preset-btn ${protein === String(g) ? 'selected' : ''}`}
                          onClick={() => setProtein(String(g))}
                        >
                          {g}g
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="creatine">Creatine (g)</label>
                    <input
                      id="creatine"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.5}
                      value={creatine}
                      onChange={(e) => setCreatine(e.target.value)}
                      placeholder="e.g. 5"
                    />
                    <div className="preset-row">
                      {CREATINE_PRESETS.map((g) => (
                        <button
                          key={g}
                          type="button"
                          className={`preset-btn ${creatine === String(g) ? 'selected' : ''}`}
                          onClick={() => setCreatine(String(g))}
                        >
                          {g}g
                        </button>
                      ))}
                      <button type="button" className="preset-btn" onClick={() => setCreatine('')}>
                        Off
                      </button>
                    </div>
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
                <p className="field-hint">All optional — skip if you want.</p>
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
                <div className="field">
                  <label>Photo</label>
                  {compressing ? (
                    <div className="photo-drop photo-drop--busy">
                      <div className="spinner" style={{ width: 28, height: 28, margin: '0 auto 10px' }} />
                      <div style={{ fontWeight: 700 }}>Compressing…</div>
                    </div>
                  ) : !preview ? (
                    <div
                      className={`photo-drop ${drag ? 'drag' : ''}`}
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
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => void onFile(e.target.files?.[0])}
                      />
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Add proof photo</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--muted-2)' }}>
                        Compressed to JPEG · max ~1200px
                      </div>
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
                        <div className="photo-size-badge">
                          {(photoFile.size / 1024).toFixed(0)} KB · ready
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className="field-hint">Optional — you can save without a photo.</p>
              </>
            )}

            {current.id === 'review' && (
              <div className="review-card">
                <button type="button" className="review-row" onClick={() => goToStep(0)}>
                  <span className="review-label">When</span>
                  <span className="review-value">
                    {friendlyDate(logDate)}
                    {durationLabel() ? ` · ${durationLabel()}` : ''}
                  </span>
                  <span className="review-edit">Edit</span>
                </button>
                <button type="button" className="review-row" onClick={() => goToStep(1)}>
                  <span className="review-label">Train</span>
                  <span className="review-value">
                    {workoutTitle() || '—'}
                    {!isRest && workoutType ? ` · ${workoutType}` : ''}
                    {isRest ? ' · Rest' : ''}
                  </span>
                  <span className="review-edit">Edit</span>
                </button>
                <button type="button" className="review-row" onClick={() => goToStep(2)}>
                  <span className="review-label">Fuel</span>
                  <span className="review-value">
                    {[
                      formatGrams(parseGrams(protein)) ? `P ${formatGrams(parseGrams(protein))}` : null,
                      formatGrams(parseGrams(creatine))
                        ? `Cr ${formatGrams(parseGrams(creatine))}`
                        : null,
                      meal.trim() ? 'Meal logged' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Skipped'}
                  </span>
                  <span className="review-edit">Edit</span>
                </button>
                <button type="button" className="review-row" onClick={() => goToStep(3)}>
                  <span className="review-label">Proof</span>
                  <span className="review-value">
                    {[notes.trim() ? 'Notes' : null, preview ? 'Photo' : null]
                      .filter(Boolean)
                      .join(' · ') || 'Skipped'}
                  </span>
                  <span className="review-edit">Edit</span>
                </button>
                {preview && (
                  <div className="review-photo">
                    <img src={preview} alt="Proof preview" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="wizard-footer">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={goBack}
            disabled={busy}
          >
            {isFirst ? 'Cancel' : '← Back'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={goNext}
            disabled={busy || compressing}
          >
            {busy ? 'Saving…' : isLast ? (initial ? 'Save changes' : 'Save session →') : 'Continue →'}
          </button>
        </div>
      </div>
    </div>
  )
}
