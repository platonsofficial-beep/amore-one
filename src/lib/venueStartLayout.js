/** Extra space the keyboard covers. Browser chrome alone stays under the threshold. */
export function venueStartKeyboardInset(viewport, layoutHeight) {
  const height = Number(viewport?.height)
  const offsetTop = Number(viewport?.offsetTop) || 0
  const layout = Number(layoutHeight)
  if (!Number.isFinite(height) || !Number.isFinite(layout)) return 0
  const covered = layout - height - offsetTop
  if (covered < 80) return 0
  return Math.round(covered)
}

export function revealVenueStartField(field) {
  if (!field || typeof field.scrollIntoView !== 'function') return
  field.scrollIntoView({ block: 'center', inline: 'nearest' })
}
