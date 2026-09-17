/** Chart color roles → CSS classes (colors live in global.css and follow the theme). */
export type Tone = 'accent' | 'accent-soft' | 'ice' | 'ice-soft' | 'danger' | 'rem' | 'muted'

export const toneClass = (tone: Tone) => `tone-${tone}`
