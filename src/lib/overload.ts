import type { LiftSet, TrackedLift } from '../types/database'
import { parseSetsDetail } from '../types/database'

export type OverloadStatus = 'up' | 'same' | 'down' | 'new'

export type LiftStatus = {
  status: OverloadStatus
  /** e.g. +2.5 kg, +3 rep, +12% vol */
  deltaLabel: string | null
  /** Short glyph for list rows */
  arrow: '↑' | '↓' | '→' | '·'
}

export type LiftHistoryPoint = {
  id: string
  lift_id: string
  sets_detail: LiftSet[]
  unit: string
  volume: number
  recorded_at: string
}

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '')
}

export function volumeOf(sets: LiftSet[]): number {
  return sets.reduce((sum, s) => sum + s.reps * s.weight, 0)
}

export function totalReps(sets: LiftSet[]): number {
  return sets.reduce((sum, s) => sum + s.reps, 0)
}

export function maxWeight(sets: LiftSet[]): number {
  return sets.reduce((m, s) => Math.max(m, s.weight), 0)
}

function setsEqual(a: LiftSet[], b: LiftSet[]): boolean {
  if (a.length !== b.length) return false
  return a.every((s, i) => s.reps === b[i].reps && s.weight === b[i].weight)
}

/** Resolve current set list from a tracked lift (JSON or legacy scalars). */
export function getLiftSets(lift: TrackedLift): LiftSet[] {
  return parseSetsDetail(lift.sets_detail, {
    sets: lift.sets,
    reps: lift.reps,
    weight: Number(lift.weight),
  })
}

export function getPrevLiftSets(lift: TrackedLift): LiftSet[] | null {
  if (lift.prev_sets_detail && Array.isArray(lift.prev_sets_detail) && lift.prev_sets_detail.length) {
    return parseSetsDetail(lift.prev_sets_detail)
  }
  if (lift.prev_sets != null && lift.prev_reps != null && lift.prev_weight != null) {
    return parseSetsDetail(null, {
      sets: lift.prev_sets,
      reps: lift.prev_reps,
      weight: Number(lift.prev_weight),
    })
  }
  return null
}

/**
 * Compact prescription for list / summary.
 * Uniform weight: `15 · 12 · 10 @ 60kg`
 * Mixed weight: `15@60 · 12@60 · 10@55kg`
 */
export function formatSetsDetail(sets: LiftSet[], unit: string): string {
  if (!sets.length) return '—'
  const u = unit || 'kg'
  const allSameWeight = sets.every((s) => s.weight === sets[0].weight)
  const allSameReps = sets.every((s) => s.reps === sets[0].reps)

  if (allSameReps && allSameWeight) {
    const w = sets[0].weight
    const wLabel = Number.isInteger(w) ? String(w) : String(w)
    if (w > 0) return `${sets.length}×${sets[0].reps} @ ${wLabel}${u}`
    return `${sets.length}×${sets[0].reps}`
  }

  if (allSameWeight) {
    const repsPart = sets.map((s) => s.reps).join(' · ')
    const w = sets[0].weight
    if (w > 0) {
      const wLabel = Number.isInteger(w) ? String(w) : String(w)
      return `${repsPart} @ ${wLabel}${u}`
    }
    return repsPart
  }

  return (
    sets
      .map((s) => {
        const wLabel = Number.isInteger(s.weight) ? String(s.weight) : String(s.weight)
        return s.weight > 0 ? `${s.reps}@${wLabel}` : `${s.reps}`
      })
      .join(' · ') + u
  )
}

export function formatLiftLine(
  lift:
    | TrackedLift
    | { sets: number; reps: number; weight: number; unit: string; sets_detail?: LiftSet[] },
): string {
  if ('sets_detail' in lift || 'muscle_group' in (lift as TrackedLift)) {
    const t = lift as TrackedLift
    const detail = getLiftSets(t)
    if (detail.length) return formatSetsDetail(detail, t.unit || 'kg')
  }
  const s = lift as { sets: number; reps: number; weight: number; unit: string }
  const w = Number(s.weight)
  const wLabel = Number.isInteger(w) ? String(w) : String(w)
  if (w > 0) return `${s.sets}×${s.reps} @ ${wLabel}${s.unit}`
  return `${s.sets}×${s.reps}`
}

/** Prefer specific signals (weight → reps → sets → volume %) for readable badges. */
export function compareTrackedLift(lift: TrackedLift): LiftStatus {
  const current = getLiftSets(lift)
  const previous = getPrevLiftSets(lift)

  if (!previous || !previous.length || !current.length) {
    return { status: 'new', deltaLabel: 'New', arrow: '·' }
  }
  if (setsEqual(current, previous)) {
    return { status: 'same', deltaLabel: 'Hold', arrow: '→' }
  }

  const unit = lift.unit || 'kg'
  const vol = volumeOf(current)
  const prevVol = volumeOf(previous)
  const maxW = maxWeight(current)
  const prevMaxW = maxWeight(previous)
  const reps = totalReps(current)
  const prevRepsTotal = totalReps(previous)

  // Weight first — clearest progressive overload signal
  if (maxW > prevMaxW) {
    return {
      status: 'up',
      deltaLabel: `+${trimNum(maxW - prevMaxW)} ${unit}`,
      arrow: '↑',
    }
  }
  if (maxW < prevMaxW) {
    return {
      status: 'down',
      deltaLabel: `−${trimNum(prevMaxW - maxW)} ${unit}`,
      arrow: '↓',
    }
  }

  if (reps > prevRepsTotal) {
    return {
      status: 'up',
      deltaLabel: `+${reps - prevRepsTotal} rep`,
      arrow: '↑',
    }
  }
  if (reps < prevRepsTotal) {
    return {
      status: 'down',
      deltaLabel: `−${prevRepsTotal - reps} rep`,
      arrow: '↓',
    }
  }

  if (current.length > previous.length) {
    return {
      status: 'up',
      deltaLabel: `+${current.length - previous.length} set`,
      arrow: '↑',
    }
  }
  if (current.length < previous.length) {
    return {
      status: 'down',
      deltaLabel: `−${previous.length - current.length} set`,
      arrow: '↓',
    }
  }

  if (vol > prevVol && prevVol > 0) {
    const pct = Math.round(((vol - prevVol) / prevVol) * 100)
    return {
      status: 'up',
      deltaLabel: pct >= 1 ? `+${pct}% vol` : 'Vol up',
      arrow: '↑',
    }
  }
  if (vol < prevVol) {
    const pct = prevVol > 0 ? Math.round(((prevVol - vol) / prevVol) * 100) : 0
    return {
      status: 'down',
      deltaLabel: pct >= 1 ? `−${pct}% vol` : 'Vol down',
      arrow: '↓',
    }
  }

  return { status: 'same', deltaLabel: 'Hold', arrow: '→' }
}

export function compareSetsDetail(
  current: LiftSet[],
  previous: LiftSet[] | null,
  unit: string,
): LiftStatus {
  if (!previous?.length || !current.length) {
    return { status: 'new', deltaLabel: 'New', arrow: '·' }
  }
  // Fake a minimal TrackedLift-shaped compare via inline logic
  const lift = {
    sets_detail: current,
    prev_sets_detail: previous,
    unit,
    sets: current.length,
    reps: current[0]?.reps ?? 0,
    weight: current[0]?.weight ?? 0,
    prev_sets: previous.length,
    prev_reps: previous[0]?.reps ?? 0,
    prev_weight: previous[0]?.weight ?? 0,
  } as TrackedLift
  return compareTrackedLift(lift)
}
