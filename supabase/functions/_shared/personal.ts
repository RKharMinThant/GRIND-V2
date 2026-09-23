// The personal touch on notifications: "Andy, rest day today?" rather than a generic line.

/** Longer than this is almost certainly not a first name (an email prefix, say). */
const MAX_NAME_LENGTH = 20

/** First word of the display name, exactly as the user typed it, or null if unusable. */
export function firstName(displayName: string | null | undefined): string | null {
  const first = displayName?.trim().split(/\s+/)[0] ?? ''
  if (!first || first.length > MAX_NAME_LENGTH) return null
  return first
}

/** The named form when there is a name, otherwise the plain one — never a blank. */
export function personal(name: string | null, withName: (name: string) => string, withoutName: string): string {
  return name ? withName(name) : withoutName
}
