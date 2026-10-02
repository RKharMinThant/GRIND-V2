/** Chart color roles → CSS classes (colors live in the style files and follow the theme). */
export type Tone =
  | 'accent'
  | 'accent-soft'
  | 'ice'
  | 'ice-soft'
  | 'danger'
  | 'rem'
  | 'muted'
  | 'heart'
  | 'sleep'
  | 'strength'
  | 'activity'
  | 'warn'

export const toneClass = (tone: Tone) => `tone-${tone}`

/** Metric colours a progress ring can take (mapped to --accent-ink / --c-* / --warn / --danger). */
export type RingTone = 'accent' | 'heart' | 'sleep' | 'strength' | 'activity' | 'warn' | 'danger'
