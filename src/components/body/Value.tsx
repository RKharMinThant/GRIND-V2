/** A stat value with its trailing unit set small and muted: "12.4 km", "86 min". */
export function Value({ text }: { text: string }) {
  const i = text.indexOf(' ')
  if (i < 0) return <span className="body-stat-value num">{text}</span>
  return (
    <span className="body-stat-value num">
      {text.slice(0, i)}
      <small>{text.slice(i + 1)}</small>
    </span>
  )
}
