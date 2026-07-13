import type { Log } from '../types/database'
import { parseFocusAreas } from '../types/database'

export type SplitPattern = {
  id: string
  label: string
  focuses: string[]
  type?: string | null
  /** Rest day — no focus required */
  rest?: boolean
  /** From user's history frequency */
  count?: number
  source: 'you' | 'common'
}

/** Classic splits people run — used as defaults + fallbacks */
export const COMMON_SPLITS: SplitPattern[] = [
  {
    id: 'push',
    label: 'Push',
    focuses: ['Chest', 'Shoulders', 'Triceps'],
    type: 'Strength',
    source: 'common',
  },
  {
    id: 'pull',
    label: 'Pull',
    focuses: ['Back', 'Biceps'],
    type: 'Strength',
    source: 'common',
  },
  {
    id: 'legs',
    label: 'Legs',
    focuses: ['Legs', 'Quads', 'Hamstrings', 'Glutes'],
    type: 'Strength',
    source: 'common',
  },
  {
    id: 'chest-tri',
    label: 'Chest · Triceps',
    focuses: ['Chest', 'Triceps'],
    type: 'Strength',
    source: 'common',
  },
  {
    id: 'back-bi',
    label: 'Back · Biceps',
    focuses: ['Back', 'Biceps'],
    type: 'Strength',
    source: 'common',
  },
  {
    id: 'shoulder-legs',
    label: 'Shoulders · Legs',
    focuses: ['Shoulders', 'Legs'],
    type: 'Strength',
    source: 'common',
  },
  {
    id: 'upper',
    label: 'Upper',
    focuses: ['Chest', 'Back', 'Shoulders', 'Arms'],
    type: 'Strength',
    source: 'common',
  },
  {
    id: 'full',
    label: 'Full Body',
    focuses: ['Full Body'],
    type: 'Strength',
    source: 'common',
  },
  {
    id: 'rest',
    label: 'Rest',
    focuses: [],
    type: null,
    rest: true,
    source: 'common',
  },
]

function patternKey(focuses: string[]): string {
  return [...focuses].map((f) => f.trim()).filter(Boolean).sort().join('|')
}

function labelFromFocuses(focuses: string[]): string {
  if (!focuses.length) return 'Rest'
  if (focuses.length <= 3) return focuses.join(' · ')
  return `${focuses.slice(0, 2).join(' · ')} +${focuses.length - 2}`
}

/**
 * Suggest splits: user's most-used focus combos first, then common templates.
 */
export function suggestSplits(logs: Log[], limit = 8): SplitPattern[] {
  const counts = new Map<string, { focuses: string[]; type: string | null; n: number }>()

  for (const log of logs) {
    const focuses = parseFocusAreas(log.focus_areas)
    // Skip pure free-text sessions without structured focus
    if (!focuses.length) {
      const w = log.workout?.trim().toLowerCase()
      if (w === 'rest' || w === 'rest day') {
        const key = '__rest__'
        const cur = counts.get(key) ?? { focuses: [], type: null, n: 0 }
        cur.n += 1
        counts.set(key, cur)
      }
      continue
    }
    const key = patternKey(focuses)
    const cur = counts.get(key) ?? {
      focuses: [...focuses].sort(),
      type: log.workout_type,
      n: 0,
    }
    cur.n += 1
    if (!cur.type && log.workout_type) cur.type = log.workout_type
    counts.set(key, cur)
  }

  const fromYou: SplitPattern[] = [...counts.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 5)
    .map(([key, v]) => {
      if (key === '__rest__') {
        return {
          id: 'you-rest',
          label: 'Rest',
          focuses: [],
          type: null,
          rest: true,
          count: v.n,
          source: 'you' as const,
        }
      }
      return {
        id: `you-${key}`,
        label: labelFromFocuses(v.focuses),
        focuses: v.focuses,
        type: v.type,
        count: v.n,
        source: 'you' as const,
      }
    })

  const youKeys = new Set(
    fromYou.map((p) => (p.rest ? '__rest__' : patternKey(p.focuses))),
  )

  const fromCommon = COMMON_SPLITS.filter((p) => {
    const k = p.rest ? '__rest__' : patternKey(p.focuses)
    return !youKeys.has(k)
  })

  // Prefer: your patterns, then common, cap list
  const merged = [...fromYou, ...fromCommon]
  // Always keep Rest available near the end if not already first-class
  if (!merged.some((p) => p.rest)) {
    merged.push(COMMON_SPLITS.find((p) => p.rest)!)
  }

  return merged.slice(0, limit)
}

export function patternsEqual(a: string[], b: string[]): boolean {
  return patternKey(a) === patternKey(b)
}
